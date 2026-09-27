import { normalizeNickname, sameNickname } from "./nickname";
import {
  defaultGameConfig,
  gamePlayerLeft,
  gameWakeAt,
  phaseOf,
  type GameConfig,
  type GameSession,
  type RoomPhase,
} from "./session";

export const MAX_PLAYERS = 16;
/** How long a disconnected host keeps the role, so a locked phone doesn't hand it over. */
export const HOST_GRACE_MS = 30_000;
export const DISCONNECTED_PLAYER_TTL_MS = 10 * 60_000;
/** A room with nobody connected is deleted after this long. */
export const ROOM_IDLE_TTL_MS = 30 * 60_000;

/** A signed-in account, verified by the server before the player reaches the room. */
export interface AccountIdentity {
  userId: string;
  username: string;
}

export interface Player {
  id: string;
  nickname: string;
  sessionToken: string;
  joinedAt: number;
  lastSeenAt: number;
  /** Set when the player is signed in. */
  account: AccountIdentity | null;
  /** A random ID the browser keeps, so a guest's games can follow them into a new account. */
  guestId: string | null;
}

export interface RoomState {
  code: string;
  createdAt: number;
  hostId: string | null;
  /** In join order. */
  players: Player[];
  lastActivityAt: number;
  /** The game picked in the lobby and its settings. */
  game: GameConfig;
  /** The game being played, or the one that just finished. */
  session: GameSession | null;
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  connected: boolean;
  /** Public account handle, so other players can add them as a friend. */
  username: string | null;
}

export interface RoomSnapshot {
  code: string;
  hostId: string | null;
  players: PlayerSnapshot[];
  phase: RoomPhase;
  game: GameConfig;
}

/** IDs of players with an open connection right now. */
export type ConnectedIds = ReadonlySet<string>;

export interface JoinRequest {
  nickname: string;
  sessionToken?: string | undefined;
  guestId?: string | undefined;
  account?: AccountIdentity | null | undefined;
}

export type JoinError = "nickname_invalid" | "nickname_taken" | "room_full";

export type JoinResult =
  | { ok: true; state: RoomState; player: Player; rejoined: boolean }
  | { ok: false; error: JoinError };

export function createRoomState(code: string, now: number): RoomState {
  return {
    code,
    createdAt: now,
    hostId: null,
    players: [],
    lastActivityAt: now,
    game: defaultGameConfig(),
    session: null,
  };
}

export function joinRoom(
  state: RoomState,
  request: JoinRequest,
  connected: ConnectedIds,
  now: number,
  newIds: () => { id: string; sessionToken: string },
): JoinResult {
  const existing =
    request.sessionToken !== undefined
      ? state.players.find((p) => p.sessionToken === request.sessionToken)
      : undefined;

  if (existing) {
    // Signing in between visits upgrades the player; a signed-out reconnect keeps what they had.
    const player = { ...existing, lastSeenAt: now, account: request.account ?? existing.account };
    const players = state.players.map((p) => (p.id === player.id ? player : p));
    const next = { ...state, players, lastActivityAt: now };
    return {
      ok: true,
      rejoined: true,
      player,
      state: settle(next, with_(connected, player.id), now),
    };
  }

  const nickname = normalizeNickname(request.nickname);
  if (!nickname) return { ok: false, error: "nickname_invalid" };
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: "room_full" };
  if (state.players.some((p) => sameNickname(p.nickname, nickname))) {
    return { ok: false, error: "nickname_taken" };
  }

  const player: Player = {
    ...newIds(),
    nickname,
    joinedAt: now,
    lastSeenAt: now,
    account: request.account ?? null,
    guestId: request.guestId ?? null,
  };
  const next = { ...state, players: [...state.players, player], lastActivityAt: now };
  return {
    ok: true,
    rejoined: false,
    player,
    state: settle(next, with_(connected, player.id), now),
  };
}

export function leaveRoom(
  state: RoomState,
  playerId: string,
  connected: ConnectedIds,
  now: number,
): RoomState {
  const players = state.players.filter((p) => p.id !== playerId);
  const next = gamePlayerLeft({ ...state, players, lastActivityAt: now }, playerId, now);
  return settle(next, without(connected, playerId), now);
}

export function markDisconnected(
  state: RoomState,
  playerId: string,
  connected: ConnectedIds,
  now: number,
): RoomState {
  const players = state.players.map((p) => (p.id === playerId ? { ...p, lastSeenAt: now } : p));
  return settle({ ...state, players, lastActivityAt: now }, without(connected, playerId), now);
}

/** Applies anything that is due: removing long-gone players and handing over the host role. */
export function settle(state: RoomState, connected: ConnectedIds, now: number): RoomState {
  const players = state.players.filter(
    (p) => connected.has(p.id) || now - p.lastSeenAt < DISCONNECTED_PLAYER_TTL_MS,
  );
  const pruned = players.length === state.players.length ? state : { ...state, players };
  return resolveHost(pruned, connected, now);
}

function resolveHost(state: RoomState, connected: ConnectedIds, now: number): RoomState {
  const host = state.players.find((p) => p.id === state.hostId);
  if (host && (connected.has(host.id) || now - host.lastSeenAt < HOST_GRACE_MS)) return state;

  // The longest-connected player takes over. If nobody is connected, a departed
  // host is replaced by the earliest remaining player, and an absent one keeps the role.
  const successor = state.players.find((p) => connected.has(p.id)) ?? host ?? state.players[0];
  const hostId = successor?.id ?? null;
  return hostId === state.hostId ? state : { ...state, hostId };
}

/** When the room next needs to tick the game, call `settle` or check expiry, or null. */
export function nextDeadline(state: RoomState, connected: ConnectedIds): number | null {
  const deadlines: number[] = [];
  const gameWake = gameWakeAt(state);
  if (gameWake !== null) deadlines.push(gameWake);
  if (connected.size === 0) deadlines.push(state.lastActivityAt + ROOM_IDLE_TTL_MS);
  for (const player of state.players) {
    if (connected.has(player.id)) continue;
    deadlines.push(player.lastSeenAt + DISCONNECTED_PLAYER_TTL_MS);
    if (player.id === state.hostId && connected.size > 0) {
      deadlines.push(player.lastSeenAt + HOST_GRACE_MS);
    }
  }
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

export function isExpired(state: RoomState, connected: ConnectedIds, now: number): boolean {
  return connected.size === 0 && now - state.lastActivityAt >= ROOM_IDLE_TTL_MS;
}

/** The public view of a room. Never includes session tokens. */
export function toSnapshot(state: RoomState, connected: ConnectedIds): RoomSnapshot {
  return {
    code: state.code,
    hostId: state.hostId,
    players: state.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: connected.has(p.id),
      username: p.account?.username ?? null,
    })),
    phase: phaseOf(state),
    game: state.game,
  };
}

function with_(set: ConnectedIds, id: string): ConnectedIds {
  return new Set(set).add(id);
}

function without(set: ConnectedIds, id: string): ConnectedIds {
  const next = new Set(set);
  next.delete(id);
  return next;
}
