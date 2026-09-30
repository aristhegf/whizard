import { DurableObject } from "cloudflare:workers";
import { drawContent } from "@whizard/content";
import {
  applyGameAction,
  chooseGame,
  configureGame,
  configureRoom,
  createRoomState,
  defaultGameConfig,
  gameModule,
  gameViewFor,
  isExpired,
  isGameId,
  joinRoom,
  leaveRoom,
  markDisconnected,
  markRecorded,
  MAX_PLAYERS,
  normalizeNickname,
  phaseOf,
  quitGame,
  rejoinGame,
  nextDeadline,
  photoPicture,
  randomSeed,
  randomToken,
  returnToLobby,
  roomSettings,
  sameNickname,
  settle,
  startGame,
  tickGame,
  toSnapshot,
  unrecordedResult,
  updatePlayer,
  type AccountIdentity,
  type ConnectedIds,
  type ContentRequest,
  type GameError,
  type GameId,
  type GameResult,
  type JoinError,
  type Player,
  type ProfileError,
  type RoomState,
} from "@whizard/game-core";
import {
  CloseCode,
  ErrorCode,
  PROTOCOL_VERSION,
  encode,
  isAvatarValue,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "@whizard/protocol";
import type { Env } from "./env";
import { count, logActivity, recordPlayerDays, sizeBucket } from "./analytics";
import { loadBank, recordQuestionStats } from "./bank";
import { GAME_OFF_MESSAGE, newRoomSettings, TOPIC_OFF_MESSAGE, topicOf } from "./gameRules";
import { liveRoomOf, removeLiveRoom, saveLiveRoom } from "./liveRooms";
import { recordMatch } from "./matches";
import { NAME_BLOCKED_MESSAGE, recordName, refusedName } from "./moderation";
import { retiredQuestions } from "./reports";
import { loadSeen, recordSeen, viewerKey } from "./seen";
import { siteSettings } from "./settings";

const STATE_KEY = "room";
/** The host's jigsaw photo, if they've brought one. Deleted with the room. */
const PHOTO_KEY = "photo";

interface StoredPhoto {
  id: string;
  type: string;
  data: ArrayBuffer;
}

export type PhotoResult =
  { ok: true; id: string } | { ok: false; status: number; error: string; message: string };
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

const PROFILE_ERROR_MESSAGES: Record<ProfileError, string> = {
  nickname_invalid: JOIN_ERROR_MESSAGES.nickname_invalid,
  nickname_taken: JOIN_ERROR_MESSAGES.nickname_taken,
  game_in_progress: "You can change your name once this game is over.",
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

/** What a player's history of seen content is kept under: the quiz topic, or the game. */
function historyCategory(request: ContentRequest): string {
  if (request.kind === "quiz-questions") return request.category;
  return request.kind === "connections-puzzle" ? "connections" : "word-rush";
}

/**
 * One instance per room code, holding the authoritative room state. Uses the WebSocket
 * hibernation API so rooms aren’t billed while they wait for messages.
 */
export class Room extends DurableObject<Env> {
  private cached: RoomState | null | undefined;
  /** What was last written to the admin rooms list, so unchanged rooms aren't rewritten. */
  private listed: string | undefined;

  /**
   * Claims this room for a newly generated code, for a game, optionally with settings picked
   * before the room existed (such as a topic). Returns false if the code is already in use.
   */
  async create(code: string, gameSettings?: unknown, gameId: GameId = "quiz"): Promise<boolean> {
    if (await this.load()) return false;
    const state = { ...createRoomState(code, Date.now()), game: defaultGameConfig(gameId) };
    const settings = newRoomSettings(state, await siteSettings(this.env), gameSettings);
    await this.save({ ...state, game: { ...state.game, settings } });
    return true;
  }

  /**
   * Whether the room still exists, for the "return to your room" bar, and whether it has room
   * for someone new, for the room code box.
   */
  async status(): Promise<{
    phase: "lobby" | "playing" | "finished";
    online: number;
    full: boolean;
  } | null> {
    const state = await this.current(Date.now());
    if (!state) return null;
    const settings = roomSettings(state);
    return {
      phase: phaseOf(state),
      online: this.connectedIds().size,
      full: state.players.length >= Math.min(settings.maxPlayers, MAX_PLAYERS),
    };
  }

  /**
   * The host's own photo for a jigsaw: kept with the room, and chosen as the picture. Only the
   * host can set it, between games, and only while the room is playing Jigsaw.
   */
  async setPhoto(sessionToken: string, type: string, data: ArrayBuffer): Promise<PhotoResult> {
    const state = await this.current(Date.now());
    if (!state) {
      return { ok: false, status: 404, error: "room_not_found", message: "This room has closed." };
    }
    const host = state.players.find((p) => p.id === state.hostId);
    if (!host || host.sessionToken !== sessionToken) {
      return { ok: false, status: 403, error: "not_host", message: "Only the host can do that." };
    }
    if (phaseOf(state) === "playing") {
      return {
        ok: false,
        status: 409,
        error: "game_in_progress",
        message: "Choose a photo between games.",
      };
    }
    if (state.game.id !== "jigsaw") {
      return { ok: false, status: 409, error: "bad_settings", message: "Photos are for Jigsaw." };
    }
    const id = [...crypto.getRandomValues(new Uint8Array(12))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await this.ctx.storage.put(PHOTO_KEY, { id, type, data } satisfies StoredPhoto);
    const settings = { ...(state.game.settings as object), picture: "photo", photo: id };
    const result = configureGame(state, state.hostId!, settings);
    if (!result.ok) {
      return { ok: false, status: 400, error: "bad_settings", message: "That photo didn’t work." };
    }
    await this.commit(result.state);
    return { ok: true, id };
  }

  /** The room's photo, if it has this one. */
  async photo(id: string): Promise<{ type: string; data: ArrayBuffer } | null> {
    const photo = await this.ctx.storage.get<StoredPhoto>(PHOTO_KEY);
    return photo && photo.id === id ? { type: photo.type, data: photo.data } : null;
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
      case "profile":
        await this.handleProfile(ws, message);
        return;
      case "roomSettings":
        await this.handleGame(ws, (state, playerId) => {
          const result = configureRoom(state, playerId, withoutUndefined(message.settings));
          return result.ok ? result : { ok: false, error: result.error };
        });
        return;
      case "chooseGame": {
        const site = await siteSettings(this.env);
        const game = message.game;
        if (!isGameId(game) || site.gamesOff.includes(game)) {
          sendError(ws, ErrorCode.BadSettings, GAME_OFF_MESSAGE);
          return;
        }
        await this.handleGame(ws, (state, playerId) => {
          const result = chooseGame(state, playerId, game);
          if (!result.ok || result.state === state) return result;
          // Admins' defaults and topics that are off apply here too, as for a new room.
          const settings = newRoomSettings(result.state, site, null);
          return { ok: true, state: { ...result.state, game: { id: game, settings } } };
        });
        return;
      }
      case "configure": {
        const topic = topicOf(message.settings);
        const off = topic !== null && (await siteSettings(this.env)).topicsOff.includes(topic);
        await this.handleGame(ws, (state, playerId) =>
          off
            ? { ok: false, error: "bad_settings", message: TOPIC_OFF_MESSAGE }
            : configureGame(state, playerId, message.settings),
        );
        return;
      }
      case "start":
        await this.handleStart(ws);
        return;
      case "action":
        await this.handleGame(ws, (state, playerId, now) =>
          applyGameAction(state, playerId, message.action, now),
        );
        return;
      case "backToLobby":
        await this.handleGame(ws, (state, playerId) => returnToLobby(state, playerId));
        return;
      case "quitGame":
        await this.handleGame(ws, (state, playerId, now) => quitGame(state, playerId, now));
        return;
      case "rejoinGame":
        await this.handleGame(ws, (state, playerId, now) => rejoinGame(state, playerId, now));
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
      await this.remove(state);
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

    // A new player's nickname is checked against the blocked words; a returning one keeps theirs.
    const returning =
      message.sessionToken !== undefined &&
      state.players.some((p) => p.sessionToken === message.sessionToken);
    if (!returning && (await refusedName(this.env, message.nickname))) {
      sendError(ws, ErrorCode.NicknameInvalid, NAME_BLOCKED_MESSAGE);
      return;
    }

    const avatar = isAvatarValue(message.avatar) ? message.avatar : undefined;
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
    if (!result.rejoined) {
      // The second person in is what makes it a shared room rather than a solo one.
      const shared = result.state.players.length === 2;
      await count(this.env, { room_joins: 1, ...(shared ? { rooms_shared: 1 } : {}) });
      await logActivity(this.env, "player_joined", { room: result.state.code });
      await recordName(this.env, {
        name: result.player.nickname,
        kind: "nickname",
        target: result.state.code,
        detail: result.state.code,
      });
    }
  }

  private async handleProfile(ws: WebSocket, message: Extract<ClientMessage, { type: "profile" }>) {
    const playerId = attachmentOf(ws)?.playerId;
    const now = Date.now();
    const state = await this.current(now);
    if (!playerId || !state) {
      sendError(ws, ErrorCode.NotJoined, "You haven’t joined this room.");
      return;
    }
    const before = state.players.find((p) => p.id === playerId);
    // A new name is checked against the blocked words, as it is when joining.
    if (
      before &&
      normalizeNickname(message.nickname) !== before.nickname &&
      (await refusedName(this.env, message.nickname))
    ) {
      sendError(ws, ErrorCode.NicknameInvalid, NAME_BLOCKED_MESSAGE);
      return;
    }
    const avatar = isAvatarValue(message.avatar) ? message.avatar : undefined;
    const result = updatePlayer(state, playerId, { nickname: message.nickname, avatar }, now);
    if (!result.ok) {
      sendError(ws, result.error, PROFILE_ERROR_MESSAGES[result.error]);
      return;
    }
    await this.commit(result.state);
    if (result.renamed) {
      await recordName(this.env, {
        name: result.player.nickname,
        kind: "nickname",
        target: result.state.code,
        detail: result.state.code,
      });
    }
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
    const next = leaveRoom(state, playerId, this.connectedIds(), now);
    ws.close(1000, "Left the room");
    // The last one out closes the room, rather than leaving it open for half an hour.
    if (next.players.length === 0) {
      await this.remove(next);
      return;
    }
    await this.commit(next);
  }

  private async handleDisconnect(ws: WebSocket) {
    const playerId = attachmentOf(ws)?.playerId;
    const now = Date.now();
    const state = await this.current(now);
    if (!playerId || !state) return;
    ws.serializeAttachment(null);
    await this.commit(markDisconnected(state, playerId, this.connectedIds(), now));
  }

  /**
   * Starts a game with questions the players haven't seen, as far as the bank allows: the
   * room's own history comes with its state, and each player's comes from the database.
   */
  private async handleStart(ws: WebSocket) {
    const before = await this.current(Date.now());
    // Admins can turn a game or a topic off after a room picked it.
    const site = await siteSettings(this.env);
    if (before && site.gamesOff.includes(before.game.id)) {
      sendError(ws, ErrorCode.BadSettings, GAME_OFF_MESSAGE);
      return;
    }
    const topic = before ? topicOf(before.game.settings) : null;
    if (topic && site.topicsOff.includes(topic)) {
      sendError(ws, ErrorCode.BadSettings, TOPIC_OFF_MESSAGE);
      return;
    }
    const connected = this.connectedIds();
    const playing = (before?.players ?? []).filter((p) => connected.has(p.id)).length;
    const needed =
      before && gameModule(before.game.id).contentNeeded(before.game.settings, playing);
    // Questions, words and Connections puzzles are tracked per player as seen; pictures aren't.
    const request = needed && needed.kind !== "jigsaw-picture" ? needed : null;
    const viewers = (before?.players ?? [])
      .filter((p) => connected.has(p.id))
      .flatMap((p) => viewerKey(p) ?? []);
    const bank = await loadBank(this.env);
    const history = request && historyCategory(request);
    const [seen, retired] = await Promise.all([
      history ? loadSeen(this.env, viewers, history) : new Map(),
      request?.kind === "quiz-questions"
        ? retiredQuestions(this.env, request.category, bank)
        : new Set<string>(),
    ]);

    let drawn: string[] = [];
    const started = await this.handleGame(ws, (state, playerId, now) =>
      startGame(state, playerId, this.connectedIds(), now, randomSeed(), (req, seed, room) => {
        // The host's own photo is served by this room, so the room fills it in.
        if (req.kind === "jigsaw-picture" && req.picture === "photo" && req.photo) {
          const picture = photoPicture(state.code, req.photo);
          drawn = [];
          return [{ id: `jigsaw:photo:${req.photo}`, picture }];
        }
        const content = drawContent(
          req,
          seed,
          { recent: room.recent, seen, retired },
          bank.questions,
        );
        drawn = content.map((q) => (q as { id: string }).id);
        return content;
      }),
    );
    if (!started) return;
    // A game in a room that has already had one is a rematch.
    await count(this.env, { games_started: 1, ...(before?.session ? { rematches: 1 } : {}) });
    const roster = (await this.load())?.session?.roster ?? [];
    await recordPlayerDays(
      this.env,
      roster.flatMap((p) => viewerKey(p) ?? []),
    );
    if (history) {
      await recordSeen(
        this.env,
        roster.flatMap((p) => viewerKey(p) ?? []),
        history,
        drawn,
        Date.now(),
      );
    }
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
    await this.list(state);

    if (result) {
      const { summary } = result;
      // Topics are quiz categories; other games use `category` for their own things.
      const topic = result.gameId === "quiz" ? summary.category : null;
      await count(this.env, {
        games_finished: 1,
        game_players: summary.players.length,
        [`game_size:${sizeBucket(summary.players.length)}`]: 1,
        [`game:${result.gameId}`]: 1,
        ...(topic ? { [`topic:${topic}`]: 1 } : {}),
        ...(summary.mode ? { [`mode:${summary.mode}`]: 1 } : {}),
      });
      await logActivity(this.env, "game_finished", {
        game: result.gameId,
        topic,
        players: summary.players.length,
      });
      await recordQuestionStats(this.env, summary.items ?? []);
      try {
        await recordMatch(this.env, result, Date.now());
      } catch (error) {
        // History is a nice-to-have: a failed write must never break the room.
        console.error("Couldn’t record match", error);
      }
    }
  }

  /** `Close room` on the admin Rooms page: everyone is sent away and the room is deleted. */
  async closeByAdmin(): Promise<boolean> {
    const state = await this.load();
    if (!state) return false;
    for (const ws of this.ctx.getWebSockets()) {
      ws.serializeAttachment(null);
      ws.close(CloseCode.RoomClosed, "Room closed");
    }
    await this.remove(state);
    return true;
  }

  /**
   * `Remove` on the admin Moderation page: the player with this nickname is sent away and
   * leaves the room. Returns whether they were in it.
   */
  async removeByAdmin(nickname: string): Promise<boolean> {
    const now = Date.now();
    const state = await this.current(now);
    const player = state?.players.find((p) => sameNickname(p.nickname, nickname));
    if (!state || !player) return false;
    for (const ws of this.socketsFor(player.id)) {
      ws.serializeAttachment(null);
      ws.close(CloseCode.Removed, "Removed from the room");
    }
    await this.commit(leaveRoom(state, player.id, this.connectedIds(), now));
    return true;
  }

  private async remove(state: RoomState) {
    this.cached = null;
    this.listed = undefined;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    try {
      await removeLiveRoom(this.env, state.code);
    } catch (error) {
      console.error("Couldn’t remove the room from the admin list", error);
    }
  }

  /** Keeps the admin rooms list up to date, writing only when something shown there changed. */
  private async list(state: RoomState) {
    const room = liveRoomOf(state, this.connectedIds());
    const signature = JSON.stringify(room);
    if (signature === this.listed) return;
    this.listed = signature;
    try {
      await saveLiveRoom(this.env, room, Date.now());
    } catch (error) {
      this.listed = undefined;
      console.error("Couldn’t update the admin rooms list", error);
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
