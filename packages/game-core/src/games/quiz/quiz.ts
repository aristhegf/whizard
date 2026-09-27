import { z } from "zod";
import { seededRng, shuffled } from "../../random";
import type { GameModule, GamePlayer, Rejection } from "../types";
import { creditedElapsed, pointsFor } from "./scoring";
import {
  DEFAULT_QUIZ_SETTINGS,
  quizSettingsSchema,
  type QuizQuestion,
  type QuizSettings,
  type QuizVariant,
} from "./settings";

/** "Get ready" time before the first question. */
export const COUNTDOWN_MS = 3000;
/** How long Classic shows the answer and standings between questions. */
export const REVEAL_MS = 4000;
/** Gap between a Classic reveal ending and the next question appearing, so it arrives in time. */
export const ROUND_LEAD_MS = 600;
/** Speed Quiz moves on by itself if a player doesn't tap "Next" in time. */
export const AUTO_ADVANCE_MS = 8000;
/** Answers this early are accepted, to allow for small clock differences. */
const EARLY_TOLERANCE_MS = 1000;

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

interface PreparedQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctChoice: number;
  explanation: string | null;
  reference: string | null;
}

interface AnswerRecord {
  index: number;
  /** null when time ran out. */
  choice: number | null;
  correct: boolean;
  points: number;
  elapsedMs: number;
}

interface QuizPlayer {
  id: string;
  nickname: string;
  left: boolean;
  score: number;
  correctCount: number;
  totalTimeMs: number;
  answers: AnswerRecord[];
  // Speed Quiz: each player moves through the questions on their own clock.
  current: number;
  /** When the current question appears. null while the player is looking at feedback. */
  startsAt: number | null;
  advanceAt: number | null;
  finishedAt: number | null;
}

interface ClassicRound {
  index: number;
  startsAt: number;
  endsAt: number;
  /** Set once the round closes: the answer is shown until then. */
  revealUntil: number | null;
}

export interface QuizState {
  settings: QuizSettings;
  questions: PreparedQuestion[];
  players: QuizPlayer[];
  round: ClassicRound | null;
  finishedAt: number | null;
}

export interface QuizStanding {
  playerId: string;
  nickname: string;
  rank: number;
  score: number;
  correctCount: number;
  answeredCount: number;
  totalTimeMs: number;
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
      /** Classic only: your answer while waiting for the others. */
      myChoice: number | null;
      answeredCount: number;
      activeCount: number;
    }
  | {
      kind: "answer";
      index: number;
      prompt: string;
      choices: string[];
      myChoice: number | null;
      correctChoice: number;
      correct: boolean;
      points: number;
      explanation: string | null;
      reference: string | null;
      /** When the game moves on by itself. */
      nextAt: number | null;
      isLast: boolean;
    }
  | { kind: "done" }
  | { kind: "watching" };

export interface QuizView {
  game: "quiz";
  variant: QuizVariant;
  total: number;
  timeLimitMs: number;
  stage: QuizStage;
  me: { score: number; correctCount: number } | null;
  /** Hidden (empty) while it would give answers away, e.g. during a Speed Quiz. */
  standings: QuizStanding[];
  final: boolean;
}

const limitMs = (state: QuizState) => state.settings.timeLimitSeconds * 1000;
const active = (state: QuizState) => state.players.filter((p) => !p.left);
const answerFor = (player: QuizPlayer, index: number) =>
  player.answers.find((a) => a.index === index);

function prepare(question: QuizQuestion, rng: () => number): PreparedQuestion {
  const order = shuffled(
    question.choices.map((_, i) => i),
    rng,
  );
  return {
    id: question.id,
    prompt: question.prompt,
    choices: order.map((i) => question.choices[i]!),
    correctChoice: order.indexOf(0),
    explanation: question.explanation ?? null,
    reference: question.reference ?? null,
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

function grade(
  state: QuizState,
  index: number,
  choice: number,
  clientMs: number,
  serverMs: number,
): AnswerRecord {
  const question = state.questions[index]!;
  const elapsedMs = creditedElapsed(clientMs, serverMs, limitMs(state));
  const correct = choice === question.correctChoice;
  return {
    index,
    choice,
    correct,
    elapsedMs,
    points: pointsFor(correct, elapsedMs, limitMs(state), state.settings.difficulty),
  };
}

const timedOut = (state: QuizState, index: number): AnswerRecord => ({
  index,
  choice: null,
  correct: false,
  points: 0,
  elapsedMs: limitMs(state),
});

// Classic ----------------------------------------------------------------------------------

function closeRound(state: QuizState, at: number): QuizState {
  const round = state.round!;
  const players = state.players.map((p) =>
    p.left || answerFor(p, round.index) ? p : withAnswer(p, timedOut(state, round.index)),
  );
  return { ...state, players, round: { ...round, revealUntil: at + REVEAL_MS } };
}

function closeRoundIfEveryoneAnswered(state: QuizState, now: number): QuizState {
  const round = state.round;
  if (!round || round.revealUntil !== null) return state;
  const remaining = active(state);
  if (remaining.length === 0) return { ...state, finishedAt: now };
  return remaining.every((p) => answerFor(p, round.index)) ? closeRound(state, now) : state;
}

function tickClassic(state: QuizState, now: number): QuizState {
  let s = state;
  for (;;) {
    const round = s.round;
    if (!round || s.finishedAt !== null) return s;
    if (round.revealUntil === null) {
      if (now < round.endsAt) return s;
      s = closeRound(s, round.endsAt);
      continue;
    }
    if (now < round.revealUntil) return s;
    const index = round.index + 1;
    if (index >= s.questions.length) return { ...s, finishedAt: round.revealUntil };
    const startsAt = Math.max(now, round.revealUntil) + ROUND_LEAD_MS;
    s = { ...s, round: { index, startsAt, endsAt: startsAt + limitMs(s), revealUntil: null } };
  }
}

function answerClassic(
  state: QuizState,
  player: QuizPlayer,
  action: Extract<QuizAction, { type: "answer" }>,
  now: number,
): QuizState | Rejection {
  const round = state.round;
  if (!round || round.revealUntil !== null || action.index !== round.index) {
    return { rejected: "That question has closed." };
  }
  if (now < round.startsAt - EARLY_TOLERANCE_MS)
    return { rejected: "That question hasn't started." };
  if (answerFor(player, round.index)) return { rejected: "You've already answered." };
  const answer = grade(
    state,
    round.index,
    action.choice,
    action.clientElapsedMs,
    now - round.startsAt,
  );
  return closeRoundIfEveryoneAnswered(replacePlayer(state, withAnswer(player, answer)), now);
}

// Speed ------------------------------------------------------------------------------------

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

function tickSpeedPlayer(state: QuizState, player: QuizPlayer, now: number): QuizPlayer {
  let p = player;
  for (;;) {
    if (p.left || p.finishedAt !== null) return p;
    if (p.startsAt !== null) {
      const deadline = p.startsAt + limitMs(state);
      if (now < deadline) return p;
      p = { ...withAnswer(p, timedOut(state, p.current)), startsAt: null };
      p = { ...p, advanceAt: deadline + AUTO_ADVANCE_MS };
      continue;
    }
    if (p.advanceAt !== null && now >= p.advanceAt) {
      p = advance(state, p, p.advanceAt);
      continue;
    }
    return p;
  }
}

function tickSpeed(state: QuizState, now: number): QuizState {
  if (state.finishedAt !== null) return state;
  const players = state.players.map((p) => tickSpeedPlayer(state, p, now));
  return finishIfEveryoneDone({ ...state, players }, now);
}

function actSpeed(
  state: QuizState,
  player: QuizPlayer,
  action: QuizAction,
  now: number,
): QuizState | Rejection {
  if (action.type === "next") {
    if (player.advanceAt === null) return { rejected: "Answer the question first." };
    return finishIfEveryoneDone(replacePlayer(state, advance(state, player, now)), now);
  }
  if (player.startsAt === null || action.index !== player.current) {
    return { rejected: "That question has closed." };
  }
  if (now < player.startsAt - EARLY_TOLERANCE_MS) {
    return { rejected: "That question hasn't started." };
  }
  const answer = grade(
    state,
    player.current,
    action.choice,
    action.clientElapsedMs,
    now - player.startsAt,
  );
  const updated = {
    ...withAnswer(player, answer),
    startsAt: null,
    advanceAt: now + AUTO_ADVANCE_MS,
  };
  return replacePlayer(state, updated);
}

// Views ------------------------------------------------------------------------------------

export function standingsOf(state: QuizState, hideRound: number | null = null): QuizStanding[] {
  const rows = state.players.map((p) => {
    const counted = p.answers.filter((a) => a.index !== hideRound);
    return {
      playerId: p.id,
      nickname: p.nickname,
      score: counted.reduce((sum, a) => sum + a.points, 0),
      correctCount: counted.filter((a) => a.correct).length,
      answeredCount: counted.length,
      totalTimeMs: counted.reduce((sum, a) => sum + a.elapsedMs, 0),
      finished: state.finishedAt !== null || p.finishedAt !== null,
      left: p.left,
    };
  });
  rows.sort(
    (a, b) =>
      Number(a.left) - Number(b.left) ||
      b.score - a.score ||
      a.totalTimeMs - b.totalTimeMs ||
      a.nickname.localeCompare(b.nickname),
  );
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

function answerStage(
  state: QuizState,
  player: QuizPlayer,
  index: number,
  nextAt: number | null,
): QuizStage {
  const question = state.questions[index]!;
  const answer = answerFor(player, index);
  return {
    kind: "answer",
    index,
    prompt: question.prompt,
    choices: question.choices,
    myChoice: answer?.choice ?? null,
    correctChoice: question.correctChoice,
    correct: answer?.correct ?? false,
    points: answer?.points ?? 0,
    explanation: question.explanation,
    reference: question.reference,
    nextAt,
    isLast: index === state.questions.length - 1,
  };
}

function questionStage(
  state: QuizState,
  index: number,
  startsAt: number,
  myChoice: number | null,
  answeredCount: number,
): QuizStage {
  const question = state.questions[index]!;
  return {
    kind: "question",
    index,
    prompt: question.prompt,
    choices: question.choices,
    startsAt,
    deadline: startsAt + limitMs(state),
    myChoice,
    answeredCount,
    activeCount: active(state).length,
  };
}

function stageFor(state: QuizState, player: QuizPlayer | undefined): QuizStage {
  if (state.finishedAt !== null) return { kind: "done" };
  if (!player || player.left) return { kind: "watching" };

  if (state.settings.variant === "classic") {
    const round = state.round!;
    if (round.revealUntil !== null) {
      const isLast = round.index === state.questions.length - 1;
      return answerStage(state, player, round.index, isLast ? null : round.revealUntil);
    }
    const answered = active(state).filter((p) => answerFor(p, round.index)).length;
    return questionStage(
      state,
      round.index,
      round.startsAt,
      answerFor(player, round.index)?.choice ?? null,
      answered,
    );
  }

  if (player.finishedAt !== null) return { kind: "done" };
  if (player.startsAt !== null)
    return questionStage(state, player.current, player.startsAt, null, 0);
  return answerStage(state, player, player.current, player.advanceAt);
}

function viewFor(state: QuizState, playerId: string): QuizView {
  const player = state.players.find((p) => p.id === playerId);
  const stage = stageFor(state, player);
  const classicRoundOpen =
    state.settings.variant === "classic" && state.round?.revealUntil === null;

  // Speed Quiz hides others' scores until you've finished, so they don't hint at answers.
  const showStandings =
    state.settings.variant === "classic" || stage.kind === "done" || stage.kind === "watching";

  return {
    game: "quiz",
    variant: state.settings.variant,
    total: state.questions.length,
    timeLimitMs: limitMs(state),
    stage,
    me: player ? { score: player.score, correctCount: player.correctCount } : null,
    standings: showStandings
      ? standingsOf(
          state,
          classicRoundOpen && state.finishedAt === null ? state.round!.index : null,
        )
      : [],
    final: state.finishedAt !== null,
  };
}

// Module -----------------------------------------------------------------------------------

export const quizGame: GameModule<QuizSettings, QuizQuestion[], QuizState, QuizAction, QuizView> = {
  id: "quiz",
  name: "Quiz",
  minPlayers: 1,
  maxPlayers: 16,
  settingsSchema: quizSettingsSchema,
  defaultSettings: DEFAULT_QUIZ_SETTINGS,
  actionSchema: quizActionSchema,

  contentNeeded: (settings) => ({
    kind: "quiz-questions",
    category: settings.category,
    difficulty: settings.difficulty,
    count: settings.count,
  }),

  setup({ settings, players, content, seed, now }) {
    const rng = seededRng(seed);
    const questions = content.map((q) => prepare(q, rng));
    const firstAt = now + COUNTDOWN_MS;
    const speed = settings.variant === "speed";
    return {
      settings,
      questions,
      players: players.map((p: GamePlayer) => ({
        id: p.id,
        nickname: p.nickname,
        left: false,
        score: 0,
        correctCount: 0,
        totalTimeMs: 0,
        answers: [],
        current: 0,
        startsAt: speed ? firstAt : null,
        advanceAt: null,
        finishedAt: null,
      })),
      round: speed
        ? null
        : {
            index: 0,
            startsAt: firstAt,
            endsAt: firstAt + settings.timeLimitSeconds * 1000,
            revealUntil: null,
          },
      finishedAt: questions.length === 0 ? now : null,
    };
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return { rejected: "The game is over." };
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return { rejected: "You're watching this game." };
    if (action.type === "answer") {
      const question = state.questions[action.index];
      if (!question || action.choice >= question.choices.length) {
        return { rejected: "That isn't one of the choices." };
      }
    }
    if (state.settings.variant === "speed") return actSpeed(state, player, action, now);
    if (action.type === "next") return { rejected: "Classic moves on by itself." };
    return answerClassic(state, player, action, now);
  },

  onPlayerLeft(state, playerId, now) {
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    const next = { ...state, players };
    if (next.finishedAt !== null) return next;
    return state.settings.variant === "classic"
      ? closeRoundIfEveryoneAnswered(next, now)
      : finishIfEveryoneDone(next, now);
  },

  tick: (state, now) =>
    state.settings.variant === "classic" ? tickClassic(state, now) : tickSpeed(state, now),

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    if (state.round) return state.round.revealUntil ?? state.round.endsAt;
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

  viewFor,
};
