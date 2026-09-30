import { z } from "zod";
import { seededRng } from "../../random";
import type { GameModule, GamePlayer, Rejection } from "../types";
import { logicPuzzle, type LogicPuzzle } from "./grid";
import {
  DEFAULT_LOGIC_SETTINGS,
  logicSettingsSchema,
  type LogicSettings,
  type LogicSize,
} from "./settings";

/** "Get ready" before the grid can be filled, the same moment for everyone. */
export const LOGIC_COUNTDOWN_MS = 3000;
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
  /** Numbers this player has placed, by cell; 0 where they haven't. */
  entries: number[];
  mistakes: number;
  /** The last wrong number, so it can flash on the grid. */
  lastWrong: { cell: number; value: number; at: number } | null;
  startsAt: number;
  finishedAt: number | null;
  /** Out of mistakes, or out of time, before filling the grid. */
  outOf: "mistakes" | "time" | null;
}

export interface LogicState {
  settings: LogicSettings;
  puzzle: LogicPuzzle;
  players: LogicPlayer[];
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
}

export interface LogicView {
  game: "logic";
  size: LogicSize;
  boxRows: number;
  boxCols: number;
  givens: number[];
  /** The grid as you've filled it, clues included. Null while watching a game you joined too late for. */
  grid: number[] | null;
  mistakesLeft: number;
  lastWrong: { cell: number; value: number; at: number } | null;
  /** The whole grid, once your puzzle is over. */
  solution: number[] | null;
  /** Server time the grid can be filled. Before then, show a countdown. */
  startsAt: number | null;
  deadline: number | null;
  me: LogicStanding | null;
  /** Everyone's progress: cells filled, never their grids. */
  standings: LogicStanding[];
  playerCount: number;
  final: boolean;
}

const limitMs = (state: LogicState) => state.settings.minutes * 60_000;
const active = (state: LogicState) => state.players.filter((p) => !p.left);
const done = (p: LogicPlayer) => p.finishedAt !== null || p.outOf !== null;
const toFill = (state: LogicState) => state.puzzle.givens.filter((n) => n === 0).length;
const filledOf = (p: LogicPlayer) => p.entries.filter((n) => n !== 0).length;

function newPlayer(state: Pick<LogicState, "puzzle">, player: GamePlayer, startsAt: number) {
  return {
    id: player.id,
    nickname: player.nickname,
    left: false,
    entries: state.puzzle.givens.map(() => 0),
    mistakes: 0,
    lastWrong: null,
    startsAt,
    finishedAt: null,
    outOf: null,
  } satisfies LogicPlayer;
}

function finishIfEveryoneDone(state: LogicState, now: number): LogicState {
  if (state.finishedAt !== null) return state;
  if (!active(state).every(done)) return state;
  return { ...state, finishedAt: now };
}

function place(
  state: LogicState,
  player: LogicPlayer,
  action: LogicAction,
  now: number,
): LogicState | Rejection {
  const { givens, solution, size } = state.puzzle;
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
    const solved = entries.filter((n) => n !== 0).length === toFill(state);
    updated = { ...player, entries, finishedAt: solved ? now : null };
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
  return finishIfEveryoneDone({ ...state, players }, now);
}

// Views ------------------------------------------------------------------------------------

function timeOf(p: LogicPlayer): number | null {
  return p.finishedAt === null ? null : p.finishedAt - p.startsAt;
}

/** Solved first, fastest first; then most cells filled; then fewest mistakes. */
export function standingsOf(state: LogicState): LogicStanding[] {
  const total = toFill(state);
  const rows = [...state.players].sort(
    (a, b) =>
      Number(a.left) - Number(b.left) ||
      Number(a.finishedAt === null) - Number(b.finishedAt === null) ||
      (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
      filledOf(b) - filledOf(a) ||
      a.mistakes - b.mistakes ||
      a.nickname.localeCompare(b.nickname),
  );
  return rows.map((p, i) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    filled: filledOf(p),
    total,
    mistakes: p.mistakes,
    timeMs: timeOf(p),
    solved: p.finishedAt !== null,
    done: done(p),
    left: p.left,
  }));
}

function viewFor(state: LogicState, playerId: string): LogicView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const playing = player && !player.left ? player : null;
  const { size, boxRows, boxCols, givens, solution } = state.puzzle;
  const over = (playing && done(playing)) || state.finishedAt !== null;
  return {
    game: "logic",
    size,
    boxRows,
    boxCols,
    givens,
    grid: playing ? givens.map((n, cell) => n || playing.entries[cell]!) : null,
    mistakesLeft: LOGIC_MAX_MISTAKES - (playing?.mistakes ?? 0),
    lastWrong: playing?.lastWrong ?? null,
    solution: over ? solution : null,
    startsAt: playing ? playing.startsAt : null,
    deadline: playing ? playing.startsAt + limitMs(state) : null,
    me: standings.find((s) => s.playerId === playerId) ?? null,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
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

  // Every grid is made from the seed; nothing comes from the content bank.
  contentNeeded: () => null,

  setup({ settings, players, seed, now }) {
    const puzzle = logicPuzzle(settings.size, seededRng(seed));
    const startsAt = now + LOGIC_COUNTDOWN_MS;
    return {
      settings,
      puzzle,
      players: players.map((p) => newPlayer({ puzzle }, p, startsAt)),
      finishedAt: null,
    };
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return { rejected: "The game is over." };
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return { rejected: "You're watching this game." };
    if (player.finishedAt !== null) return { rejected: "You've solved it." };
    if (player.outOf === "mistakes") return { rejected: "You're out of mistakes." };
    if (player.outOf === "time") return { rejected: "Your time is up." };
    return place(state, player, action, now);
  },

  onPlayerJoined(state, player, now) {
    if (state.finishedAt !== null) return state;
    // Back after leaving: the puzzle is as they left it, on the same clock.
    if (state.players.some((p) => p.id === player.id)) {
      return {
        ...state,
        players: state.players.map((p) => (p.id === player.id ? { ...p, left: false } : p)),
      };
    }
    // A late joiner gets the same grid, with their own countdown and clock.
    return {
      ...state,
      players: [...state.players, newPlayer(state, player, now + LOGIC_COUNTDOWN_MS)],
    };
  },

  onPlayerLeft(state, playerId, now) {
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    return finishIfEveryoneDone({ ...state, players }, now);
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    const players = state.players.map((p) =>
      !p.left && !done(p) && now >= p.startsAt + limitMs(state)
        ? { ...p, outOf: "time" as const }
        : p,
    );
    return finishIfEveryoneDone({ ...state, players }, now);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    const times = active(state)
      .filter((p) => !done(p))
      .map((p) => p.startsAt + limitMs(state));
    return times.length > 0 ? Math.min(...times) : null;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: null,
      difficulty: `${state.puzzle.size}x${state.puzzle.size}`,
      mode: "race",
      // Cells to fill, so `correct` (cells filled) reads as a share of them.
      rounds: toFill(state),
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
