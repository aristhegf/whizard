import { z } from "zod";
import { seededRng, type Rng } from "../../random";
import type { QuizStanding } from "../quiz/quiz";
import { creditedElapsed } from "../quiz/scoring";
import type { ContentRequest, GameModule, GamePlayer, GameSummary, Rejection } from "../types";

// Word Rush and Spot It share these rules: everyone gets the same puzzles and starts together,
// then each player works through them on their own clock. A round ends when it's solved, given
// up, out of tries or out of time.

/** "Get ready" time before the first puzzle. */
export const ROUNDS_COUNTDOWN_MS = 3000;
/** The client moves on by itself after a short look at the result; this is the fallback. */
export const ROUNDS_AUTO_ADVANCE_MS = 6000;
/** Answers this early are accepted, to allow for small clock differences. */
const EARLY_TOLERANCE_MS = 1000;
/** Each wrong try takes this share of the round's points off a solve. */
export const WRONG_TRY_PENALTY = 0.1;
/** A solve is always worth at least this share, however slow or messy. */
export const SOLVE_FLOOR = 0.1;

export interface RoundsSettings {
  rounds: number;
  timeLimitSeconds: number;
}

export type RoundOutcome = "solved" | "missed" | "skipped" | "timeout";

export interface RoundResult {
  index: number;
  outcome: RoundOutcome;
  points: number;
  elapsedMs: number;
  /** Wrong tries. */
  misses: number;
}

interface RoundsPlayer<Guess> {
  id: string;
  nickname: string;
  left: boolean;
  score: number;
  solvedCount: number;
  totalTimeMs: number;
  results: RoundResult[];
  current: number;
  /** When the current puzzle appears. null while the player looks at the result. */
  startsAt: number | null;
  /** Wrong tries on the current puzzle. */
  tried: Guess[];
  advanceAt: number | null;
  finishedAt: number | null;
}

export interface RoundsState<Settings extends RoundsSettings, Puzzle, Guess> {
  game: string;
  settings: Settings;
  puzzles: Puzzle[];
  players: RoundsPlayer<Guess>[];
  finishedAt: number | null;
}

export type RoundsStage<PuzzleView, Guess, Reveal> =
  | {
      kind: "puzzle";
      index: number;
      puzzle: PuzzleView;
      /** Server time the puzzle appears. Before then, show a countdown. */
      startsAt: number;
      deadline: number;
      /** Wrong tries so far, oldest first. */
      tried: Guess[];
      triesLeft: number;
    }
  | ({ kind: "result"; isLast: boolean; reveal: Reveal } & RoundResult)
  | { kind: "done"; results: (RoundResult & { reveal: Reveal })[] }
  | { kind: "watching" };

export interface RoundsView<Game extends string, PuzzleView, Guess, Reveal> {
  game: Game;
  total: number;
  timeLimitMs: number;
  maxMisses: number;
  playerCount: number;
  stage: RoundsStage<PuzzleView, Guess, Reveal>;
  me: { score: number; solvedCount: number } | null;
  standings: QuizStanding[];
  final: boolean;
}

export interface RoundsRules<
  Settings extends RoundsSettings,
  Content,
  Puzzle,
  Guess,
  PuzzleView,
  Reveal,
> {
  id: string;
  name: string;
  maxPlayers: number;
  settingsSchema: z.ZodType<Settings>;
  defaultSettings: Settings;
  guessSchema: z.ZodType<Guess>;
  /** Wrong tries allowed before the round is lost. */
  maxMisses: number;
  contentNeeded(settings: Settings): ContentRequest | null;
  /** One puzzle per round, the same for everyone. */
  puzzles(settings: Settings, content: Content, rng: Rng): Puzzle[];
  points(puzzle: Puzzle): number;
  /** Puts a guess in a standard form, so the same guess twice is caught. */
  normalize?(guess: Guess): Guess;
  /** Whether the guess solves it, or why it doesn't count as a try at all. */
  check(puzzle: Puzzle, guess: Guess): boolean | Rejection;
  puzzleView(puzzle: Puzzle): PuzzleView;
  reveal(puzzle: Puzzle): Reveal;
  summary(settings: Settings): Pick<GameSummary, "category" | "difficulty" | "mode">;
}

export function roundsActionSchema<Guess>(guess: z.ZodType<Guess>) {
  return z.discriminatedUnion("type", [
    z.object({
      type: z.literal("guess"),
      index: z.number().int().min(0),
      guess,
      clientElapsedMs: z.number().min(0),
    }),
    z.object({ type: z.literal("skip"), index: z.number().int().min(0) }),
    z.object({ type: z.literal("next") }),
  ]);
}

export type RoundsAction<Guess> =
  | { type: "guess"; index: number; guess: Guess; clientElapsedMs: number }
  | { type: "skip"; index: number }
  | { type: "next" };

/** Points for a solve: half to all of the round's points by speed, less a tenth per wrong try. */
export function solvePoints(base: number, elapsedMs: number, limitMs: number, misses: number) {
  const speed = 1 - Math.min(Math.max(elapsedMs / limitMs, 0), 1);
  const points = base * (0.5 + 0.5 * speed - WRONG_TRY_PENALTY * misses);
  return Math.round(Math.max(points, base * SOLVE_FLOOR));
}

export function roundsGame<
  Game extends string,
  Settings extends RoundsSettings,
  Content,
  Puzzle,
  Guess,
  PuzzleView,
  Reveal,
>(
  rules: RoundsRules<Settings, Content, Puzzle, Guess, PuzzleView, Reveal> & { id: Game },
): GameModule<
  Settings,
  Content,
  RoundsState<Settings, Puzzle, Guess>,
  RoundsAction<Guess>,
  RoundsView<Game, PuzzleView, Guess, Reveal>
> {
  type State = RoundsState<Settings, Puzzle, Guess>;
  type Player = RoundsPlayer<Guess>;

  const limitMs = (state: State) => state.settings.timeLimitSeconds * 1000;
  const active = (state: State) => state.players.filter((p) => !p.left);

  const newPlayer = (player: GamePlayer, startsAt: number): Player => ({
    id: player.id,
    nickname: player.nickname,
    left: false,
    score: 0,
    solvedCount: 0,
    totalTimeMs: 0,
    results: [],
    current: 0,
    startsAt,
    tried: [],
    advanceAt: null,
    finishedAt: null,
  });

  const replace = (state: State, player: Player): State => ({
    ...state,
    players: state.players.map((p) => (p.id === player.id ? player : p)),
  });

  function close(player: Player, result: RoundResult, at: number): Player {
    return {
      ...player,
      results: [...player.results, result],
      score: player.score + result.points,
      solvedCount: player.solvedCount + (result.outcome === "solved" ? 1 : 0),
      totalTimeMs: player.totalTimeMs + result.elapsedMs,
      startsAt: null,
      tried: [],
      advanceAt: at + ROUNDS_AUTO_ADVANCE_MS,
    };
  }

  function advance(state: State, player: Player, at: number): Player {
    const next = player.current + 1;
    if (next >= state.puzzles.length) {
      return { ...player, advanceAt: null, finishedAt: at };
    }
    return { ...player, current: next, startsAt: at, advanceAt: null };
  }

  function finishIfEveryoneDone(state: State, now: number): State {
    if (state.finishedAt !== null) return state;
    const remaining = active(state);
    if (!remaining.every((p) => p.finishedAt !== null)) return state;
    const last = Math.max(...remaining.map((p) => p.finishedAt!));
    return { ...state, finishedAt: remaining.length > 0 ? last : now };
  }

  function tickPlayer(state: State, player: Player, now: number): Player {
    let p = player;
    for (;;) {
      if (p.left || p.finishedAt !== null) return p;
      if (p.startsAt !== null) {
        const deadline = p.startsAt + limitMs(state);
        if (now < deadline) return p;
        const result: RoundResult = {
          index: p.current,
          outcome: "timeout",
          points: 0,
          elapsedMs: limitMs(state),
          misses: p.tried.length,
        };
        p = close(p, result, deadline);
        continue;
      }
      if (p.advanceAt !== null && now >= p.advanceAt) {
        p = advance(state, p, p.advanceAt);
        continue;
      }
      return p;
    }
  }

  function standingsOf(state: State): QuizStanding[] {
    const rows = [...state.players].sort(
      (a, b) =>
        Number(a.left) - Number(b.left) ||
        b.score - a.score ||
        a.totalTimeMs - b.totalTimeMs ||
        a.nickname.localeCompare(b.nickname),
    );
    return rows.map((p, i) => ({
      playerId: p.id,
      nickname: p.nickname,
      rank: i + 1,
      score: p.score,
      finished: state.finishedAt !== null || p.finishedAt !== null,
      left: p.left,
    }));
  }

  function stageFor(
    state: State,
    player: Player | undefined,
  ): RoundsStage<PuzzleView, Guess, Reveal> {
    if (!player || player.left) {
      return state.finishedAt === null ? { kind: "watching" } : { kind: "done", results: [] };
    }
    if (player.finishedAt !== null || state.finishedAt !== null) {
      return {
        kind: "done",
        results: player.results.map((r) => ({
          ...r,
          reveal: rules.reveal(state.puzzles[r.index]!),
        })),
      };
    }
    const puzzle = state.puzzles[player.current]!;
    if (player.startsAt !== null) {
      return {
        kind: "puzzle",
        index: player.current,
        puzzle: rules.puzzleView(puzzle),
        startsAt: player.startsAt,
        deadline: player.startsAt + limitMs(state),
        tried: player.tried,
        triesLeft: rules.maxMisses - player.tried.length,
      };
    }
    return {
      kind: "result",
      isLast: player.current === state.puzzles.length - 1,
      reveal: rules.reveal(puzzle),
      ...player.results[player.results.length - 1]!,
    };
  }

  return {
    id: rules.id,
    name: rules.name,
    minPlayers: 1,
    maxPlayers: rules.maxPlayers,
    settingsSchema: rules.settingsSchema,
    defaultSettings: rules.defaultSettings,
    actionSchema: roundsActionSchema(rules.guessSchema) as unknown as z.ZodType<
      RoundsAction<Guess>
    >,
    contentNeeded: rules.contentNeeded,

    setup({ settings, players, content, seed, now }) {
      const puzzles = rules.puzzles(settings, content, seededRng(seed));
      const startsAt = now + ROUNDS_COUNTDOWN_MS;
      return {
        game: rules.id,
        settings,
        puzzles,
        players: players.map((p) => newPlayer(p, startsAt)),
        finishedAt: puzzles.length === 0 ? now : null,
      };
    },

    onAction(state, playerId, action, now) {
      if (state.finishedAt !== null) return { rejected: "The game is over." };
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.left) return { rejected: "You're watching this game." };
      if (player.finishedAt !== null) return { rejected: "You've finished." };

      if (action.type === "next") {
        if (player.advanceAt === null) return { rejected: "Finish this round first." };
        return finishIfEveryoneDone(replace(state, advance(state, player, now)), now);
      }
      if (player.startsAt === null || action.index !== player.current) {
        return { rejected: "That round has closed." };
      }
      if (now < player.startsAt - EARLY_TOLERANCE_MS) {
        return { rejected: "That round hasn't started." };
      }
      const serverMs = now - player.startsAt;
      if (action.type === "skip") {
        const elapsedMs = Math.min(Math.max(serverMs, 0), limitMs(state));
        const result: RoundResult = {
          index: player.current,
          outcome: "skipped",
          points: 0,
          elapsedMs,
          misses: player.tried.length,
        };
        return replace(state, close(player, result, now));
      }

      const puzzle = state.puzzles[player.current]!;
      const guess = rules.normalize ? rules.normalize(action.guess) : action.guess;
      if (player.tried.includes(guess)) return { rejected: "You've tried that." };
      const verdict = rules.check(puzzle, guess);
      if (typeof verdict !== "boolean") return verdict;
      const elapsedMs = creditedElapsed(action.clientElapsedMs, serverMs, limitMs(state));
      if (verdict) {
        const result: RoundResult = {
          index: player.current,
          outcome: "solved",
          points: solvePoints(rules.points(puzzle), elapsedMs, limitMs(state), player.tried.length),
          elapsedMs,
          misses: player.tried.length,
        };
        return replace(state, close(player, result, now));
      }
      const tried = [...player.tried, guess];
      if (tried.length < rules.maxMisses) return replace(state, { ...player, tried });
      const result: RoundResult = {
        index: player.current,
        outcome: "missed",
        points: 0,
        elapsedMs,
        misses: tried.length,
      };
      return replace(state, close(player, result, now));
    },

    onPlayerJoined(state, player, now) {
      if (state.finishedAt !== null || state.players.some((p) => p.id === player.id)) return state;
      // A late joiner starts from round one with their own countdown, like everyone did.
      return {
        ...state,
        players: [...state.players, newPlayer(player, now + ROUNDS_COUNTDOWN_MS)],
      };
    },

    onPlayerLeft(state, playerId, now) {
      const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
      return finishIfEveryoneDone({ ...state, players }, now);
    },

    tick(state, now) {
      if (state.finishedAt !== null) return state;
      const players = state.players.map((p) => tickPlayer(state, p, now));
      return finishIfEveryoneDone({ ...state, players }, now);
    },

    nextWakeAt(state) {
      if (state.finishedAt !== null) return null;
      const times = active(state).flatMap((p) =>
        p.finishedAt !== null
          ? []
          : p.startsAt !== null
            ? [p.startsAt + limitMs(state)]
            : p.advanceAt !== null
              ? [p.advanceAt]
              : [],
      );
      return times.length > 0 ? Math.min(...times) : null;
    },

    isFinished: (state) => state.finishedAt !== null,

    summarize(state) {
      const stayed = standingsOf(state).filter((s) => !s.left);
      return {
        ...rules.summary(state.settings),
        rounds: state.puzzles.length,
        players: stayed.map((s, i) => ({
          playerId: s.playerId,
          placing: i + 1,
          score: s.score,
          correct: state.players.find((p) => p.id === s.playerId)?.solvedCount ?? null,
        })),
      };
    },

    viewFor(state, playerId) {
      const player = state.players.find((p) => p.id === playerId);
      return {
        game: rules.id,
        total: state.puzzles.length,
        timeLimitMs: limitMs(state),
        maxMisses: rules.maxMisses,
        playerCount: state.players.length,
        stage: stageFor(state, player),
        me: player ? { score: player.score, solvedCount: player.solvedCount } : null,
        standings: standingsOf(state),
        final: state.finishedAt !== null,
      };
    },
  };
}
