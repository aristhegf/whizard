import {
  CloseCode,
  ErrorCode,
  FINAL_CLOSE_CODES,
  PROTOCOL_VERSION,
  encode,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@whizard/protocol";
import { roomSocketUrl } from "./api";
import {
  clearSession,
  guestId,
  loadAvatar,
  loadSession,
  saveAvatar,
  saveNickname,
  saveSession,
} from "./storage";

const PING_INTERVAL_MS = 5000;
/** Extra pings right after connecting, for a good clock estimate before the first question. */
const STARTUP_PINGS_MS = [150, 400, 800];
const CLOCK_SAMPLES = 8;
const MAX_RECONNECT_DELAY_MS = 10_000;

export type RoomSnapshot = Extract<ServerMessage, { type: "room" }>["room"];

export interface RoomClientState {
  connection: "connecting" | "open" | "reconnecting" | "closed";
  latencyMs: number | null;
  playerId: string | null;
  room: RoomSnapshot | null;
  joining: boolean;
  joinError: string | null;
  /** This player’s view of the current game, straight from the server. */
  game: unknown;
  /** A problem with the last host action, e.g. not enough questions for the settings. */
  notice: string | null;
  /** Set when the room can’t be used any more; the UI shows it instead of the room. */
  fatal: string | null;
}

const FINAL_CLOSE_MESSAGES: Record<number, string> = {
  [CloseCode.OutdatedClient]: "Whizard has been updated. Refresh the page to keep playing.",
  [CloseCode.RoomNotFound]: "This room doesn’t exist or has expired.",
  [CloseCode.Replaced]: "You opened this room in another tab or device.",
  [CloseCode.RoomExpired]: "This room has closed because nobody was in it.",
  [CloseCode.RoomClosed]: "This room was closed by Whizard.",
  [CloseCode.Removed]: "You were removed from this room by Whizard.",
};

const QUIET_ERRORS = new Set<string>([ErrorCode.BadAction, ErrorCode.BadMessage]);

const JOIN_ERRORS = new Set<string>([
  ErrorCode.NicknameInvalid,
  ErrorCode.NicknameTaken,
  ErrorCode.RoomFull,
]);

/** Owns one room’s WebSocket: joins, rejoins after drops, and exposes state for React. */
export class RoomClient {
  private state: RoomClientState;
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private stopped = true;
  private pendingNickname: string | null = null;
  private clockSamples: { rtt: number; offset: number }[] = [];
  private clockOffset = 0;

  constructor(private readonly code: string) {
    this.state = {
      connection: "connecting",
      latencyMs: null,
      playerId: null,
      room: null,
      joining: loadSession(code) !== null,
      joinError: null,
      game: null,
      notice: null,
      fatal: null,
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): RoomClientState => this.state;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    this.socket?.close(1000);
    this.socket = null;
  }

  join(nickname: string, avatar?: string): void {
    this.pendingNickname = nickname;
    if (avatar) saveAvatar(avatar);
    this.update({ joining: true, joinError: null });
    this.sendJoin();
  }

  /** The server’s clock, estimated from ping round trips. Game deadlines use server time. */
  readonly serverNow = (): number => Date.now() + this.clockOffset;

  /** Host only: who can join, and whether they can join a game that's already running. */
  configureRoom(settings: { maxPlayers?: number; lateJoin?: boolean }): void {
    this.update({ notice: null });
    this.send({ type: "roomSettings", settings });
  }

  /** Host only: which game the room plays next. */
  chooseGame(game: string): void {
    this.update({ notice: null });
    this.send({ type: "chooseGame", game });
  }

  configure(settings: unknown): void {
    this.update({ notice: null });
    this.send({ type: "configure", settings });
  }

  startGame(): void {
    this.update({ notice: null });
    this.send({ type: "start" });
  }

  act(action: unknown): void {
    this.send({ type: "action", action });
  }

  backToLobby(): void {
    this.send({ type: "backToLobby" });
  }

  /** Quits the running game but stays in the room, for the next one. */
  quitGame(): void {
    this.send({ type: "quitGame" });
  }

  leave(): void {
    this.send({ type: "leave" });
    clearSession(this.code);
    this.stop();
  }

  private connect(): void {
    const socket = new WebSocket(roomSocketUrl(this.code));
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.attempts = 0;
      this.update({ connection: "open" });
      this.ping();
      for (const delay of STARTUP_PINGS_MS) setTimeout(() => this.ping(), delay);
      this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS);
      this.sendJoin();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      const message = parseServerMessage(event.data);
      if (message) this.handle(message);
      else console.warn("Ignored a message from the server that couldn’t be read");
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      clearInterval(this.pingTimer);
      if (this.stopped) return;

      if (FINAL_CLOSE_CODES.has(event.code)) {
        if (event.code !== CloseCode.Replaced) clearSession(this.code);
        this.update({
          connection: "closed",
          fatal:
            this.state.fatal ?? FINAL_CLOSE_MESSAGES[event.code] ?? "This room is unavailable.",
        });
        return;
      }

      this.update({ connection: "reconnecting" });
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** this.attempts++);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case "welcome": {
        const me = message.room.players.find((p) => p.id === message.playerId);
        if (me) {
          saveSession(this.code, { sessionToken: message.sessionToken, nickname: me.nickname });
          saveNickname(me.nickname);
        }
        this.pendingNickname = null;
        if (this.clockSamples.length === 0) this.clockOffset = message.serverTime - Date.now();
        this.update({ playerId: message.playerId, room: message.room, joining: false });
        return;
      }
      case "room":
        this.update({
          room: message.room,
          ...(message.room.phase === "lobby" ? { game: null } : {}),
        });
        return;
      case "game":
        this.update({ game: message.view });
        return;
      case "pong": {
        const rtt = performance.now() - message.t;
        this.recordClockSample(rtt, message.serverTime + rtt / 2 - Date.now());
        this.update({ latencyMs: Math.round(rtt) });
        return;
      }
      case "error":
        if (QUIET_ERRORS.has(message.code)) return;
        if (JOIN_ERRORS.has(message.code)) {
          this.update({ joining: false, joinError: message.message });
        } else if (
          message.code === ErrorCode.RoomNotFound ||
          message.code === ErrorCode.OutdatedClient
        ) {
          this.update({ fatal: message.message });
        } else {
          this.update({ notice: message.message });
        }
        return;
    }
  }

  /** Keeps the offset from the fastest recent round trip, which has the least uncertainty. */
  private recordClockSample(rtt: number, offset: number): void {
    this.clockSamples = [...this.clockSamples, { rtt, offset }].slice(-CLOCK_SAMPLES);
    const best = this.clockSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.clockOffset = best.offset;
  }

  private sendJoin(): void {
    const session = loadSession(this.code);
    const nickname = this.pendingNickname ?? session?.nickname;
    if (nickname === undefined) return;
    this.send({
      type: "join",
      protocolVersion: PROTOCOL_VERSION,
      nickname,
      guestId: guestId(),
      ...(loadAvatar() ? { avatar: loadAvatar()! } : {}),
      ...(session ? { sessionToken: session.sessionToken } : {}),
    });
  }

  private ping(): void {
    this.send({ type: "ping", t: performance.now() });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encode(message));
  }

  private update(patch: Partial<RoomClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
