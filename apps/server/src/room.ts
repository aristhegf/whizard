import { DurableObject } from "cloudflare:workers";
import { drawContent } from "@whizard/content";
import {
  applyGameAction,
  configureGame,
  configureRoom,
  createRoomState,
  gameModule,
  gameViewFor,
  isExpired,
  joinRoom,
  leaveRoom,
  markDisconnected,
  markRecorded,
  phaseOf,
  nextDeadline,
  randomSeed,
  randomToken,
  returnToLobby,
  settle,
  startGame,
  tickGame,
  toSnapshot,
  unrecordedResult,
  type AccountIdentity,
  type ConnectedIds,
  type GameError,
  type GameResult,
  type JoinError,
  type Player,
  type RoomState,
} from "@whizard/game-core";
import {
  AVATAR_IDS,
  CloseCode,
  ErrorCode,
  PROTOCOL_VERSION,
  encode,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "@whizard/protocol";
import type { Env } from "./env";
import { count } from "./analytics";
import { recordMatch } from "./matches";

const STATE_KEY = "room";
const OPEN = 1;

/** Set by the Worker after it checks the sign-in cookie. Never taken from the client. */
export const ACCOUNT_HEADER = "X-Whizard-Account";

interface SocketAttachment {
  /** null until the socket joins as a player. */
  playerId: string | null;
  account: AccountIdentity | null;
}

const JOIN_ERROR_MESSAGES: Record<JoinError, string> = {
  nickname_invalid: "Pick a nickname between 1 and 20 characters.",
  nickname_taken: "Someone in this room already has that nickname.",
  room_full: "This room is full.",
};

const GAME_ERROR_MESSAGES: Record<GameError, string> = {
  not_host: "Only the host can do that.",
  bad_settings: "Those settings aren’t available.",
  not_enough_players: "You need more players to start this game.",
  game_in_progress: "A game is already running.",
  no_game: "There’s no game running.",
  no_content: "There aren’t any questions for those settings yet.",
  bad_action: "That move isn’t allowed right now.",
};

/**
 * One instance per room code, holding the authoritative room state. Uses the WebSocket
 * hibernation API so rooms aren’t billed while they wait for messages.
 */
export class Room extends DurableObject<Env> {
  private cached: RoomState | null | undefined;

  /**
   * Claims this room for a newly generated code, optionally with game settings picked before
   * the room existed (such as a topic). Returns false if the code is already in use.
   */
  async create(code: string, gameSettings?: unknown): Promise<boolean> {
    if (await this.load()) return false;
    const state = createRoomState(code, Date.now());
    const game = gameModule(state.game.id).settingsSchema.safeParse({
      ...(state.game.settings as object),
      ...(typeof gameSettings === "object" ? gameSettings : {}),
    });
    await this.save(
      game.success ? { ...state, game: { ...state.game, settings: game.data } } : state,
    );
    return true;
  }

  /** Whether the room still exists, for the "return to your room" bar. */
  async status(): Promise<{ phase: "lobby" | "playing" | "finished"; online: number } | null> {
    const state = await this.current(Date.now());
    if (!state) return null;
    return { phase: phaseOf(state), online: this.connectedIds().size };
  }

  override async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      playerId: null,
      account: parseAccount(request.headers.get(ACCOUNT_HEADER)),
    } satisfies SocketAttachment);
    if (!(await this.load())) this.rejectMissingRoom(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) {
      sendError(ws, ErrorCode.BadMessage, "Message was not understood.");
      return;
    }

    switch (message.type) {
      case "ping":
        send(ws, { type: "pong", t: message.t, serverTime: Date.now() });
        return;
      case "join":
        await this.handleJoin(ws, message);
        return;
      case "leave":
        await this.handleLeave(ws);
        return;
      case "roomSettings":
        await this.handleGame(ws, (state, playerId) => {
          const result = configureRoom(state, playerId, withoutUndefined(message.settings));
          return result.ok ? result : { ok: false, error: result.error };
        });
        return;
      case "configure":
        await this.handleGame(ws, (state, playerId) =>
          configureGame(state, playerId, message.settings),
        );
        return;
      case "start":
        if (
          await this.handleGame(ws, (state, playerId, now) =>
            startGame(state, playerId, this.connectedIds(), now, randomSeed(), drawContent),
          )
        ) {
          await count(this.env, { games_started: 1 });
        }
        return;
      case "action":
        await this.handleGame(ws, (state, playerId, now) =>
          applyGameAction(state, playerId, message.action, now),
        );
        return;
      case "backToLobby":
        await this.handleGame(ws, (state, playerId) => returnToLobby(state, playerId));
        return;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const state = await this.current(now);
    if (!state) return;
    const connected = this.connectedIds();

    if (isExpired(state, connected, now)) {
      for (const ws of this.ctx.getWebSockets()) ws.close(CloseCode.RoomExpired, "Room expired");
      this.cached = null;
      await this.ctx.storage.deleteAll();
      return;
    }

    await this.commit(settle(state, connected, now));
  }

  private async handleJoin(ws: WebSocket, message: Extract<ClientMessage, { type: "join" }>) {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      sendError(
        ws,
        ErrorCode.OutdatedClient,
        "Whizard has been updated. Refresh the page to keep playing.",
      );
      ws.close(CloseCode.OutdatedClient, "Outdated client");
      return;
    }
    const now = Date.now();
    const state = await this.current(now);
    if (!state) {
      this.rejectMissingRoom(ws);
      return;
    }
    const attachment = attachmentOf(ws);
    if (attachment?.playerId) return;
    const account = attachment?.account ?? null;

    const avatar = (AVATAR_IDS as readonly string[]).includes(message.avatar ?? "")
      ? message.avatar
      : undefined;
    const result = joinRoom(
      state,
      { ...message, avatar, account },
      this.connectedIds(),
      now,
      () => ({
        id: randomToken(9),
        sessionToken: randomToken(24),
      }),
    );
    if (!result.ok) {
      sendError(ws, result.error, JOIN_ERROR_MESSAGES[result.error]);
      return;
    }

    for (const other of this.socketsFor(result.player.id)) {
      other.serializeAttachment(null);
      other.close(CloseCode.Replaced, "Opened somewhere else");
    }
    ws.serializeAttachment({ playerId: result.player.id, account } satisfies SocketAttachment);
    await this.commit(result.state, { ws, player: result.player });
  }

  private async handleLeave(ws: WebSocket) {
    const playerId = attachmentOf(ws)?.playerId;
    const now = Date.now();
    const state = await this.current(now);
    if (!playerId || !state) {
      sendError(ws, ErrorCode.NotJoined, "You haven’t joined this room.");
      return;
    }
    ws.serializeAttachment(null);
    await this.commit(leaveRoom(state, playerId, this.connectedIds(), now));
    ws.close(1000, "Left the room");
  }

  private async handleDisconnect(ws: WebSocket) {
    const playerId = attachmentOf(ws)?.playerId;
    const now = Date.now();
    const state = await this.current(now);
    if (!playerId || !state) return;
    ws.serializeAttachment(null);
    await this.commit(markDisconnected(state, playerId, this.connectedIds(), now));
  }

  /** Applies a game change from a player. Returns whether it was accepted. */
  private async handleGame(
    ws: WebSocket,
    apply: (state: RoomState, playerId: string, now: number) => GameResult,
  ): Promise<boolean> {
    const playerId = attachmentOf(ws)?.playerId;
    const now = Date.now();
    const state = await this.current(now);
    if (!playerId || !state) {
      sendError(ws, ErrorCode.NotJoined, "You haven’t joined this room.");
      return false;
    }
    const result = apply(state, playerId, now);
    if (!result.ok) {
      sendError(ws, result.error, result.message ?? GAME_ERROR_MESSAGES[result.error]);
      return false;
    }
    await this.commit(result.state);
    return true;
  }

  /**
   * Saves the state, reschedules the alarm, then sends everyone the room snapshot and their
   * own view of the game. A newly joined player gets their welcome first. A game that has just
   * finished is saved to match history once everyone has their results.
   */
  private async commit(next: RoomState, joined?: { ws: WebSocket; player: Player }) {
    const result = unrecordedResult(next);
    const state = result ? markRecorded(next) : next;
    await this.save(state);
    const snapshot = toSnapshot(state, this.connectedIds());
    if (joined) {
      send(joined.ws, {
        type: "welcome",
        playerId: joined.player.id,
        sessionToken: joined.player.sessionToken,
        room: snapshot,
        serverTime: Date.now(),
      });
    }

    const roomMessage = encode({ type: "room", room: snapshot });
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = attachmentOf(ws)?.playerId;
      if (!playerId || ws.readyState !== OPEN) continue;
      if (ws !== joined?.ws) ws.send(roomMessage);
      if (state.session) send(ws, { type: "game", view: gameViewFor(state, playerId) });
    }

    if (result) {
      const { summary } = result;
      await count(this.env, {
        games_finished: 1,
        game_players: summary.players.length,
        [`game:${result.gameId}`]: 1,
        ...(summary.category ? { [`topic:${summary.category}`]: 1 } : {}),
        ...(summary.mode ? { [`mode:${summary.mode}`]: 1 } : {}),
      });
      try {
        await recordMatch(this.env, result, Date.now());
      } catch (error) {
        // History is a nice-to-have: a failed write must never break the room.
        console.error("Couldn’t record match", error);
      }
    }
  }

  /** The room state with the game clock brought up to date. */
  private async current(now: number): Promise<RoomState | null> {
    const state = await this.load();
    return state && tickGame(state, now);
  }

  private async load(): Promise<RoomState | null> {
    if (this.cached === undefined) {
      this.cached = (await this.ctx.storage.get<RoomState>(STATE_KEY)) ?? null;
    }
    return this.cached;
  }

  private async save(state: RoomState) {
    this.cached = state;
    await this.ctx.storage.put(STATE_KEY, state);
    const deadline = nextDeadline(state, this.connectedIds());
    if (deadline === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(deadline);
  }

  private connectedIds(): ConnectedIds {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = attachmentOf(ws)?.playerId;
      if (playerId && ws.readyState === OPEN) ids.add(playerId);
    }
    return ids;
  }

  private socketsFor(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => attachmentOf(ws)?.playerId === playerId);
  }

  private rejectMissingRoom(ws: WebSocket) {
    sendError(ws, ErrorCode.RoomNotFound, "This room doesn’t exist or has expired.");
    ws.close(CloseCode.RoomNotFound, "Room not found");
  }
}

function withoutUndefined<T extends object>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

function parseAccount(header: string | null): AccountIdentity | null {
  if (!header) return null;
  try {
    const value = JSON.parse(header) as Partial<AccountIdentity>;
    return typeof value.userId === "string" && typeof value.username === "string"
      ? { userId: value.userId, username: value.username }
      : null;
  } catch {
    return null;
  }
}

function attachmentOf(ws: WebSocket): SocketAttachment | null {
  return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(encode(message));
}

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { type: "error", code, message });
}
