import { z } from "zod";
import { seededRng, shuffled, type Rng } from "../../random";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  DEFAULT_JIGSAW_SETTINGS,
  jigsawSettingsSchema,
  type JigsawPicture,
  type JigsawSettings,
} from "./settings";

/** "Get ready" before the pieces can move, the same moment for everyone. */
export const JIGSAW_COUNTDOWN_MS = 3000;
/** A puzzle closes after this long, so a player who walks away can't hold up the results. */
export const JIGSAW_TIME_LIMIT_MS = 10 * 60_000;
/** Moves this early are accepted, to allow for small clock differences. */
const EARLY_TOLERANCE_MS = 1000;
/** Points per piece in its place, for match history. */
export const POINTS_PER_PIECE = 100;

export const jigsawActionSchema = z.object({
  type: z.literal("swap"),
  /** Two spots on the board, numbered left to right, top to bottom. */
  a: z.number().int().min(0),
  b: z.number().int().min(0),
});

export type JigsawAction = z.infer<typeof jigsawActionSchema>;

/** What a game draws: the picture, with an ID for the room's history. */
export interface JigsawContent {
  id: string;
  picture: JigsawPicture;
}

interface JigsawPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** `board[spot]` is the piece in that spot. Piece `n` belongs in spot `n`. */
  board: number[];
  moves: number;
  /** When this player's pieces can move. */
  startsAt: number;
  finishedAt: number | null;
  /** Their time ran out before they finished. */
  outOfTime: boolean;
}

export interface JigsawState {
  settings: JigsawSettings;
  picture: JigsawPicture;
  side: number;
  /** The shuffle everyone starts from, so the race is fair. Late joiners get it too. */
  start: number[];
  players: JigsawPlayer[];
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
}

export interface JigsawView {
  game: "jigsaw";
  picture: JigsawPicture;
  side: number;
  /** Null while watching a game you joined too late for. */
  board: number[] | null;
  /** Server time your pieces can move. Before then, show a countdown. */
  startsAt: number | null;
  deadline: number | null;
  moves: number;
  me: JigsawStanding | null;
  /** Everyone's progress: pieces placed, never their boards. */
  standings: JigsawStanding[];
  playerCount: number;
  final: boolean;
}

/** A shuffled board with no piece already in its place. */
export function scrambled(side: number, rng: Rng): number[] {
  const count = side * side;
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

const active = (state: JigsawState) => state.players.filter((p) => !p.left);
const done = (p: JigsawPlayer) => p.finishedAt !== null || p.outOfTime;

function newPlayer(state: Pick<JigsawState, "start">, player: GamePlayer, startsAt: number) {
  return {
    id: player.id,
    nickname: player.nickname,
    left: false,
    board: [...state.start],
    moves: 0,
    startsAt,
    finishedAt: null,
    outOfTime: false,
  } satisfies JigsawPlayer;
}

function finishIfEveryoneDone(state: JigsawState, now: number): JigsawState {
  if (state.finishedAt !== null) return state;
  const remaining = active(state);
  if (!remaining.every(done)) return state;
  return { ...state, finishedAt: now };
}

function swap(
  state: JigsawState,
  player: JigsawPlayer,
  action: JigsawAction,
  now: number,
): JigsawState | Rejection {
  const count = state.side * state.side;
  const { a, b } = action;
  if (a >= count || b >= count || a === b) return { rejected: "Those pieces can’t swap." };
  if (now < player.startsAt - EARLY_TOLERANCE_MS) return { rejected: "The puzzle hasn't started." };
  // Pieces in their place are locked.
  if (player.board[a] === a || player.board[b] === b) {
    return { rejected: "That piece is already in its place." };
  }
  const board = [...player.board];
  [board[a], board[b]] = [board[b]!, board[a]!];
  const solved = placedCount(board) === count;
  const updated: JigsawPlayer = {
    ...player,
    board,
    moves: player.moves + 1,
    finishedAt: solved ? now : null,
  };
  const players = state.players.map((p) => (p.id === player.id ? updated : p));
  return finishIfEveryoneDone({ ...state, players }, now);
}

// Views ------------------------------------------------------------------------------------

function timeOf(p: JigsawPlayer): number | null {
  return p.finishedAt === null ? null : p.finishedAt - p.startsAt;
}

/** Finished first, fastest first; then most pieces placed; then fewest moves. */
export function standingsOf(state: JigsawState): JigsawStanding[] {
  const total = state.side * state.side;
  const rows = [...state.players].sort(
    (a, b) =>
      Number(a.left) - Number(b.left) ||
      Number(a.finishedAt === null) - Number(b.finishedAt === null) ||
      (timeOf(a) ?? 0) - (timeOf(b) ?? 0) ||
      placedCount(b.board) - placedCount(a.board) ||
      a.moves - b.moves ||
      a.nickname.localeCompare(b.nickname),
  );
  return rows.map((p, i) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    placed: placedCount(p.board),
    total,
    timeMs: timeOf(p),
    moves: p.moves,
    finished: p.finishedAt !== null,
    outOfTime: p.outOfTime,
    left: p.left,
  }));
}

function viewFor(state: JigsawState, playerId: string): JigsawView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const playing = player && !player.left ? player : null;
  return {
    game: "jigsaw",
    picture: state.picture,
    side: state.side,
    board: playing ? playing.board : null,
    startsAt: playing ? playing.startsAt : null,
    deadline: playing ? playing.startsAt + JIGSAW_TIME_LIMIT_MS : null,
    moves: playing?.moves ?? 0,
    me: standings.find((s) => s.playerId === playerId) ?? null,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
  };
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

  contentNeeded: (settings) => ({ kind: "jigsaw-picture", picture: settings.picture }),

  setup({ settings, players, content, seed, now }) {
    const picture = content[0]!.picture;
    const start = scrambled(settings.side, seededRng(seed));
    const startsAt = now + JIGSAW_COUNTDOWN_MS;
    return {
      settings,
      picture,
      side: settings.side,
      start,
      players: players.map((p) => newPlayer({ start }, p, startsAt)),
      finishedAt: null,
    };
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return { rejected: "The game is over." };
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return { rejected: "You're watching this game." };
    if (player.finishedAt !== null) return { rejected: "You've finished." };
    if (player.outOfTime) return { rejected: "Your time is up." };
    return swap(state, player, action, now);
  },

  onPlayerJoined(state, player, now) {
    if (state.finishedAt !== null || state.players.some((p) => p.id === player.id)) return state;
    // A late joiner gets the same puzzle, with their own countdown and clock.
    return {
      ...state,
      players: [...state.players, newPlayer(state, player, now + JIGSAW_COUNTDOWN_MS)],
    };
  },

  onPlayerLeft(state, playerId, now) {
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    return finishIfEveryoneDone({ ...state, players }, now);
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    const players = state.players.map((p) =>
      !p.left && !done(p) && now >= p.startsAt + JIGSAW_TIME_LIMIT_MS
        ? { ...p, outOfTime: true }
        : p,
    );
    return finishIfEveryoneDone({ ...state, players }, now);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    const times = active(state)
      .filter((p) => !done(p))
      .map((p) => p.startsAt + JIGSAW_TIME_LIMIT_MS);
    return times.length > 0 ? Math.min(...times) : null;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: state.picture.id,
      difficulty: `${state.side}x${state.side}`,
      mode: "race",
      // Pieces, so `correct` (pieces placed) reads as a share of them.
      rounds: state.side * state.side,
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
