import { z } from "zod";
import { seededRng, shuffled, type Rng } from "../../random";
import { ELIMINATION_MIN_PLAYERS, keepCount, roundCount } from "../knockout/knockout";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  DEFAULT_JIGSAW_SETTINGS,
  JIGSAW_LEVELS,
  JIGSAW_PICTURES,
  isInsane,
  jigsawGrid,
  jigsawSettingsSchema,
  type JigsawLevel,
  type JigsawLevelChoice,
  type JigsawMode,
  type JigsawPicture,
  type JigsawSettings,
} from "./settings";

/*
 * Jigsaw, in three modes. Classic and Speed are one puzzle, raced: everyone gets the same one,
 * and the first to finish wins (Speed against a countdown, where the most pieces placed wins if
 * time runs out). Elimination is a new puzzle each round, against the countdown: finishing keeps
 * you safe, and of those who didn't, the fewest pieces placed go out. Each round cuts about the
 * same share of the players, as in every game's Elimination, until two meet in the final.
 */

/** "Get ready" before the pieces can move, the same moment for everyone. */
export const JIGSAW_COUNTDOWN_MS = 3000;
/** Classic has no clock, but a player who walks away can't hold up the results forever. */
export const JIGSAW_CLASSIC_LIMIT_MS = 60 * 60_000;
/** How long a round's knock-outs show before the next round starts. */
export const JIGSAW_CUT_MS = 8000;
/** Moves this early are accepted, to allow for small clock differences. */
const EARLY_TOLERANCE_MS = 1000;
/** Points per piece in its place, for match history. */
export const POINTS_PER_PIECE = 100;

/** Seconds a dragged piece takes, as a fair pace, and the extra on top for a slower player. */
const DRAG_SECONDS_PER_PIECE = 7;
const DRAG_EXTRA_SECONDS = 300;

/**
 * The countdown for a puzzle, in Speed and Elimination: a fair pace for dragging its pieces,
 * with five minutes extra, rounded up to the half minute. Easy is 7:00, Medium 8:00, Hard
 * 9:30 and Insane (a hundred pieces) 17:00.
 */
export function jigsawTimeLimit(level: JigsawLevel, pieces: number): number {
  const seconds = pieces * DRAG_SECONDS_PER_PIECE + DRAG_EXTRA_SECONDS;
  return Math.ceil(seconds / 30) * 30_000;
}

export const jigsawActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("swap"),
    /** Two spots on the board, numbered left to right, top to bottom. */
    a: z.number().int().min(0),
    b: z.number().int().min(0),
  }),
  /** Insane: a piece dropped on its own spot on the canvas. */
  z.object({ type: z.literal("place"), piece: z.number().int().min(0) }),
]);

export type JigsawAction = z.infer<typeof jigsawActionSchema>;

/** What a game draws: the picture, with an ID for the room's history. */
export interface JigsawContent {
  id: string;
  picture: JigsawPicture;
}

/** One puzzle: a picture cut at a level. Everyone playing it starts from the same place. */
export interface JigsawPuzzle {
  picture: JigsawPicture;
  level: JigsawLevel;
  cols: number;
  rows: number;
  /** The shuffled board everyone starts from; in Insane every spot is empty (-1). */
  start: number[];
  /** Insane: the order the pieces lie in the tray. Null otherwise. */
  tray: number[] | null;
}

interface JigsawPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** Elimination: how many cuts had been made when they left. Back before the next, they carry on. */
  leftAfterCuts?: number;
  /** Joined an Elimination game after it started: watches. */
  spectator?: boolean;
  /**
   * `board[spot]` is the piece in that spot. Piece `n` belongs in spot `n`. In Insane a spot
   * holds its own piece once placed, and -1 until then.
   */
  board: number[];
  moves: number;
  /** When this player's pieces can move. */
  startsAt: number;
  finishedAt: number | null;
  /** Their time ran out before they finished. */
  outOfTime: boolean;
  /** When they last put a piece in its place, to break ties between equal counts. */
  lastPlacedAt?: number | null;
  /** Elimination: the round (0-based) they were knocked out in, or null while still in. */
  outRound?: number | null;
  /** Elimination: 1 for the first knocked out, and so on; later is a better placing. */
  outOrder?: number | null;
}

export interface JigsawState {
  settings: JigsawSettings;
  mode: JigsawMode;
  /** One for Classic and Speed; for Elimination one per round, the final last. */
  puzzles: JigsawPuzzle[];
  /** The puzzle being played. */
  round: number;
  players: JigsawPlayer[];
  /** Elimination: playing a round, or showing who went out of it. */
  phase: "play" | "cut";
  /** Elimination: when the current round's pieces can move. */
  roundStartsAt: number;
  /** Elimination: when the knock-outs stop showing and the next round starts. */
  phaseEndsAt: number | null;
  lastCut: { round: number; out: string[] } | null;
  knockedOut: number;
  winnerId: string | null;
  finishedAt: number | null;
}

export interface JigsawStanding {
  playerId: string;
  nickname: string;
  rank: number;
  /** Pieces in their place. */
  placed: number;
  total: number;
  /** How long they took, once finished. */
  timeMs: number | null;
  moves: number;
  finished: boolean;
  outOfTime: boolean;
  left: boolean;
  /** Elimination: knocked out, and in which round (0-based). */
  out: boolean;
  outRound: number | null;
}

export interface JigsawView {
  game: "jigsaw";
  mode: JigsawMode;
  level: JigsawLevel;
  picture: JigsawPicture;
  cols: number;
  rows: number;
  /** Null while watching: joined too late, or knocked out. */
  board: number[] | null;
  /** Insane: every piece in the tray's order, placed ones included. Null otherwise. */
  tray: number[] | null;
  /** Server time your pieces can move. Before then, show a countdown. */
  startsAt: number | null;
  /** When the countdown runs out. Null in Classic, which shows no clock. */
  deadline: number | null;
  moves: number;
  me: JigsawStanding | null;
  /** Everyone's progress: pieces placed, never their boards. */
  standings: JigsawStanding[];
  playerCount: number;
  final: boolean;
  /** Elimination: which round, and whether it's the final. Null in the other modes. */
  round: { index: number; total: number; final: boolean } | null;
  /** Elimination: who just went out, while that shows, and when the next round starts. */
  cut: { round: number; out: { playerId: string; nickname: string }[]; nextAt: number } | null;
  winnerId: string | null;
}

/** A shuffled board of `count` pieces with no piece already in its place. */
export function scrambled(count: number, rng: Rng): number[] {
  const board = shuffled(
    Array.from({ length: count }, (_, i) => i),
    rng,
  );
  for (let i = 0; i < count; i++) {
    if (board[i] !== i) continue;
    const j = (i + 1) % count;
    [board[i], board[j]] = [board[j]!, board[i]!];
  }
  return board;
}

export const placedCount = (board: readonly number[]) =>
  board.reduce((n, piece, spot) => n + (piece === spot ? 1 : 0), 0);

export function makePuzzle(picture: JigsawPicture, level: JigsawLevel, rng: Rng): JigsawPuzzle {
  // Only a photo that kept its own shape is cut in it; the rest are square.
  const { cols, rows } = jigsawGrid(level, isInsane(level) ? (picture.aspect ?? 1) : 1);
  const count = cols * rows;
  const pieces = Array.from({ length: count }, (_, i) => i);
  // Every level is dragged out of a tray onto the canvas, like Insane used to be alone.
  // Puzzles saved before this (tray null) still swap, so those games carry on.
  return { picture, level, cols, rows, start: pieces.map(() => -1), tray: shuffled(pieces, rng) };
}

/**
 * The level of each Elimination round, the final last. Auto climbs from Easy to Insane for the
 * final; any other choice is every round.
 */
export function jigsawLevelPlan(choice: JigsawLevelChoice, stages: number): JigsawLevel[] {
  if (choice !== "auto") return Array<JigsawLevel>(stages).fill(choice);
  const levels = JIGSAW_LEVELS.map((l) => l.id);
  const last = Math.max(1, stages - 1);
  return Array.from({ length: stages }, (_, i) =>
    stages === 1 ? "insane" : levels[Math.round((i / last) * (levels.length - 1))]!,
  );
}

// Helpers -----------------------------------------------------------------------------------

const puzzleOf = (state: JigsawState) => state.puzzles[state.round]!;
const pieceCount = (puzzle: JigsawPuzzle) => puzzle.cols * puzzle.rows;
const elimination = (state: JigsawState) => state.mode === "elimination";
const isFinal = (state: JigsawState) => state.round === state.puzzles.length - 1;
const done = (p: JigsawPlayer) => p.finishedAt !== null || p.outOfTime;

/** Playing now: not gone, and in Elimination not knocked out or watching. */
const contenders = (state: JigsawState) =>
  state.players.filter(
    (p) => !p.left && (!elimination(state) || (!p.spectator && (p.outRound ?? null) === null)),
  );

function limitFor(state: JigsawState): number {
  if (state.mode === "classic") return JIGSAW_CLASSIC_LIMIT_MS;
  const puzzle = puzzleOf(state);
  return jigsawTimeLimit(puzzle.level, pieceCount(puzzle));
}

const deadlineOf = (state: JigsawState, p: JigsawPlayer) => p.startsAt + limitFor(state);

function freshBoard(p: JigsawPlayer, puzzle: JigsawPuzzle, startsAt: number): JigsawPlayer {
  return {
    ...p,
    board: [...puzzle.start],
    moves: 0,
    startsAt,
    finishedAt: null,
    outOfTime: false,
    lastPlacedAt: null,
  };
}

function newPlayer(player: GamePlayer, puzzle: JigsawPuzzle, startsAt: number): JigsawPlayer {
  return freshBoard(
    { id: player.id, nickname: player.nickname, left: false } as JigsawPlayer,
    puzzle,
    startsAt,
  );
}

/** Best first within a round: finished, fastest first; then most pieces, reached soonest. */
function roundOrder(a: JigsawPlayer, b: JigsawPlayer): number {
  const time = (p: JigsawPlayer) => (p.finishedAt === null ? Infinity : p.finishedAt - p.startsAt);
  return (
    Number(a.finishedAt === null) - Number(b.finishedAt === null) ||
    time(a) - time(b) ||
    placedCount(b.board) - placedCount(a.board) ||
    (a.lastPlacedAt ?? Infinity) - (b.lastPlacedAt ?? Infinity) ||
    a.moves - b.moves ||
    a.nickname.localeCompare(b.nickname)
  );
}

// The race: Classic and Speed ----------------------------------------------------------------

function finishRaceIfDone(state: JigsawState, now: number): JigsawState {
  if (state.finishedAt !== null || elimination(state)) return state;
  return contenders(state).every(done) ? { ...state, finishedAt: now } : state;
}

// Elimination --------------------------------------------------------------------------------

/** Cuts made so far. */
const cutsMade = (state: JigsawState) => (state.lastCut ? state.lastCut.round + 1 : 0);

/** Knock-out rounds still to play, this one included. */
const roundsLeft = (state: JigsawState) => state.puzzles.length - 1 - state.round;

/** How many stay in after this round. */
const keepAfterRound = (state: JigsawState) =>
  keepCount(contenders(state).length, Math.max(1, roundsLeft(state)));

function endRound(state: JigsawState, at: number): JigsawState {
  const alive = contenders(state).sort(roundOrder);
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
    phaseEndsAt: at + JIGSAW_CUT_MS,
    lastCut: { round: state.round, out: out.map((p) => p.id) },
  };
}

function nextRound(state: JigsawState, now: number): JigsawState {
  const alive = contenders(state);
  if (alive.length <= 1) {
    return { ...state, winnerId: alive[0]?.id ?? null, finishedAt: now, phase: "play" };
  }
  // With two left, it's the final, however many rounds were planned.
  const round = alive.length <= 2 ? state.puzzles.length - 1 : state.round + 1;
  const puzzle = state.puzzles[round]!;
  const startsAt = now + JIGSAW_COUNTDOWN_MS;
  const ids = new Set(alive.map((p) => p.id));
  return {
    ...state,
    round,
    phase: "play",
    phaseEndsAt: null,
    roundStartsAt: startsAt,
    players: state.players.map((p) => (ids.has(p.id) ? freshBoard(p, puzzle, startsAt) : p)),
  };
}

/**
 * Ends the round once it's settled: everyone still in has finished, enough have finished that
 * the rest are out anyway, or (in the final) someone has finished.
 */
function settleRound(state: JigsawState, now: number): JigsawState {
  if (!elimination(state) || state.finishedAt !== null || state.phase !== "play") return state;
  const alive = contenders(state);
  const finished = alive.filter((p) => p.finishedAt !== null).length;
  if (alive.length <= 1) return endRound(state, now);
  if (isFinal(state) ? finished >= 1 : finished >= Math.min(alive.length, keepAfterRound(state))) {
    return endRound(state, now);
  }
  return state;
}

// Moves --------------------------------------------------------------------------------------

function move(
  state: JigsawState,
  player: JigsawPlayer,
  action: JigsawAction,
  now: number,
): JigsawState | Rejection {
  const puzzle = puzzleOf(state);
  const count = pieceCount(puzzle);
  if (now < player.startsAt - EARLY_TOLERANCE_MS) return { rejected: "The puzzle hasn't started." };
  const board = [...player.board];
  const before = placedCount(board);
  // Drag puzzles (tray present) place pieces; puzzles saved before trays still swap.
  const drag = puzzle.tray !== null;
  if (action.type === "place") {
    if (!drag) return { rejected: "Pieces swap in this puzzle." };
    const { piece } = action;
    if (piece >= count) return { rejected: "There's no such piece." };
    if (board[piece] === piece) return { rejected: "That piece is already in its place." };
    board[piece] = piece;
  } else {
    if (drag) return { rejected: "Drag the pieces onto the picture." };
    const { a, b } = action;
    if (a >= count || b >= count || a === b) return { rejected: "Those pieces can’t swap." };
    // Pieces in their place are locked.
    if (board[a] === a || board[b] === b) {
      return { rejected: "That piece is already in its place." };
    }
    [board[a], board[b]] = [board[b]!, board[a]!];
  }
  const placed = placedCount(board);
  const updated: JigsawPlayer = {
    ...player,
    board,
    moves: player.moves + 1,
    finishedAt: placed === count ? now : null,
    lastPlacedAt: placed > before ? now : (player.lastPlacedAt ?? null),
  };
  const players = state.players.map((p) => (p.id === player.id ? updated : p));
  return settleRound(finishRaceIfDone({ ...state, players }, now), now);
}

// Views ------------------------------------------------------------------------------------

/**
 * Everyone, best first. The race: finished fastest first, then most pieces. Elimination: the
 * winner, then everyone still in by this round, then the knocked out, latest out first.
 */
export function standingsOf(state: JigsawState): JigsawStanding[] {
  const total = pieceCount(puzzleOf(state));
  const rows = [...state.players].sort(
    (a, b) =>
      Number(a.left) - Number(b.left) ||
      Number(b.id === state.winnerId) - Number(a.id === state.winnerId) ||
      Number(!!a.spectator) - Number(!!b.spectator) ||
      Number((a.outRound ?? null) !== null) - Number((b.outRound ?? null) !== null) ||
      (b.outOrder ?? 0) - (a.outOrder ?? 0) ||
      roundOrder(a, b),
  );
  return rows.map((p, i) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    placed: placedCount(p.board),
    total,
    timeMs: p.finishedAt === null ? null : p.finishedAt - p.startsAt,
    moves: p.moves,
    finished: p.finishedAt !== null,
    outOfTime: p.outOfTime,
    left: p.left,
    out: (p.outRound ?? null) !== null,
    outRound: p.outRound ?? null,
  }));
}

function viewFor(raw: JigsawState, playerId: string): JigsawView {
  const state = upgrade(raw);
  const puzzle = puzzleOf(state);
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const playing = player && contenders(state).includes(player) ? player : null;
  const names = new Map(state.players.map((p) => [p.id, p.nickname]));
  return {
    game: "jigsaw",
    mode: state.mode,
    level: puzzle.level,
    picture: puzzle.picture,
    cols: puzzle.cols,
    rows: puzzle.rows,
    board: playing ? playing.board : null,
    tray: playing ? puzzle.tray : null,
    startsAt: playing ? playing.startsAt : elimination(state) ? state.roundStartsAt : null,
    deadline:
      state.mode === "classic"
        ? null
        : playing
          ? deadlineOf(state, playing)
          : elimination(state)
            ? state.roundStartsAt + limitFor(state)
            : null,
    moves: playing?.moves ?? 0,
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
 * Games stored before modes and rounds: one puzzle, raced. They carry on as Speed-like races
 * under the new rules, so a game running when this arrives isn't lost.
 */
type LegacyState = {
  picture: JigsawPicture;
  side: number;
  start: number[];
  tray?: number[] | null;
};
function upgrade(state: JigsawState): JigsawState {
  if ("puzzles" in state && Array.isArray(state.puzzles)) return state;
  const old = state as unknown as JigsawState & LegacyState;
  const level: JigsawLevel =
    old.side >= 10 ? "insane" : old.side >= 6 ? "hard" : old.side >= 5 ? "medium" : "easy";
  const puzzle: JigsawPuzzle = {
    picture: old.picture,
    level,
    cols: old.side,
    rows: old.side,
    start: old.start,
    tray: old.tray ?? null,
  };
  return {
    settings: jigsawSettingsSchema.parse(old.settings),
    mode: "classic",
    puzzles: [puzzle],
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

/** The pictures for an Elimination game's rounds: the chosen one first, then others. */
function roundPictures(first: JigsawPicture, count: number, rng: Rng): JigsawPicture[] {
  const others = shuffled(
    JIGSAW_PICTURES.filter((p) => p.id !== first.id),
    rng,
  );
  return [first, ...Array.from({ length: count - 1 }, (_, i) => others[i % others.length]!)];
}

// Module -----------------------------------------------------------------------------------

export const jigsawGame: GameModule<
  JigsawSettings,
  JigsawContent[],
  JigsawState,
  JigsawAction,
  JigsawView
> = {
  id: "jigsaw",
  name: "Jigsaw",
  minPlayers: 1,
  maxPlayers: 20,
  settingsSchema: jigsawSettingsSchema,
  defaultSettings: DEFAULT_JIGSAW_SETTINGS,
  actionSchema: jigsawActionSchema,

  playersNeeded: (settings) =>
    settings.mode === "elimination"
      ? {
          min: ELIMINATION_MIN_PLAYERS,
          message: `Elimination needs at least ${ELIMINATION_MIN_PLAYERS} players.`,
        }
      : null,

  contentNeeded: (settings) => ({
    kind: "jigsaw-picture",
    picture: settings.picture,
    ...(settings.picture === "photo" && settings.photo
      ? {
          photo: settings.photo,
          ...(settings.photoAspect !== undefined ? { photoAspect: settings.photoAspect } : {}),
        }
      : {}),
  }),

  setup({ settings, players, content, seed, now }) {
    const rng = seededRng(seed);
    const mode = settings.mode;
    const first = content[0]!.picture;
    const stages =
      mode === "elimination"
        ? roundCount(Math.max(players.length, ELIMINATION_MIN_PLAYERS)) + 1
        : 1;
    const levels =
      mode === "elimination"
        ? jigsawLevelPlan(settings.level, stages)
        : [settings.level === "auto" ? "easy" : settings.level];
    const pictures = roundPictures(first, stages, rng);
    const puzzles = levels.map((level, i) => makePuzzle(pictures[i]!, level, rng));
    const startsAt = now + JIGSAW_COUNTDOWN_MS;
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
    if (!player || player.left) return { rejected: "You're watching this game." };
    if (!contenders(state).includes(player)) return { rejected: "You're watching this game." };
    if (state.phase === "cut") return { rejected: "The next round hasn't started." };
    if (player.finishedAt !== null) return { rejected: "You've finished." };
    if (player.outOfTime || (state.mode !== "classic" && now >= deadlineOf(state, player))) {
      return { rejected: "Your time is up." };
    }
    return move(state, player, action, now);
  },

  onPlayerJoined(raw, player, now) {
    const state = upgrade(raw);
    if (state.finishedAt !== null) return state;
    const known = state.players.find((p) => p.id === player.id);
    if (known) {
      // Back after leaving. In the race, the puzzle is as they left it, on the same clock. In
      // Elimination they carry on in the round they left; after a cut, they watch.
      const missedCut = elimination(state) && (known.leftAfterCuts ?? 0) < cutsMade(state);
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === player.id ? { ...p, left: false, ...(missedCut ? { spectator: true } : {}) } : p,
        ),
      };
    }
    // Elimination: a newcomer watches. The race: they get the same puzzle, with their own clock.
    const joined = newPlayer(player, puzzleOf(state), now + JIGSAW_COUNTDOWN_MS);
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
        contenders(state).includes(p) && !done(p) ? { ...p, outOfTime: true } : p,
      );
      return endRound({ ...state, players }, deadline);
    }
    const players = state.players.map((p) =>
      !p.left && !done(p) && now >= deadlineOf(state, p) ? { ...p, outOfTime: true } : p,
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
      category: puzzle.picture.id,
      difficulty: puzzle.level,
      mode: state.mode,
      // Pieces, so `correct` (pieces placed) reads as a share of them.
      rounds: pieceCount(puzzle),
      players: stayed.map((s, i) => ({
        playerId: s.playerId,
        placing: i + 1,
        score: s.placed * POINTS_PER_PIECE,
        correct: s.placed,
      })),
    };
  },

  viewFor,
};
