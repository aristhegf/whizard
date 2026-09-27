import { DurableObject } from "cloudflare:workers";
import {
  createRoomState,
  isExpired,
  joinRoom,
  leaveRoom,
  markDisconnected,
  nextDeadline,
  randomToken,
  settle,
  toSnapshot,
  type ConnectedIds,
  type JoinError,
  type RoomState,
} from "@whizard/game-core";
import {
  CloseCode,
  ErrorCode,
  PROTOCOL_VERSION,
  encode,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "@whizard/protocol";
import type { Env } from "./env";

const STATE_KEY = "room";
const OPEN = 1;

interface SocketAttachment {
  playerId: string;
}

const JOIN_ERROR_MESSAGES: Record<JoinError, string> = {
  nickname_invalid: "Pick a nickname between 1 and 20 characters.",
  nickname_taken: "Someone in this room already has that nickname.",
  room_full: "This room is full.",
};

/**
 * One instance per room code, holding the authoritative room state. Uses the WebSocket
 * hibernation API so rooms aren't billed while they wait for messages.
 */
export class Room extends DurableObject<Env> {
  private cached: RoomState | null | undefined;

  /** Claims this room for a newly generated code. Returns false if the code is already in use. */
  async create(code: string): Promise<boolean> {
    if (await this.load()) return false;
    await this.save(createRoomState(code, Date.now()));
    return true;
  }

  override async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    if (!(await this.load())) {
      this.reject(
        server,
        ErrorCode.RoomNotFound,
        "This room doesn't exist or has expired.",
        CloseCode.RoomNotFound,
      );
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(data);
    if (!message) {
      send(ws, {
        type: "error",
        code: ErrorCode.BadMessage,
        message: "Message was not understood.",
      });
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
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  override async alarm(): Promise<void> {
    const state = await this.load();
    if (!state) return;
    const now = Date.now();
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
      this.reject(
        ws,
        ErrorCode.OutdatedClient,
        "Whizard has been updated. Refresh the page to keep playing.",
        CloseCode.OutdatedClient,
      );
      return;
    }
    const state = await this.load();
    if (!state) {
      this.reject(
        ws,
        ErrorCode.RoomNotFound,
        "This room doesn't exist or has expired.",
        CloseCode.RoomNotFound,
      );
      return;
    }
    if (attachmentOf(ws)) return;

    const result = joinRoom(state, message, this.connectedIds(), Date.now(), () => ({
      id: randomToken(9),
      sessionToken: randomToken(24),
    }));
    if (!result.ok) {
      send(ws, { type: "error", code: result.error, message: JOIN_ERROR_MESSAGES[result.error] });
      return;
    }

    const { player } = result;
    for (const other of this.socketsFor(player.id)) {
      other.serializeAttachment(null);
      other.close(CloseCode.Replaced, "Opened somewhere else");
    }
    ws.serializeAttachment({ playerId: player.id } satisfies SocketAttachment);

    const snapshot = await this.commit(result.state);
    send(ws, {
      type: "welcome",
      playerId: player.id,
      sessionToken: player.sessionToken,
      room: snapshot,
    });
  }

  private async handleLeave(ws: WebSocket) {
    const attachment = attachmentOf(ws);
    const state = await this.load();
    if (!attachment || !state) {
      send(ws, {
        type: "error",
        code: ErrorCode.NotJoined,
        message: "You haven't joined this room.",
      });
      return;
    }
    ws.serializeAttachment(null);
    await this.commit(leaveRoom(state, attachment.playerId, this.connectedIds(), Date.now()));
    ws.close(1000, "Left the room");
  }

  private async handleDisconnect(ws: WebSocket) {
    const attachment = attachmentOf(ws);
    const state = await this.load();
    if (!attachment || !state) return;
    ws.serializeAttachment(null);
    await this.commit(
      markDisconnected(state, attachment.playerId, this.connectedIds(), Date.now()),
    );
  }

  /** Saves the state, reschedules the alarm and sends the new snapshot to everyone in the room. */
  private async commit(state: RoomState) {
    await this.save(state);
    const snapshot = toSnapshot(state, this.connectedIds());
    const message = encode({ type: "room", room: snapshot });
    for (const ws of this.ctx.getWebSockets()) {
      if (attachmentOf(ws) && ws.readyState === OPEN) ws.send(message);
    }
    return snapshot;
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
      const attachment = attachmentOf(ws);
      if (attachment && ws.readyState === OPEN) ids.add(attachment.playerId);
    }
    return ids;
  }

  private socketsFor(playerId: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => attachmentOf(ws)?.playerId === playerId);
  }

  private reject(ws: WebSocket, code: ErrorCode, message: string, closeCode: number) {
    send(ws, { type: "error", code, message });
    ws.close(closeCode, message);
  }
}

function attachmentOf(ws: WebSocket): SocketAttachment | null {
  return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
}

function send(ws: WebSocket, message: ServerMessage): void {
  ws.send(encode(message));
}
