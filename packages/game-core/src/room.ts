import { normalizeNickname, sameNickname } from "./nickname";
import {
  defaultGameConfig,
  gamePlayerJoined,
  gamePlayerLeft,
  gamePlayerReturned,
  gameWakeAt,
  returningEntry,
  phaseOf,
  sittingOut,
  type GameConfig,
  type GameSession,
  type RoomPhase,
} from "./session";

export const MAX_PLAYERS = 20;
export const MIN_ROOM_CAPACITY = 2;
/** How long a disconnected host keeps the role, so a locked phone doesn't hand it over. */
export const HOST_GRACE_MS = 120_000;
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
  /** One of the avatar pictures, or null for the default. */
  avatar: string | null;
}

/** Chosen by the host in the lobby. */
export interface RoomSettings {
  /** How many people can be in the room. */
  maxPlayers: number;
  /** Whether someone arriving mid-game joins it, or waits for the next one. */
  lateJoin: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { maxPlayers: MAX_PLAYERS, lateJoin: false };

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
  /** Missing from rooms saved before room settings existed. */
  settings?: RoomSettings;
  /** IDs of content (such as questions) this room has used, newest first, so games don't repeat. */
  recentContent?: string[];
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  connected: boolean;
  /** Public account handle, so other players can add them as a friend. */
  username: string | null;
  avatar: string | null;
}

export interface RoomSnapshot {
  code: string;
  hostId: string | null;
  players: PlayerSnapshot[];
  phase: RoomPhase;
  game: GameConfig;
  settings: RoomSettings;
  /** Players who quit the current game and are waiting in the lobby for the next one. */
  sittingOut: string[];
}

/** IDs of players with an open connection right now. */
export type ConnectedIds = ReadonlySet<string>;

export interface JoinRequest {
  nickname: string;
  sessionToken?: string | undefined;
  guestId?: string | undefined;
  account?: AccountIdentity | null | undefined;
  avatar?: string | null | undefined;
}

export type JoinError = "nickname_invalid" | "nickname_taken" | "room_full";

export type JoinResult =
  | { ok: true; state: RoomState; player: Player; rejoined: boolean }
  | { ok: false; error: JoinError };

export function createRoomState(
  code: string,
  now: number,
  game: GameConfig = defaultGameConfig(),
): RoomState {
  return {
    code,
    createdAt: now,
    hostId: null,
    players: [],
    lastActivityAt: now,
    game,
    session: null,
    settings: DEFAULT_ROOM_SETTINGS,
  };
}

export function roomSettings(state: RoomState): RoomSettings {
  return state.settings ?? DEFAULT_ROOM_SETTINGS;
}

export type RoomSettingsError = "not_host" | "bad_settings";

/** The host changes who can join. Doesn't remove anyone already in the room. */
export function configureRoom(
  state: RoomState,
  playerId: string,
  patch: Partial<RoomSettings>,
): { ok: true; state: RoomState } | { ok: false; error: RoomSettingsError } {
  if (state.hostId !== playerId) return { ok: false, error: "not_host" };
  const next = { ...roomSettings(state), ...patch };
  if (
    !Number.isInteger(next.maxPlayers) ||
    next.maxPlayers < MIN_ROOM_CAPACITY ||
    next.maxPlayers > MAX_PLAYERS
  ) {
    return { ok: false, error: "bad_settings" };
  }
  return { ok: true, state: { ...state, settings: next } };
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
    const player = {
      ...existing,
      lastSeenAt: now,
      account: request.account ?? existing.account,
      avatar: request.avatar ?? existing.avatar ?? null,
    };
    const players = state.players.map((p) => (p.id === player.id ? player : p));
    const next = { ...state, players, lastActivityAt: now };
    return {
      ok: true,
      rejoined: true,
      player,
      state: settle(next, with_(connected, player.id), now),
    };
  }

  // Someone who was in the running game and left the room (or was dropped after a long time
  // offline) comes back as the same player, and picks the game up where they left it.
  const returning = returningEntry(state, {
    account: request.account ?? null,
    guestId: request.guestId ?? null,
  });
  const taken = (name: string) => state.players.some((p) => sameNickname(p.nickname, name));
  const nickname =
    returning && !taken(returning.nickname)
      ? returning.nickname
      : normalizeNickname(request.nickname);
  if (!nickname) return { ok: false, error: "nickname_invalid" };
  if (state.players.length >= Math.min(roomSettings(state).maxPlayers, MAX_PLAYERS)) {
    return { ok: false, error: "room_full" };
  }
  if (taken(nickname)) return { ok: false, error: "nickname_taken" };

  const fresh = newIds();
  const player: Player = {
    ...fresh,
    id: returning?.playerId ?? fresh.id,
    nickname,
    joinedAt: now,
    lastSeenAt: now,
    account: request.account ?? null,
    guestId: request.guestId ?? null,
    avatar: request.avatar ?? null,
  };
  let next: RoomState = { ...state, players: [...state.players, player], lastActivityAt: now };
  if (returning) next = gamePlayerReturned(next, player.id, now);
  else if (roomSettings(state).lateJoin) next = gamePlayerJoined(next, player, now);
  return {
    ok: true,
    rejoined: returning !== null,
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

export type ProfileError = "nickname_invalid" | "nickname_taken" | "game_in_progress";

export type ProfileResult =
  | { ok: true; state: RoomState; player: Player; renamed: boolean }
  | { ok: false; error: ProfileError };

/**
 * A player changes their nickname or avatar between games. Games keep the names they started
 * with, so it waits while one is running.
 */
export function updatePlayer(
  state: RoomState,
  playerId: string,
  change: { nickname: string; avatar?: string | null | undefined },
  now: number,
): ProfileResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "nickname_invalid" };
  if (phaseOf(state) === "playing") return { ok: false, error: "game_in_progress" };
  const nickname = normalizeNickname(change.nickname);
  if (!nickname) return { ok: false, error: "nickname_invalid" };
  if (state.players.some((p) => p.id !== playerId && sameNickname(p.nickname, nickname))) {
    return { ok: false, error: "nickname_taken" };
  }
  const updated: Player = {
    ...player,
    nickname,
    avatar: change.avatar === undefined ? player.avatar : change.avatar,
    lastSeenAt: now,
  };
  const players = state.players.map((p) => (p.id === playerId ? updated : p));
  return {
    ok: true,
    state: { ...state, players, lastActivityAt: now },
    player: updated,
    renamed: updated.nickname !== player.nickname,
  };
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
  const gone = state.players.filter(
    (p) => !connected.has(p.id) && now - p.lastSeenAt >= DISCONNECTED_PLAYER_TTL_MS,
  );
  let pruned = state;
  if (gone.length > 0) {
    pruned = { ...state, players: state.players.filter((p) => !gone.includes(p)) };
    // The game stops waiting for them. If they come back, they pick it up where they were.
    for (const p of gone) pruned = gamePlayerLeft(pruned, p.id, now);
  }
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
      avatar: p.avatar ?? null,
    })),
    phase: phaseOf(state),
    game: state.game,
    settings: roomSettings(state),
    sittingOut: sittingOut(state),
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
