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

/** Draws content for a game, e.g. questions from the bank. Returns fewer items if it runs short. */
export type ContentSource = (request: ContentRequest, seed: number) => unknown[];

export function defaultGameConfig(id: GameId = "quiz"): GameConfig {
  return { id, settings: gameModule(id).defaultSettings };
}

export function phaseOf(state: RoomState): RoomPhase {
  if (!state.session) return "lobby";
  return state.session.finished ? "finished" : "playing";
}

const fail = (error: GameError, message?: string): GameResult =>
  message === undefined ? { ok: false, error } : { ok: false, error, message };

export function configureGame(state: RoomState, playerId: string, settings: unknown): GameResult {
  if (state.hostId !== playerId) return fail("not_host");
  if (state.session) return fail("game_in_progress");
  const parsed = gameModule(state.game.id).settingsSchema.safeParse(settings);
  if (!parsed.success) return fail("bad_settings");
  return { ok: true, state: { ...state, game: { ...state.game, settings: parsed.data } } };
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

  const content = drawContent(module.contentNeeded(state.game.settings), seed);
  if (content.length === 0) return fail("no_content");

  const gameState = module.setup({ settings: state.game.settings, players, content, seed, now });
  return {
    ok: true,
    state: {
      ...state,
      lastActivityAt: now,
      session: {
        gameId: state.game.id,
        state: gameState,
        finished: module.isFinished(gameState),
        startedAt: now,
        roster: playing.map(rosterEntry),
        recorded: false,
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
