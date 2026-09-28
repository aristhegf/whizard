import { gameModule, type GameId } from "./games/registry";
import { isRejection, type ContentRequest, type GameSummary } from "./games/types";
import type { AccountIdentity, ConnectedIds, Player, RoomState } from "./room";

export type RoomPhase = "lobby" | "playing" | "finished";

export interface GameConfig {
  id: GameId;
  settings: unknown;
}

/** Who played, captured at the start so results can be saved even after someone leaves. */
export interface RosterEntry {
  playerId: string;
  nickname: string;
  account: AccountIdentity | null;
  guestId: string | null;
}

export interface GameSession {
  gameId: GameId;
  state: unknown;
  finished: boolean;
  startedAt: number;
  roster: RosterEntry[];
  /** Set once the result has been saved to match history. */
  recorded: boolean;
  /**
   * Players who quit this game but stayed in the room. They wait in the lobby for the next
   * one. Missing in rooms saved before players could quit a game.
   */
  quit?: string[];
}

export interface FinishedGame {
  gameId: GameId;
  startedAt: number;
  summary: GameSummary;
  roster: RosterEntry[];
}

export type GameError =
  | "not_host"
  | "bad_settings"
  | "not_enough_players"
  | "game_in_progress"
  | "no_game"
  | "no_content"
  | "bad_action";

export type GameResult =
  { ok: true; state: RoomState } | { ok: false; error: GameError; message?: string };

/** What a room has already used, so the next game can pick something else. */
export interface ContentHistory {
  /** Content IDs this room used, newest first. */
  recent: readonly string[];
}

/** Draws content for a game, e.g. questions from the bank. Returns fewer items if it runs short. */
export type ContentSource = (
  request: ContentRequest,
  seed: number,
  history: ContentHistory,
) => unknown[];

/** How many used items a room remembers: several long games' worth. */
const RECENT_CONTENT_LIMIT = 300;

function contentIds(content: unknown[]): string[] {
  return content.flatMap((item) => {
    const id = (item as { id?: unknown } | null)?.id;
    return typeof id === "string" ? [id] : [];
  });
}

export function defaultGameConfig(id: GameId = "quiz"): GameConfig {
  return { id, settings: gameModule(id).defaultSettings };
}

export function phaseOf(state: RoomState): RoomPhase {
  if (!state.session) return "lobby";
  return state.session.finished ? "finished" : "playing";
}

const fail = (error: GameError, message?: string): GameResult =>
  message === undefined ? { ok: false, error } : { ok: false, error, message };

/**
 * The host changes the game's settings: in the lobby, or once a game has finished, which
 * brings everyone back to the lobby.
 */
export function configureGame(state: RoomState, playerId: string, settings: unknown): GameResult {
  if (state.hostId !== playerId) return fail("not_host");
  if (phaseOf(state) === "playing") return fail("game_in_progress");
  const parsed = gameModule(state.game.id).settingsSchema.safeParse(settings);
  if (!parsed.success) return fail("bad_settings");
  return {
    ok: true,
    state: { ...state, session: null, game: { ...state.game, settings: parsed.data } },
  };
}

/**
 * The host picks which game the room plays next, with that game's default settings. Like
 * changing settings, it works in the lobby or once a game has finished.
 */
export function chooseGame(state: RoomState, playerId: string, id: GameId): GameResult {
  if (state.hostId !== playerId) return fail("not_host");
  if (phaseOf(state) === "playing") return fail("game_in_progress");
  if (state.game.id === id && !state.session) return { ok: true, state };
  return { ok: true, state: { ...state, session: null, game: defaultGameConfig(id) } };
}

/**
 * A player quits the running game but stays in the room: the game carries on without them,
 * and they wait in the lobby for the next one. If nobody is left playing, the game ends.
 */
export function quitGame(state: RoomState, playerId: string, now: number): GameResult {
  if (phaseOf(state) !== "playing") return fail("no_game");
  if (!state.players.some((p) => p.id === playerId)) return fail("no_game");
  const session = state.session!;
  const quit = session.quit ?? [];
  if (quit.includes(playerId)) return { ok: true, state };
  const marked = { ...state, session: { ...session, quit: [...quit, playerId] } };
  return { ok: true, state: gamePlayerLeft(marked, playerId, now) };
}

/** Who quit the current game and is waiting for the next one. */
export function sittingOut(state: RoomState): string[] {
  return state.session?.quit ?? [];
}

export function startGame(
  state: RoomState,
  playerId: string,
  connected: ConnectedIds,
  now: number,
  seed: number,
  drawContent: ContentSource,
): GameResult {
  if (state.hostId !== playerId) return fail("not_host");
  if (phaseOf(state) === "playing") return fail("game_in_progress");

  const module = gameModule(state.game.id);
  const playing = state.players.filter((p) => connected.has(p.id)).slice(0, module.maxPlayers);
  const players = playing.map((p) => ({ id: p.id, nickname: p.nickname }));
  if (players.length < module.minPlayers) return fail("not_enough_players");
  const needed = module.playersNeeded?.(state.game.settings);
  if (needed && players.length < needed.min) return fail("not_enough_players", needed.message);

  const recent = state.recentContent ?? [];
  const request = module.contentNeeded(state.game.settings, players.length);
  const content = request ? drawContent(request, seed, { recent }) : [];
  if (request && content.length === 0) return fail("no_content");

  const gameState = module.setup({ settings: state.game.settings, players, content, seed, now });
  return {
    ok: true,
    state: {
      ...state,
      lastActivityAt: now,
      recentContent: [...contentIds(content), ...recent].slice(0, RECENT_CONTENT_LIMIT),
      session: {
        gameId: state.game.id,
        state: gameState,
        finished: module.isFinished(gameState),
        startedAt: now,
        roster: playing.map(rosterEntry),
        recorded: false,
        quit: [],
      },
    },
  };
}

export function applyGameAction(
  state: RoomState,
  playerId: string,
  action: unknown,
  now: number,
): GameResult {
  if (phaseOf(state) !== "playing") return fail("no_game");
  const session = state.session!;
  const module = gameModule(session.gameId);
  const parsed = module.actionSchema.safeParse(action);
  if (!parsed.success) return fail("bad_action");

  const result = module.onAction(module.tick(session.state, now), playerId, parsed.data, now);
  if (isRejection(result)) return fail("bad_action", result.rejected);
  return { ok: true, state: withGameState(state, result, now) };
}

export function returnToLobby(state: RoomState, playerId: string): GameResult {
  if (state.hostId !== playerId) return fail("not_host");
  return { ok: true, state: { ...state, session: null } };
}

/** Advances the game clock: timeouts, reveals, next rounds. */
export function tickGame(state: RoomState, now: number): RoomState {
  if (phaseOf(state) !== "playing") return state;
  return withGameState(
    state,
    gameModule(state.session!.gameId).tick(state.session!.state, now),
    now,
  );
}

function rosterEntry(p: Player): RosterEntry {
  return { playerId: p.id, nickname: p.nickname, account: p.account, guestId: p.guestId };
}

/** Brings a player who arrived mid-game into it. Only called when the room allows late joins. */
export function gamePlayerJoined(state: RoomState, player: Player, now: number): RoomState {
  if (phaseOf(state) !== "playing") return state;
  const session = state.session!;
  const module = gameModule(session.gameId);
  const roster = session.roster ?? [];
  if (roster.length >= module.maxPlayers || roster.some((r) => r.playerId === player.id)) {
    return state;
  }
  const gameState = module.onPlayerJoined(
    session.state,
    { id: player.id, nickname: player.nickname },
    now,
  );
  return withGameState(
    { ...state, session: { ...session, roster: [...roster, rosterEntry(player)] } },
    gameState,
    now,
  );
}

export function gamePlayerLeft(state: RoomState, playerId: string, now: number): RoomState {
  if (phaseOf(state) !== "playing") return state;
  const module = gameModule(state.session!.gameId);
  return withGameState(state, module.onPlayerLeft(state.session!.state, playerId, now), now);
}

export function gameWakeAt(state: RoomState): number | null {
  if (phaseOf(state) !== "playing") return null;
  return gameModule(state.session!.gameId).nextWakeAt(state.session!.state);
}

/** A finished game whose result hasn't been saved yet, or null. */
export function unrecordedResult(state: RoomState): FinishedGame | null {
  const session = state.session;
  if (!session?.finished || session.recorded) return null;
  return {
    gameId: session.gameId,
    startedAt: session.startedAt,
    summary: gameModule(session.gameId).summarize(session.state),
    // Rooms saved before results were recorded have no roster.
    roster: session.roster ?? [],
  };
}

export function markRecorded(state: RoomState): RoomState {
  if (!state.session) return state;
  return { ...state, session: { ...state.session, recorded: true } };
}

export function gameViewFor(state: RoomState, playerId: string): unknown {
  if (!state.session) return null;
  return gameModule(state.session.gameId).viewFor(state.session.state, playerId);
}

function withGameState(state: RoomState, gameState: unknown, now: number): RoomState {
  const session = state.session!;
  const finished = gameModule(session.gameId).isFinished(gameState);
  return { ...state, lastActivityAt: now, session: { ...session, state: gameState, finished } };
}
