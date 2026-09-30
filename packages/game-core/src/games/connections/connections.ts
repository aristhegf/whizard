import { z } from "zod";
import { seededRng, shuffled } from "../../random";
import type { Level } from "../levels";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  connectionsSettingsSchema,
  DEFAULT_CONNECTIONS_SETTINGS,
  type ConnectionsGroup,
  type ConnectionsPuzzle,
  type ConnectionsSettings,
} from "./settings";

/** "Get ready" before the words can be picked, the same moment for everyone. */
export const CONNECTIONS_COUNTDOWN_MS = 3000;
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
}

export interface ConnectionsState {
  settings: ConnectionsSettings;
  puzzle: ConnectionsPuzzle;
  /** The sixteen words in the order everyone sees them at the start. */
  order: string[];
  players: ConnectionsPlayer[];
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
}

/** A group on show: its name, its words and its colour, 0 (plainest) to 3 (trickiest). */
export interface ConnectionsFoundGroup extends ConnectionsGroup {
  colour: number;
}

export interface ConnectionsView {
  game: "connections";
  level: Level;
  /** Words still to place, in board order. Null while watching a game you joined too late for. */
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
  deadline: number | null;
  me: ConnectionsStanding | null;
  /** Everyone's progress: groups found, never which ones. */
  standings: ConnectionsStanding[];
  playerCount: number;
  final: boolean;
}

const limitMs = (state: ConnectionsState) => state.settings.minutes * 60_000;
const active = (state: ConnectionsState) => state.players.filter((p) => !p.left);
const done = (p: ConnectionsPlayer) => p.finishedAt !== null || p.outOf !== null;
const groupCount = (state: ConnectionsState) => state.puzzle.groups.length;

/** Words are compared in capitals, so a guess needn't match the case shown. */
const key = (word: string) => word.trim().toUpperCase();

function newPlayer(player: GamePlayer, startsAt: number): ConnectionsPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    left: false,
    found: [],
    tried: [],
    oneAway: false,
    startsAt,
    finishedAt: null,
    outOf: null,
  };
}

function finishIfEveryoneDone(state: ConnectionsState, now: number): ConnectionsState {
  if (state.finishedAt !== null) return state;
  if (!active(state).every(done)) return state;
  return { ...state, finishedAt: now };
}

function guess(
  state: ConnectionsState,
  player: ConnectionsPlayer,
  action: ConnectionsAction,
  now: number,
): ConnectionsState | Rejection {
  if (now < player.startsAt - EARLY_TOLERANCE_MS) return { rejected: "The puzzle hasn't started." };
  const words = action.words.map(key);
  if (new Set(words).size !== words.length) return { rejected: "Pick four different words." };
  const placed = new Set(player.found.flatMap((g) => state.puzzle.groups[g]!.words.map(key)));
  const left = new Set(state.order.map(key).filter((w) => !placed.has(w)));
  if (!words.every((w) => left.has(w))) return { rejected: "Pick words from the board." };
  const sorted = [...words].sort();
  if (player.tried.some((t) => t.join("|") === sorted.join("|"))) {
    return { rejected: "You've tried those four." };
  }

  const groups = state.puzzle.groups;
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
  return finishIfEveryoneDone({ ...state, players }, now);
}

// Views ------------------------------------------------------------------------------------

function timeOf(p: ConnectionsPlayer): number | null {
  return p.finishedAt === null ? null : p.finishedAt - p.startsAt;
}

/** Solved first, fastest first; then most groups found; then fewest mistakes. */
export function standingsOf(state: ConnectionsState): ConnectionsStanding[] {
  const rows = [...state.players].sort(
    (a, b) =>
      Number(a.left) - Number(b.left) ||
      Number(a.finishedAt === null) - Number(b.finishedAt === null) ||
      (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
      b.found.length - a.found.length ||
      a.tried.length - b.tried.length ||
      a.nickname.localeCompare(b.nickname),
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
  }));
}

const shown = (state: ConnectionsState, index: number): ConnectionsFoundGroup => ({
  ...state.puzzle.groups[index]!,
  colour: index,
});

function viewFor(state: ConnectionsState, playerId: string): ConnectionsView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const playing = player && !player.left ? player : null;
  const placed = new Set(
    (playing?.found ?? []).flatMap((g) => state.puzzle.groups[g]!.words.map(key)),
  );
  const over = !!playing && (done(playing) || state.finishedAt !== null);
  return {
    game: "connections",
    level: state.puzzle.level,
    words: playing ? state.order.filter((w) => !placed.has(key(w))) : null,
    found: (playing?.found ?? []).map((g) => shown(state, g)),
    mistakesLeft: CONNECTIONS_MAX_MISTAKES - (playing?.tried.length ?? 0),
    tried: playing?.tried ?? [],
    oneAway: playing?.oneAway ?? false,
    answer:
      over || state.finishedAt !== null ? state.puzzle.groups.map((_, i) => shown(state, i)) : null,
    startsAt: playing ? playing.startsAt : null,
    deadline: playing ? playing.startsAt + limitMs(state) : null,
    me: standings.find((s) => s.playerId === playerId) ?? null,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
  };
}

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

  contentNeeded: (settings) => ({ kind: "connections-puzzle", level: settings.level }),

  setup({ settings, players, content, seed, now }) {
    const puzzle = content[0]!;
    const order = shuffled(
      puzzle.groups.flatMap((g) => g.words),
      seededRng(seed),
    );
    const startsAt = now + CONNECTIONS_COUNTDOWN_MS;
    return {
      settings,
      puzzle,
      order,
      players: players.map((p) => newPlayer(p, startsAt)),
      finishedAt: null,
    };
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return { rejected: "The game is over." };
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return { rejected: "You're watching this game." };
    if (player.finishedAt !== null) return { rejected: "You've found them all." };
    if (player.outOf === "mistakes") return { rejected: "You're out of mistakes." };
    if (player.outOf === "time") return { rejected: "Your time is up." };
    return guess(state, player, action, now);
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
    // A late joiner gets the same puzzle, with their own countdown and clock.
    return {
      ...state,
      players: [...state.players, newPlayer(player, now + CONNECTIONS_COUNTDOWN_MS)],
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
      difficulty: state.puzzle.level,
      mode: "race",
      // Groups, so `correct` (groups found) reads as a share of them.
      rounds: groupCount(state),
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
