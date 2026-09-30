import { z } from "zod";
import { seededRng, shuffled } from "../../random";
import { ELIMINATION_MIN_PLAYERS, keepCount, roundCount } from "../knockout/knockout";
import type { Level } from "../levels";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  connectionsSettingsSchema,
  DEFAULT_CONNECTIONS_SETTINGS,
  type ConnectionsGroup,
  type ConnectionsMode,
  type ConnectionsPuzzle,
  type ConnectionsSettings,
} from "./settings";

/*
 * Connections, in three modes, as Jigsaw has them. Classic and Speed are one puzzle, raced:
 * everyone gets the same sixteen words, and the first to find the four groups wins (Speed
 * against a countdown, where the most groups found wins if time runs out). Elimination is a new
 * puzzle each round, against the countdown: solving it keeps you safe, and of those who didn't,
 * the fewest groups found go out. Each round cuts about the same share of the players, as in
 * every game's Elimination, until two meet in the final.
 */

/** "Get ready" before the words can be picked, the same moment for everyone. */
export const CONNECTIONS_COUNTDOWN_MS = 3000;
/** Classic has no clock, but a player who walks away can't hold up the results forever. */
export const CONNECTIONS_CLASSIC_LIMIT_MS = 60 * 60_000;
/** How long a round's knock-outs show before the next round starts. */
export const CONNECTIONS_CUT_MS = 8000;
/** Wrong guesses allowed; the next one ends your puzzle. */
export const CONNECTIONS_MAX_MISTAKES = 4;
export const CONNECTIONS_GROUP_SIZE = 4;
/** Points per group found, for match history. The trickier groups are worth more. */
export const GROUP_POINTS = [100, 150, 200, 250] as const;
/** Guesses this early are accepted, to allow for small clock differences. */
const EARLY_TOLERANCE_MS = 1000;

export const connectionsActionSchema = z.object({
  type: z.literal("guess"),
  words: z.array(z.string().min(1).max(30)).length(CONNECTIONS_GROUP_SIZE),
});

export type ConnectionsAction = z.infer<typeof connectionsActionSchema>;

interface ConnectionsPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** Elimination: how many cuts had been made when they left. Back before the next, they carry on. */
  leftAfterCuts?: number;
  /** Joined an Elimination game after it started: watches. */
  spectator?: boolean;
  /** Groups found, by their index in the puzzle, in the order found. */
  found: number[];
  /** Wrong guesses, each sorted, so the same four twice is caught. */
  tried: string[][];
  /** Whether the last wrong guess had three of a group. */
  oneAway: boolean;
  startsAt: number;
  finishedAt: number | null;
  /** Out of mistakes, or out of time, before finding every group. */
  outOf: "mistakes" | "time" | null;
  /** When they last found a group, to break ties between equal counts. */
  lastFoundAt?: number | null;
  /** Elimination: the round (0-based) they were knocked out in, or null while still in. */
  outRound?: number | null;
  /** Elimination: 1 for the first knocked out, and so on; later is a better placing. */
  outOrder?: number | null;
}

export interface ConnectionsState {
  settings: ConnectionsSettings;
  mode: ConnectionsMode;
  /** One for Classic and Speed; for Elimination one per round, the final last. */
  puzzles: ConnectionsPuzzle[];
  /** Each puzzle's sixteen words in the order everyone sees them at the start. */
  orders: string[][];
  /** The puzzle being played. */
  round: number;
  players: ConnectionsPlayer[];
  /** Elimination: playing a round, or showing who went out of it. */
  phase: "play" | "cut";
  /** Elimination: when the current round's words can be picked. */
  roundStartsAt: number;
  /** Elimination: when the knock-outs stop showing and the next round starts. */
  phaseEndsAt: number | null;
  lastCut: { round: number; out: string[] } | null;
  knockedOut: number;
  winnerId: string | null;
  finishedAt: number | null;
}

export interface ConnectionsStanding {
  playerId: string;
  nickname: string;
  rank: number;
  /** Groups found. */
  found: number;
  mistakes: number;
  /** How long they took, once they found every group. */
  timeMs: number | null;
  solved: boolean;
  /** Done, one way or another. */
  done: boolean;
  left: boolean;
  /** Elimination: knocked out, and in which round (0-based). */
  out: boolean;
  outRound: number | null;
}

/** A group on show: its name, its words and its colour, 0 (plainest) to 3 (trickiest). */
export interface ConnectionsFoundGroup extends ConnectionsGroup {
  colour: number;
}

export interface ConnectionsView {
  game: "connections";
  mode: ConnectionsMode;
  level: Level;
  /** Words still to place, in board order. Null while watching: joined too late, or knocked out. */
  words: string[] | null;
  found: ConnectionsFoundGroup[];
  mistakesLeft: number;
  /** Wrong guesses so far. */
  tried: string[][];
  /** The last wrong guess had three words from one group. */
  oneAway: boolean;
  /** Every group, once your puzzle is over. */
  answer: ConnectionsFoundGroup[] | null;
  /** Server time the words can be picked. Before then, show a countdown. */
  startsAt: number | null;
  /** When the countdown runs out. Null in Classic, which shows no clock. */
  deadline: number | null;
  me: ConnectionsStanding | null;
  /** Everyone's progress: groups found, never which ones. */
  standings: ConnectionsStanding[];
  playerCount: number;
  final: boolean;
  /** Elimination: which round, and whether it's the final. Null in the other modes. */
  round: { index: number; total: number; final: boolean } | null;
  /** Elimination: who just went out, while that shows, and when the next round starts. */
  cut: { round: number; out: { playerId: string; nickname: string }[]; nextAt: number } | null;
  winnerId: string | null;
}

// Helpers -----------------------------------------------------------------------------------

const puzzleOf = (state: ConnectionsState) => state.puzzles[state.round]!;
const orderOf = (state: ConnectionsState) => state.orders[state.round]!;
const elimination = (state: ConnectionsState) => state.mode === "elimination";
const isFinal = (state: ConnectionsState) => state.round === state.puzzles.length - 1;
const done = (p: ConnectionsPlayer) => p.finishedAt !== null || p.outOf !== null;

/** Words are compared in capitals, so a guess needn't match the case shown. */
const key = (word: string) => word.trim().toUpperCase();

/** Playing now: not gone, and in Elimination not knocked out or watching. */
const contenders = (state: ConnectionsState) =>
  state.players.filter(
    (p) => !p.left && (!elimination(state) || (!p.spectator && (p.outRound ?? null) === null)),
  );

const limitFor = (state: ConnectionsState) =>
  state.mode === "classic" ? CONNECTIONS_CLASSIC_LIMIT_MS : state.settings.minutes * 60_000;

const deadlineOf = (state: ConnectionsState, p: ConnectionsPlayer) => p.startsAt + limitFor(state);

function freshPuzzle(p: ConnectionsPlayer, startsAt: number): ConnectionsPlayer {
  return {
    ...p,
    found: [],
    tried: [],
    oneAway: false,
    startsAt,
    finishedAt: null,
    outOf: null,
    lastFoundAt: null,
  };
}

function newPlayer(player: GamePlayer, startsAt: number): ConnectionsPlayer {
  return freshPuzzle(
    { id: player.id, nickname: player.nickname, left: false } as ConnectionsPlayer,
    startsAt,
  );
}

function timeOf(p: ConnectionsPlayer): number | null {
  return p.finishedAt === null ? null : p.finishedAt - p.startsAt;
}

/**
 * Best first within a round: solved, fastest first; then most groups found. The race breaks a
 * tie on fewer mistakes, as it always has; Elimination on who got there first, so of two level
 * at the line the later one goes out.
 */
function roundOrder(state: ConnectionsState) {
  return (a: ConnectionsPlayer, b: ConnectionsPlayer): number => {
    const mistakes = a.tried.length - b.tried.length;
    const reached = (a.lastFoundAt ?? Infinity) - (b.lastFoundAt ?? Infinity) || 0;
    return (
      Number(a.finishedAt === null) - Number(b.finishedAt === null) ||
      (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
      b.found.length - a.found.length ||
      (elimination(state) ? reached || mistakes : mistakes) ||
      a.nickname.localeCompare(b.nickname)
    );
  };
}

// The race: Classic and Speed ----------------------------------------------------------------

function finishRaceIfDone(state: ConnectionsState, now: number): ConnectionsState {
  if (state.finishedAt !== null || elimination(state)) return state;
  return contenders(state).every(done) ? { ...state, finishedAt: now } : state;
}

// Elimination --------------------------------------------------------------------------------

/** Cuts made so far. */
const cutsMade = (state: ConnectionsState) => (state.lastCut ? state.lastCut.round + 1 : 0);

/** Knock-out rounds still to play, this one included. */
const roundsLeft = (state: ConnectionsState) => state.puzzles.length - 1 - state.round;

/** How many stay in after this round. */
const keepAfterRound = (state: ConnectionsState) =>
  keepCount(contenders(state).length, Math.max(1, roundsLeft(state)));

function endRound(state: ConnectionsState, at: number): ConnectionsState {
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
    phaseEndsAt: at + CONNECTIONS_CUT_MS,
    lastCut: { round: state.round, out: out.map((p) => p.id) },
  };
}

function nextRound(state: ConnectionsState, now: number): ConnectionsState {
  const alive = contenders(state);
  if (alive.length <= 1) {
    return { ...state, winnerId: alive[0]?.id ?? null, finishedAt: now, phase: "play" };
  }
  // With two left, it's the final, however many rounds were planned.
  const round = alive.length <= 2 ? state.puzzles.length - 1 : state.round + 1;
  const startsAt = now + CONNECTIONS_COUNTDOWN_MS;
  const ids = new Set(alive.map((p) => p.id));
  return {
    ...state,
    round,
    phase: "play",
    phaseEndsAt: null,
    roundStartsAt: startsAt,
    players: state.players.map((p) => (ids.has(p.id) ? freshPuzzle(p, startsAt) : p)),
  };
}

/**
 * Ends the round once it's settled: everyone still in is done, enough have solved it that the
 * rest are out anyway, or (in the final) someone has solved it.
 */
function settleRound(state: ConnectionsState, now: number): ConnectionsState {
  if (!elimination(state) || state.finishedAt !== null || state.phase !== "play") return state;
  const alive = contenders(state);
  const solved = alive.filter((p) => p.finishedAt !== null).length;
  if (alive.length <= 1 || alive.every(done)) return endRound(state, now);
  if (isFinal(state) ? solved >= 1 : solved >= Math.min(alive.length, keepAfterRound(state))) {
    return endRound(state, now);
  }
  return state;
}

// Guesses ------------------------------------------------------------------------------------

function guess(
  state: ConnectionsState,
  player: ConnectionsPlayer,
  action: ConnectionsAction,
  now: number,
): ConnectionsState | Rejection {
  if (now < player.startsAt - EARLY_TOLERANCE_MS) return { rejected: "The puzzle hasn't started." };
  const puzzle = puzzleOf(state);
  const words = action.words.map(key);
  if (new Set(words).size !== words.length) return { rejected: "Pick four different words." };
  const placed = new Set(player.found.flatMap((g) => puzzle.groups[g]!.words.map(key)));
  const left = new Set(
    orderOf(state)
      .map(key)
      .filter((w) => !placed.has(w)),
  );
  if (!words.every((w) => left.has(w))) return { rejected: "Pick words from the board." };
  const sorted = [...words].sort();
  if (player.tried.some((t) => t.join("|") === sorted.join("|"))) {
    return { rejected: "You've tried those four." };
  }

  const groups = puzzle.groups;
  const hits = groups.map((g) => g.words.filter((w) => words.includes(key(w))).length);
  const match = hits.findIndex((n) => n === CONNECTIONS_GROUP_SIZE);
  let updated: ConnectionsPlayer;
  if (match >= 0) {
    const found = [...player.found, match];
    updated = {
      ...player,
      found,
      oneAway: false,
      finishedAt: found.length === groups.length ? now : null,
      lastFoundAt: now,
    };
  } else {
    const tried = [...player.tried, sorted];
    updated = {
      ...player,
      tried,
      oneAway: hits.some((n) => n === CONNECTIONS_GROUP_SIZE - 1),
      outOf: tried.length >= CONNECTIONS_MAX_MISTAKES ? "mistakes" : null,
    };
  }
  const players = state.players.map((p) => (p.id === player.id ? updated : p));
  return settleRound(finishRaceIfDone({ ...state, players }, now), now);
}

// Views ------------------------------------------------------------------------------------

/**
 * Everyone, best first. The race: solved fastest first, then most groups found, then fewest
 * mistakes. Elimination: the winner, then everyone still in by this round, then the knocked
 * out, latest out first.
 */
export function standingsOf(raw: ConnectionsState): ConnectionsStanding[] {
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
    found: p.found.length,
    mistakes: p.tried.length,
    timeMs: timeOf(p),
    solved: p.finishedAt !== null,
    done: done(p),
    left: p.left,
    out: (p.outRound ?? null) !== null,
    outRound: p.outRound ?? null,
  }));
}

const shown = (puzzle: ConnectionsPuzzle, index: number): ConnectionsFoundGroup => ({
  ...puzzle.groups[index]!,
  colour: index,
});

function viewFor(raw: ConnectionsState, playerId: string): ConnectionsView {
  const state = upgrade(raw);
  const puzzle = puzzleOf(state);
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const playing = player && contenders(state).includes(player) ? player : null;
  const placed = new Set((playing?.found ?? []).flatMap((g) => puzzle.groups[g]!.words.map(key)));
  const over = (!!playing && done(playing)) || state.finishedAt !== null;
  const names = new Map(state.players.map((p) => [p.id, p.nickname]));
  return {
    game: "connections",
    mode: state.mode,
    level: puzzle.level,
    words: playing ? orderOf(state).filter((w) => !placed.has(key(w))) : null,
    found: (playing?.found ?? []).map((g) => shown(puzzle, g)),
    mistakesLeft: CONNECTIONS_MAX_MISTAKES - (playing?.tried.length ?? 0),
    tried: playing?.tried ?? [],
    oneAway: playing?.oneAway ?? false,
    answer: over ? puzzle.groups.map((_, i) => shown(puzzle, i)) : null,
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
 * Games stored before modes and rounds: one puzzle, raced against the clock. They carry on as
 * Speed races under the new rules, so a game running when this arrives isn't lost.
 */
type LegacyState = { puzzle: ConnectionsPuzzle; order: string[] };
function upgrade(state: ConnectionsState): ConnectionsState {
  if ("puzzles" in state && Array.isArray(state.puzzles)) return state;
  const old = state as unknown as ConnectionsState & LegacyState;
  return {
    settings: connectionsSettingsSchema.parse(old.settings),
    mode: "speed",
    puzzles: [old.puzzle],
    orders: [old.order],
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

/** Puzzles an Elimination game plays: one per knock-out round, and the final. */
const eliminationStages = (players: number) =>
  roundCount(Math.max(players, ELIMINATION_MIN_PLAYERS)) + 1;

// Module -----------------------------------------------------------------------------------

export const connectionsGame: GameModule<
  ConnectionsSettings,
  ConnectionsPuzzle[],
  ConnectionsState,
  ConnectionsAction,
  ConnectionsView
> = {
  id: "connections",
  name: "Connections",
  minPlayers: 1,
  maxPlayers: 20,
  settingsSchema: connectionsSettingsSchema,
  defaultSettings: DEFAULT_CONNECTIONS_SETTINGS,
  actionSchema: connectionsActionSchema,

  playersNeeded: (settings) =>
    settings.mode === "elimination"
      ? {
          min: ELIMINATION_MIN_PLAYERS,
          message: `Elimination needs at least ${ELIMINATION_MIN_PLAYERS} players.`,
        }
      : null,

  contentNeeded: (settings, players) => ({
    kind: "connections-puzzle",
    level: settings.level,
    ...(settings.mode === "elimination" ? { count: eliminationStages(players) } : {}),
  }),

  setup({ settings, players, content, seed, now }) {
    const rng = seededRng(seed);
    const mode = settings.mode;
    const stages = mode === "elimination" ? eliminationStages(players.length) : 1;
    // A bank with fewer puzzles than rounds comes round again rather than stopping short.
    const puzzles = Array.from({ length: stages }, (_, i) => content[i % content.length]!);
    const orders = puzzles.map((puzzle) =>
      shuffled(
        puzzle.groups.flatMap((g) => g.words),
        rng,
      ),
    );
    const startsAt = now + CONNECTIONS_COUNTDOWN_MS;
    return {
      settings,
      mode,
      puzzles,
      orders,
      round: 0,
      players: players.map((p) => newPlayer(p, startsAt)),
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
    if (player.finishedAt !== null) return { rejected: "You've found them all." };
    if (player.outOf === "mistakes") return { rejected: "You're out of mistakes." };
    if (player.outOf === "time") return { rejected: "Your time is up." };
    return guess(state, player, action, now);
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
    const joined = newPlayer(player, now + CONNECTIONS_COUNTDOWN_MS);
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
      difficulty: puzzle.level,
      mode: state.mode,
      // Groups, so `correct` (groups found) reads as a share of them.
      rounds: puzzle.groups.length,
      players: stayed.map((s, i) => {
        const player = state.players.find((p) => p.id === s.playerId)!;
        return {
          playerId: s.playerId,
          placing: i + 1,
          score: player.found.reduce((sum, g) => sum + (GROUP_POINTS[g] ?? 0), 0),
          correct: s.found,
        };
      }),
    };
  },

  viewFor,
};
