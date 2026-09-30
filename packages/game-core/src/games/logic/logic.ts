import { z } from "zod";
import { seededRng } from "../../random";
import { ELIMINATION_MIN_PLAYERS, keepCount, roundCount } from "../knockout/knockout";
import type { GameModule, GamePlayer, Rejection } from "../types";
import { logicPuzzle, type LogicPuzzle } from "./grid";
import {
  DEFAULT_LOGIC_SETTINGS,
  logicSettingsSchema,
  type LogicMode,
  type LogicSettings,
  type LogicSize,
} from "./settings";

/*
 * Logic, in three modes, as Jigsaw has them. Classic and Speed are one grid, raced: everyone
 * gets the same one, and the first to fill it wins (Speed against a countdown, where the most
 * cells filled wins if time runs out). Elimination is a new grid each round, against the
 * countdown: solving it keeps you safe, and of those who didn't, the fewest cells filled go out.
 * Each round cuts about the same share of the players, as in every game's Elimination, until
 * two meet in the final.
 */

/** "Get ready" before the grid can be filled, the same moment for everyone. */
export const LOGIC_COUNTDOWN_MS = 3000;
/** Classic has no clock, but a player who walks away can't hold up the results forever. */
export const LOGIC_CLASSIC_LIMIT_MS = 60 * 60_000;
/** How long a round's knock-outs show before the next round starts. */
export const LOGIC_CUT_MS = 8000;
/** Wrong numbers allowed; the next one ends your puzzle. */
export const LOGIC_MAX_MISTAKES = 3;
/** Points per cell filled, for match history. */
export const LOGIC_POINTS_PER_CELL = 10;
/** Moves this early are accepted, to allow for small clock differences. */
const EARLY_TOLERANCE_MS = 1000;

export const logicActionSchema = z.object({
  type: z.literal("place"),
  cell: z.number().int().min(0),
  value: z.number().int().min(1).max(9),
});

export type LogicAction = z.infer<typeof logicActionSchema>;

interface LogicPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** Elimination: how many cuts had been made when they left. Back before the next, they carry on. */
  leftAfterCuts?: number;
  /** Joined an Elimination game after it started: watches. */
  spectator?: boolean;
  /** Numbers this player has placed, by cell; 0 where they haven't. */
  entries: number[];
  mistakes: number;
  /** The last wrong number, so it can flash on the grid. */
  lastWrong: { cell: number; value: number; at: number } | null;
  startsAt: number;
  finishedAt: number | null;
  /** Out of mistakes, or out of time, before filling the grid. */
  outOf: "mistakes" | "time" | null;
  /** When they last filled a cell, to break ties between equal counts. */
  lastFilledAt?: number | null;
  /** Elimination: the round (0-based) they were knocked out in, or null while still in. */
  outRound?: number | null;
  /** Elimination: 1 for the first knocked out, and so on; later is a better placing. */
  outOrder?: number | null;
}

export interface LogicState {
  settings: LogicSettings;
  mode: LogicMode;
  /** One for Classic and Speed; for Elimination one per round, the final last. */
  puzzles: LogicPuzzle[];
  /** The grid being played. */
  round: number;
  players: LogicPlayer[];
  /** Elimination: playing a round, or showing who went out of it. */
  phase: "play" | "cut";
  /** Elimination: when the current round's grid can be filled. */
  roundStartsAt: number;
  /** Elimination: when the knock-outs stop showing and the next round starts. */
  phaseEndsAt: number | null;
  lastCut: { round: number; out: string[] } | null;
  knockedOut: number;
  winnerId: string | null;
  finishedAt: number | null;
}

export interface LogicStanding {
  playerId: string;
  nickname: string;
  rank: number;
  /** Cells filled of the ones to fill. */
  filled: number;
  total: number;
  mistakes: number;
  timeMs: number | null;
  solved: boolean;
  done: boolean;
  left: boolean;
  /** Elimination: knocked out, and in which round (0-based). */
  out: boolean;
  outRound: number | null;
}

export interface LogicView {
  game: "logic";
  mode: LogicMode;
  size: LogicSize;
  boxRows: number;
  boxCols: number;
  givens: number[];
  /** The grid as you've filled it, clues included. Null while watching: joined too late, or knocked out. */
  grid: number[] | null;
  mistakesLeft: number;
  lastWrong: { cell: number; value: number; at: number } | null;
  /** The whole grid, once your puzzle is over. */
  solution: number[] | null;
  /** Server time the grid can be filled. Before then, show a countdown. */
  startsAt: number | null;
  /** When the countdown runs out. Null in Classic, which shows no clock. */
  deadline: number | null;
  me: LogicStanding | null;
  /** Everyone's progress: cells filled, never their grids. */
  standings: LogicStanding[];
  playerCount: number;
  final: boolean;
  /** Elimination: which round, and whether it's the final. Null in the other modes. */
  round: { index: number; total: number; final: boolean } | null;
  /** Elimination: who just went out, while that shows, and when the next round starts. */
  cut: { round: number; out: { playerId: string; nickname: string }[]; nextAt: number } | null;
  winnerId: string | null;
}

// Helpers -----------------------------------------------------------------------------------

const puzzleOf = (state: LogicState) => state.puzzles[state.round]!;
const elimination = (state: LogicState) => state.mode === "elimination";
const isFinal = (state: LogicState) => state.round === state.puzzles.length - 1;
const done = (p: LogicPlayer) => p.finishedAt !== null || p.outOf !== null;
const toFill = (puzzle: LogicPuzzle) => puzzle.givens.filter((n) => n === 0).length;
const filledOf = (p: LogicPlayer) => p.entries.filter((n) => n !== 0).length;

/** Playing now: not gone, and in Elimination not knocked out or watching. */
const contenders = (state: LogicState) =>
  state.players.filter(
    (p) => !p.left && (!elimination(state) || (!p.spectator && (p.outRound ?? null) === null)),
  );

const limitFor = (state: LogicState) =>
  state.mode === "classic" ? LOGIC_CLASSIC_LIMIT_MS : state.settings.minutes * 60_000;

const deadlineOf = (state: LogicState, p: LogicPlayer) => p.startsAt + limitFor(state);

function freshGrid(p: LogicPlayer, puzzle: LogicPuzzle, startsAt: number): LogicPlayer {
  return {
    ...p,
    entries: puzzle.givens.map(() => 0),
    mistakes: 0,
    lastWrong: null,
    startsAt,
    finishedAt: null,
    outOf: null,
    lastFilledAt: null,
  };
}

function newPlayer(player: GamePlayer, puzzle: LogicPuzzle, startsAt: number): LogicPlayer {
  return freshGrid(
    { id: player.id, nickname: player.nickname, left: false } as LogicPlayer,
    puzzle,
    startsAt,
  );
}

function timeOf(p: LogicPlayer): number | null {
  return p.finishedAt === null ? null : p.finishedAt - p.startsAt;
}

/**
 * Best first within a round: solved, fastest first; then most cells filled. The race breaks a
 * tie on fewer mistakes, as it always has; Elimination on who got there first, so of two level
 * at the line the later one goes out.
 */
function roundOrder(state: LogicState) {
  return (a: LogicPlayer, b: LogicPlayer): number => {
    const mistakes = a.mistakes - b.mistakes;
    const reached = (a.lastFilledAt ?? Infinity) - (b.lastFilledAt ?? Infinity) || 0;
    return (
      Number(a.finishedAt === null) - Number(b.finishedAt === null) ||
      (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
      filledOf(b) - filledOf(a) ||
      (elimination(state) ? reached || mistakes : mistakes) ||
      a.nickname.localeCompare(b.nickname)
    );
  };
}

// The race: Classic and Speed ----------------------------------------------------------------

function finishRaceIfDone(state: LogicState, now: number): LogicState {
  if (state.finishedAt !== null || elimination(state)) return state;
  return contenders(state).every(done) ? { ...state, finishedAt: now } : state;
}

// Elimination --------------------------------------------------------------------------------

/** Cuts made so far. */
const cutsMade = (state: LogicState) => (state.lastCut ? state.lastCut.round + 1 : 0);

/** Knock-out rounds still to play, this one included. */
const roundsLeft = (state: LogicState) => state.puzzles.length - 1 - state.round;

/** How many stay in after this round. */
const keepAfterRound = (state: LogicState) =>
  keepCount(contenders(state).length, Math.max(1, roundsLeft(state)));

function endRound(state: LogicState, at: number): LogicState {
  const alive = contenders(state).sort(roundOrder(state));
  if (isFinal(state) || alive.length <= 1) {
    return { ...state, winnerId: alive[0]?.id ?? null, finishedAt: at, phase: "play" };
  }
  // Down to two before the planned final (others left): straight to the final.
  if (alive.length <= 2) return nextRound(state, at);
  const keep = keepAfterRound(state);
  const out = alive.slice(keep);
  // The worst goes out first, so a later outOrder is a better placing.
  let order = state.knockedOut;
  const outOrder = new Map([...out].reverse().map((p) => [p.id, ++order]));
  const players = state.players.map((p) =>
    outOrder.has(p.id) ? { ...p, outRound: state.round, outOrder: outOrder.get(p.id)! } : p,
  );
  return {
    ...state,
    players,
    knockedOut: order,
    phase: "cut",
    phaseEndsAt: at + LOGIC_CUT_MS,
    lastCut: { round: state.round, out: out.map((p) => p.id) },
  };
}

function nextRound(state: LogicState, now: number): LogicState {
  const alive = contenders(state);
  if (alive.length <= 1) {
    return { ...state, winnerId: alive[0]?.id ?? null, finishedAt: now, phase: "play" };
  }
  // With two left, it's the final, however many rounds were planned.
  const round = alive.length <= 2 ? state.puzzles.length - 1 : state.round + 1;
  const puzzle = state.puzzles[round]!;
  const startsAt = now + LOGIC_COUNTDOWN_MS;
  const ids = new Set(alive.map((p) => p.id));
  return {
    ...state,
    round,
    phase: "play",
    phaseEndsAt: null,
    roundStartsAt: startsAt,
    players: state.players.map((p) => (ids.has(p.id) ? freshGrid(p, puzzle, startsAt) : p)),
  };
}

/**
 * Ends the round once it's settled: everyone still in is done, enough have solved it that the
 * rest are out anyway, or (in the final) someone has solved it.
 */
function settleRound(state: LogicState, now: number): LogicState {
  if (!elimination(state) || state.finishedAt !== null || state.phase !== "play") return state;
  const alive = contenders(state);
  const solved = alive.filter((p) => p.finishedAt !== null).length;
  if (alive.length <= 1 || alive.every(done)) return endRound(state, now);
  if (isFinal(state) ? solved >= 1 : solved >= Math.min(alive.length, keepAfterRound(state))) {
    return endRound(state, now);
  }
  return state;
}

// Moves --------------------------------------------------------------------------------------

function place(
  state: LogicState,
  player: LogicPlayer,
  action: LogicAction,
  now: number,
): LogicState | Rejection {
  const puzzle = puzzleOf(state);
  const { givens, solution, size } = puzzle;
  const { cell, value } = action;
  if (now < player.startsAt - EARLY_TOLERANCE_MS) return { rejected: "The puzzle hasn't started." };
  if (cell >= givens.length || value > size) return { rejected: "That isn't on the grid." };
  if (givens[cell] !== 0 || player.entries[cell] !== 0) {
    return { rejected: "That cell is already filled." };
  }
  let updated: LogicPlayer;
  if (solution[cell] === value) {
    const entries = [...player.entries];
    entries[cell] = value;
    const solved = entries.filter((n) => n !== 0).length === toFill(puzzle);
    updated = { ...player, entries, finishedAt: solved ? now : null, lastFilledAt: now };
  } else {
    const mistakes = player.mistakes + 1;
    updated = {
      ...player,
      mistakes,
      lastWrong: { cell, value, at: now },
      outOf: mistakes >= LOGIC_MAX_MISTAKES ? "mistakes" : null,
    };
  }
  const players = state.players.map((p) => (p.id === player.id ? updated : p));
  return settleRound(finishRaceIfDone({ ...state, players }, now), now);
}

// Views ------------------------------------------------------------------------------------

/**
 * Everyone, best first. The race: solved fastest first, then most cells filled, then fewest
 * mistakes. Elimination: the winner, then everyone still in by this round, then the knocked
 * out, latest out first.
 */
export function standingsOf(raw: LogicState): LogicStanding[] {
  const state = upgrade(raw);
  const rows = [...state.players].sort(
    (a, b) =>
      Number(a.left) - Number(b.left) ||
      Number(b.id === state.winnerId) - Number(a.id === state.winnerId) ||
      Number(!!a.spectator) - Number(!!b.spectator) ||
      Number((a.outRound ?? null) !== null) - Number((b.outRound ?? null) !== null) ||
      (b.outOrder ?? 0) - (a.outOrder ?? 0) ||
      roundOrder(state)(a, b),
  );
  return rows.map((p, i) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    filled: filledOf(p),
    // Knocked out, their grid is the one they went out on.
    total: toFill(state.puzzles[p.outRound ?? state.round]!),
    mistakes: p.mistakes,
    timeMs: timeOf(p),
    solved: p.finishedAt !== null,
    done: done(p),
    left: p.left,
    out: (p.outRound ?? null) !== null,
    outRound: p.outRound ?? null,
  }));
}

function viewFor(raw: LogicState, playerId: string): LogicView {
  const state = upgrade(raw);
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const playing = player && contenders(state).includes(player) ? player : null;
  const { size, boxRows, boxCols, givens, solution } = puzzleOf(state);
  const over = (!!playing && done(playing)) || state.finishedAt !== null;
  const names = new Map(state.players.map((p) => [p.id, p.nickname]));
  return {
    game: "logic",
    mode: state.mode,
    size,
    boxRows,
    boxCols,
    givens,
    grid: playing ? givens.map((n, cell) => n || playing.entries[cell]!) : null,
    mistakesLeft: LOGIC_MAX_MISTAKES - (playing?.mistakes ?? 0),
    lastWrong: playing?.lastWrong ?? null,
    solution: over ? solution : null,
    startsAt: playing ? playing.startsAt : elimination(state) ? state.roundStartsAt : null,
    deadline:
      state.mode === "classic"
        ? null
        : playing
          ? deadlineOf(state, playing)
          : elimination(state)
            ? state.roundStartsAt + limitFor(state)
            : null,
    me: standings.find((s) => s.playerId === playerId) ?? null,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
    round: elimination(state)
      ? { index: state.round, total: state.puzzles.length, final: isFinal(state) }
      : null,
    cut:
      state.phase === "cut" && state.lastCut && state.phaseEndsAt !== null
        ? {
            round: state.lastCut.round,
            out: state.lastCut.out.map((id) => ({ playerId: id, nickname: names.get(id) ?? "" })),
            nextAt: state.phaseEndsAt,
          }
        : null,
    winnerId: state.winnerId,
  };
}

/**
 * Games stored before modes and rounds: one grid, raced against the clock. They carry on as
 * Speed races under the new rules, so a game running when this arrives isn't lost.
 */
type LegacyState = { puzzle: LogicPuzzle };
function upgrade(state: LogicState): LogicState {
  if ("puzzles" in state && Array.isArray(state.puzzles)) return state;
  const old = state as unknown as LogicState & LegacyState;
  return {
    settings: logicSettingsSchema.parse(old.settings),
    mode: "speed",
    puzzles: [old.puzzle],
    round: 0,
    players: old.players,
    phase: "play",
    roundStartsAt: old.players[0]?.startsAt ?? 0,
    phaseEndsAt: null,
    lastCut: null,
    knockedOut: 0,
    winnerId: null,
    finishedAt: old.finishedAt,
  };
}

// Module -----------------------------------------------------------------------------------

export const logicGame: GameModule<LogicSettings, unknown, LogicState, LogicAction, LogicView> = {
  id: "logic",
  name: "Logic",
  minPlayers: 1,
  maxPlayers: 20,
  settingsSchema: logicSettingsSchema,
  defaultSettings: DEFAULT_LOGIC_SETTINGS,
  actionSchema: logicActionSchema,

  playersNeeded: (settings) =>
    settings.mode === "elimination"
      ? {
          min: ELIMINATION_MIN_PLAYERS,
          message: `Elimination needs at least ${ELIMINATION_MIN_PLAYERS} players.`,
        }
      : null,

  // Every grid is made from the seed; nothing comes from the content bank.
  contentNeeded: () => null,

  setup({ settings, players, seed, now }) {
    const mode = settings.mode;
    const stages =
      mode === "elimination"
        ? roundCount(Math.max(players.length, ELIMINATION_MIN_PLAYERS)) + 1
        : 1;
    // One after another from the seed, so the first grid is the one a race on this seed gets.
    const rng = seededRng(seed);
    const puzzles = Array.from({ length: stages }, () => logicPuzzle(settings.size, rng));
    const startsAt = now + LOGIC_COUNTDOWN_MS;
    return {
      settings,
      mode,
      puzzles,
      round: 0,
      players: players.map((p) => newPlayer(p, puzzles[0]!, startsAt)),
      phase: "play",
      roundStartsAt: startsAt,
      phaseEndsAt: null,
      lastCut: null,
      knockedOut: 0,
      winnerId: null,
      finishedAt: null,
    };
  },

  onAction(raw, playerId, action, now) {
    const state = upgrade(raw);
    if (state.finishedAt !== null) return { rejected: "The game is over." };
    const player = state.players.find((p) => p.id === playerId);
    if (!player || !contenders(state).includes(player)) {
      return { rejected: "You're watching this game." };
    }
    if (state.phase === "cut") return { rejected: "The next round hasn't started." };
    if (player.finishedAt !== null) return { rejected: "You've solved it." };
    if (player.outOf === "mistakes") return { rejected: "You're out of mistakes." };
    if (player.outOf === "time") return { rejected: "Your time is up." };
    return place(state, player, action, now);
  },

  onPlayerJoined(raw, player, now) {
    const state = upgrade(raw);
    if (state.finishedAt !== null) return state;
    const known = state.players.find((p) => p.id === player.id);
    if (known) {
      // Back after leaving. In the race, the grid is as they left it, on the same clock. In
      // Elimination they carry on in the round they left; after a cut, they watch.
      const missedCut = elimination(state) && (known.leftAfterCuts ?? 0) < cutsMade(state);
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === player.id ? { ...p, left: false, ...(missedCut ? { spectator: true } : {}) } : p,
        ),
      };
    }
    // Elimination: a newcomer watches. The race: they get the same grid, with their own clock.
    const joined = newPlayer(player, puzzleOf(state), now + LOGIC_COUNTDOWN_MS);
    return {
      ...state,
      players: [...state.players, elimination(state) ? { ...joined, spectator: true } : joined],
    };
  },

  onPlayerLeft(raw, playerId, now) {
    const state = upgrade(raw);
    const players = state.players.map((p) =>
      p.id === playerId ? { ...p, left: true, leftAfterCuts: cutsMade(state) } : p,
    );
    const next = { ...state, players };
    if (elimination(next) && next.finishedAt === null) {
      if (contenders(next).length <= 1) {
        return { ...next, winnerId: contenders(next)[0]?.id ?? null, finishedAt: now };
      }
      return settleRound(next, now);
    }
    return finishRaceIfDone(next, now);
  },

  tick(raw, now) {
    const state = upgrade(raw);
    if (state.finishedAt !== null) return state;
    if (elimination(state)) {
      if (state.phase === "cut") {
        return state.phaseEndsAt !== null && now >= state.phaseEndsAt
          ? nextRound(state, now)
          : state;
      }
      const deadline = state.roundStartsAt + limitFor(state);
      if (now < deadline) return state;
      const players = state.players.map((p) =>
        contenders(state).includes(p) && !done(p) ? { ...p, outOf: "time" as const } : p,
      );
      return endRound({ ...state, players }, deadline);
    }
    const players = state.players.map((p) =>
      !p.left && !done(p) && now >= deadlineOf(state, p) ? { ...p, outOf: "time" as const } : p,
    );
    return finishRaceIfDone({ ...state, players }, now);
  },

  nextWakeAt(raw) {
    const state = upgrade(raw);
    if (state.finishedAt !== null) return null;
    if (elimination(state)) {
      return state.phase === "cut" ? state.phaseEndsAt : state.roundStartsAt + limitFor(state);
    }
    const times = contenders(state)
      .filter((p) => !done(p))
      .map((p) => deadlineOf(state, p));
    return times.length > 0 ? Math.min(...times) : null;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(raw) {
    const state = upgrade(raw);
    const stayed = standingsOf(state).filter((s) => !s.left);
    const puzzle = puzzleOf(state);
    return {
      category: null,
      difficulty: `${puzzle.size}x${puzzle.size}`,
      mode: state.mode,
      // Cells to fill, so `correct` (cells filled) reads as a share of them.
      rounds: toFill(puzzle),
      players: stayed.map((s, i) => ({
        playerId: s.playerId,
        placing: i + 1,
        score: s.filled * LOGIC_POINTS_PER_CELL,
        correct: s.filled,
      })),
    };
  },

  viewFor,
};
