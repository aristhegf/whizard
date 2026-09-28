import { z } from "zod";
import { seededRng } from "../../random";
import { knockoutLevelPlan } from "../knockout/knockout";
import { levelPlan } from "../levels";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  EARLY_TOLERANCE_MS,
  itemResults,
  prepare,
  type AnswerRecord,
  type PreparedQuestion,
  type QuizReviewItem,
} from "./common";

import {
  answerElimination,
  ELIMINATION_MIN_PLAYERS,
  joinElimination,
  leaveElimination,
  nextWakeElimination,
  setupElimination,
  summarizeElimination,
  tickElimination,
  viewElimination,
  type EliminationState,
  type EliminationView,
} from "./elimination";

export type { QuizReviewItem } from "./common";
import { BASE_POINTS, creditedElapsed, pointsFor } from "./scoring";
import {
  DEFAULT_QUIZ_SETTINGS,
  quizSettingsSchema,
  type QuizQuestion,
  type QuizSettings,
} from "./settings";

/** "Get ready" time before the first question, the same moment for everyone. */
export const COUNTDOWN_MS = 3000;
/**
 * After answering, the client decides how long to show the result before asking for the next
 * question. This is only the fallback for a player who has stopped responding.
 */
export const AUTO_ADVANCE_MS = 8000;
/**
 * Classic has no clock, but a question still closes after this long so a player who walks away
 * can't hold up everyone's final results.
 */
export const CLASSIC_IDLE_LIMIT_MS = 5 * 60_000;

export const quizActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("answer"),
    index: z.number().int().min(0),
    choice: z.number().int().min(0),
    clientElapsedMs: z.number().min(0),
  }),
  z.object({ type: z.literal("next") }),
]);

export type QuizAction = z.infer<typeof quizActionSchema>;

/** Everyone starts together, then each player moves through the questions on their own clock. */
interface QuizPlayer {
  id: string;
  nickname: string;
  left: boolean;
  score: number;
  correctCount: number;
  totalTimeMs: number;
  answers: AnswerRecord[];
  current: number;
  /** When the current question appears. null while the player is looking at the result. */
  startsAt: number | null;
  advanceAt: number | null;
  finishedAt: number | null;
}

export interface QuizState {
  settings: QuizSettings;
  questions: PreparedQuestion[];
  players: QuizPlayer[];
  finishedAt: number | null;
}

/** Leaderboard row. Deliberately only points: what others got right or wrong stays private. */
export interface QuizStanding {
  playerId: string;
  nickname: string;
  rank: number;
  score: number;
  /** Total answer time, once the game is over (for the share picture's speed champion). */
  timeMs: number | null;
  finished: boolean;
  left: boolean;
}

export type QuizStage =
  | {
      kind: "question";
      index: number;
      prompt: string;
      choices: string[];
      /** Server time the question appears. Before then, show a countdown. */
      startsAt: number;
      deadline: number;
    }
  | ({ kind: "answer"; isLast: boolean } & QuizReviewItem)
  | { kind: "done"; review: QuizReviewItem[] }
  | { kind: "watching" };

export interface QuizView {
  game: "quiz";
  /** Speed shows a countdown on every question; Classic has no clock. */
  timed: boolean;
  total: number;
  timeLimitMs: number;
  playerCount: number;
  stage: QuizStage;
  me: { score: number; correctCount: number } | null;
  /** Everyone's points so far. Phones leave this out while you play; bigger screens show it. */
  standings: QuizStanding[];
  final: boolean;
}

const timed = (state: QuizState) => state.settings.variant === "speed";
const limitMs = (state: QuizState) =>
  timed(state) ? state.settings.timeLimitSeconds * 1000 : CLASSIC_IDLE_LIMIT_MS;
const active = (state: QuizState) => state.players.filter((p) => !p.left);
const answerFor = (player: QuizPlayer, index: number) =>
  player.answers.find((a) => a.index === index);

function newPlayer(player: GamePlayer, startsAt: number): QuizPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    left: false,
    score: 0,
    correctCount: 0,
    totalTimeMs: 0,
    answers: [],
    current: 0,
    startsAt,
    advanceAt: null,
    finishedAt: null,
  };
}

function withAnswer(player: QuizPlayer, answer: AnswerRecord): QuizPlayer {
  return {
    ...player,
    answers: [...player.answers, answer],
    score: player.score + answer.points,
    correctCount: player.correctCount + (answer.correct ? 1 : 0),
    totalTimeMs: player.totalTimeMs + answer.elapsedMs,
  };
}

function replacePlayer(state: QuizState, player: QuizPlayer): QuizState {
  return { ...state, players: state.players.map((p) => (p.id === player.id ? player : p)) };
}

function advance(state: QuizState, player: QuizPlayer, at: number): QuizPlayer {
  const next = player.current + 1;
  if (next >= state.questions.length) {
    return { ...player, startsAt: null, advanceAt: null, finishedAt: at };
  }
  return { ...player, current: next, startsAt: at, advanceAt: null };
}

function finishIfEveryoneDone(state: QuizState, now: number): QuizState {
  if (state.finishedAt !== null) return state;
  const remaining = active(state);
  if (!remaining.every((p) => p.finishedAt !== null)) return state;
  const last = Math.max(...remaining.map((p) => p.finishedAt!));
  return { ...state, finishedAt: remaining.length > 0 ? last : now };
}

function tickPlayer(state: QuizState, player: QuizPlayer, now: number): QuizPlayer {
  let p = player;
  for (;;) {
    if (p.left || p.finishedAt !== null) return p;
    if (p.startsAt !== null) {
      const deadline = p.startsAt + limitMs(state);
      if (now < deadline) return p;
      const timedOut = {
        index: p.current,
        choice: null,
        correct: false,
        points: 0,
        elapsedMs: limitMs(state),
      };
      p = { ...withAnswer(p, timedOut), startsAt: null, advanceAt: deadline + AUTO_ADVANCE_MS };
      continue;
    }
    if (p.advanceAt !== null && now >= p.advanceAt) {
      p = advance(state, p, p.advanceAt);
      continue;
    }
    return p;
  }
}

function answer(
  state: QuizState,
  player: QuizPlayer,
  action: Extract<QuizAction, { type: "answer" }>,
  now: number,
): QuizState | Rejection {
  if (player.startsAt === null || action.index !== player.current) {
    return { rejected: "That question has closed." };
  }
  if (now < player.startsAt - EARLY_TOLERANCE_MS) {
    return { rejected: "That question hasn't started." };
  }
  const question = state.questions[player.current]!;
  const elapsedMs = creditedElapsed(action.clientElapsedMs, now - player.startsAt, limitMs(state));
  const correct = action.choice === question.correctChoice;
  const record = {
    index: player.current,
    choice: action.choice,
    correct,
    elapsedMs,
    // Speed rewards fast answers; Classic only counts being right.
    points: timed(state)
      ? pointsFor(correct, elapsedMs, limitMs(state), question.level)
      : correct
        ? BASE_POINTS[question.level]
        : 0,
  };
  const updated = {
    ...withAnswer(player, record),
    startsAt: null,
    advanceAt: now + AUTO_ADVANCE_MS,
  };
  return replacePlayer(state, updated);
}

// Views ------------------------------------------------------------------------------------

export function standingsOf(state: QuizState): QuizStanding[] {
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
    timeMs: state.finishedAt !== null ? p.totalTimeMs : null,
    finished: state.finishedAt !== null || p.finishedAt !== null,
    left: p.left,
  }));
}

function reviewItem(state: QuizState, player: QuizPlayer, index: number): QuizReviewItem {
  const question = state.questions[index]!;
  const record = answerFor(player, index);
  return {
    index,
    questionId: question.id,
    prompt: question.prompt,
    choices: question.choices,
    myChoice: record?.choice ?? null,
    correctChoice: question.correctChoice,
    correct: record?.correct ?? false,
    points: record?.points ?? 0,
    explanation: question.explanation,
    reference: question.reference,
  };
}

function stageFor(state: QuizState, player: QuizPlayer | undefined): QuizStage {
  if (!player || player.left) {
    return state.finishedAt === null ? { kind: "watching" } : { kind: "done", review: [] };
  }
  if (player.finishedAt !== null || state.finishedAt !== null) {
    return { kind: "done", review: player.answers.map((a) => reviewItem(state, player, a.index)) };
  }
  if (player.startsAt !== null) {
    const question = state.questions[player.current]!;
    return {
      kind: "question",
      index: player.current,
      prompt: question.prompt,
      choices: question.choices,
      startsAt: player.startsAt,
      deadline: player.startsAt + limitMs(state),
    };
  }
  return {
    kind: "answer",
    isLast: player.current === state.questions.length - 1,
    ...reviewItem(state, player, player.current),
  };
}

function viewFor(state: QuizState, playerId: string): QuizView {
  const player = state.players.find((p) => p.id === playerId);
  const stage = stageFor(state, player);
  return {
    game: "quiz",
    timed: timed(state),
    total: state.questions.length,
    timeLimitMs: limitMs(state),
    playerCount: state.players.length,
    stage,
    me: player ? { score: player.score, correctCount: player.correctCount } : null,
    standings: standingsOf(state),
    final: state.finishedAt !== null,
  };
}

// Module -----------------------------------------------------------------------------------

/** Classic and Speed share one set of rules; Elimination has its own. */
export type AnyQuizState = QuizState | EliminationState;
export type AnyQuizView = QuizView | EliminationView;

const isElimination = (state: AnyQuizState): state is EliminationState =>
  (state as EliminationState).mode === "elimination";

export const quizGame: GameModule<
  QuizSettings,
  QuizQuestion[],
  AnyQuizState,
  QuizAction,
  AnyQuizView
> = {
  id: "quiz",
  name: "Quiz",
  minPlayers: 1,
  maxPlayers: 20,
  settingsSchema: quizSettingsSchema,
  defaultSettings: DEFAULT_QUIZ_SETTINGS,
  actionSchema: quizActionSchema,

  playersNeeded: (settings) =>
    settings.variant === "elimination"
      ? {
          min: ELIMINATION_MIN_PLAYERS,
          message: `Elimination needs at least ${ELIMINATION_MIN_PLAYERS} players.`,
        }
      : null,

  contentNeeded: (settings, players) => ({
    kind: "quiz-questions",
    category: settings.category,
    // Elimination keeps a few back for sudden death.
    levels:
      settings.variant === "elimination"
        ? knockoutLevelPlan(settings.difficulty, players, settings.count)
        : levelPlan(settings.difficulty, settings.count),
  }),

  setup({ settings, players, content, seed, now }) {
    if (settings.variant === "elimination") {
      return setupElimination({ settings, players, content, seed, now });
    }
    const rng = seededRng(seed);
    const questions = content.map((q) => prepare(q, rng, settings.difficulty));
    const startsAt = now + COUNTDOWN_MS;
    return {
      settings,
      questions,
      players: players.map((p: GamePlayer) => newPlayer(p, startsAt)),
      finishedAt: questions.length === 0 ? now : null,
    };
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return { rejected: "The game is over." };
    if (isElimination(state)) {
      if (action.type === "next") return { rejected: "Everyone moves on together." };
      return answerElimination(state, playerId, action, now);
    }
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return { rejected: "You're watching this game." };
    if (player.finishedAt !== null) return { rejected: "You've finished." };

    if (action.type === "next") {
      if (player.advanceAt === null) return { rejected: "Answer the question first." };
      return finishIfEveryoneDone(replacePlayer(state, advance(state, player, now)), now);
    }
    const question = state.questions[action.index];
    if (!question || action.choice >= question.choices.length) {
      return { rejected: "That isn't one of the choices." };
    }
    return answer(state, player, action, now);
  },

  onPlayerJoined(state, player, now) {
    // Someone joining an Elimination game watches it.
    if (isElimination(state)) return joinElimination(state, player);
    if (state.finishedAt !== null || state.players.some((p) => p.id === player.id)) return state;
    // A late joiner starts from question one with their own countdown, like everyone did.
    return { ...state, players: [...state.players, newPlayer(player, now + COUNTDOWN_MS)] };
  },

  onPlayerLeft(state, playerId, now) {
    if (isElimination(state)) return leaveElimination(state, playerId, now);
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    return finishIfEveryoneDone({ ...state, players }, now);
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    if (isElimination(state)) return tickElimination(state, now);
    const players = state.players.map((p) => tickPlayer(state, p, now));
    return finishIfEveryoneDone({ ...state, players }, now);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    if (isElimination(state)) return nextWakeElimination(state);
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
    if (isElimination(state)) return summarizeElimination(state);
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: state.settings.category,
      difficulty: state.settings.difficulty,
      mode: state.settings.variant,
      rounds: state.questions.length,
      players: stayed.map((s, i) => ({
        playerId: s.playerId,
        placing: i + 1,
        score: s.score,
        correct: state.players.find((p) => p.id === s.playerId)?.correctCount ?? null,
      })),
      // Everyone's answers count here, including players who left before the end.
      items: itemResults(state.questions, state.players),
    };
  },

  viewFor: (state, playerId) =>
    isElimination(state) ? viewElimination(state, playerId) : viewFor(state, playerId),
};
