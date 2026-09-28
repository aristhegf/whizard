import { seededRng } from "../../random";
import {
  knockoutEngine,
  knockoutPlacings,
  knockoutView,
  type KnockoutPlayer,
  type KnockoutStage,
  type KnockoutState,
  type KnockoutViewBase,
} from "../knockout/knockout";
import type { GamePlayer, GameSummary, Rejection } from "../types";
import {
  itemResults,
  prepare,
  type AnswerRecord,
  type PreparedQuestion,
  type QuizReviewItem,
} from "./common";
import { creditedElapsed, pointsFor } from "./scoring";
import type { QuizQuestion, QuizSettings } from "./settings";

// The quiz's Elimination: the shared knock-out rules (../knockout) with questions as the items.

export {
  CUT_MS,
  ELIMINATION_MIN_PLAYERS,
  FINAL_INTRO_MS,
  MAX_ROUNDS,
  REVEAL_MS,
  SPARE_QUESTIONS,
  START_COUNTDOWN_MS,
  eliminationStandings,
  keepCount,
  planRounds,
  plannedItems,
  roundCount,
  type EliminationStanding,
  type EliminationStatus,
} from "../knockout/knockout";

export type EliminationState = KnockoutState<QuizSettings, PreparedQuestion, AnswerRecord, never>;
type Player = KnockoutPlayer<AnswerRecord, never>;

const engine = knockoutEngine<QuizSettings, PreparedQuestion, AnswerRecord, never>({
  limitMs: (settings) => settings.timeLimitSeconds * 1000,
  timedOut: (_question, index, _tried, limitMs) => ({
    index,
    choice: null,
    correct: false,
    points: 0,
    elapsedMs: limitMs,
  }),
});

export const tickElimination = engine.tick;
export const joinElimination = engine.join;
export const leaveElimination = engine.leave;
export const nextWakeElimination = engine.nextWakeAt;

export function setupElimination(args: {
  settings: QuizSettings;
  players: GamePlayer[];
  content: QuizQuestion[];
  seed: number;
  now: number;
}): EliminationState {
  const rng = seededRng(args.seed);
  return engine.setup({
    settings: args.settings,
    players: args.players,
    items: args.content.map((q) => prepare(q, rng, args.settings.difficulty)),
    perRound: args.settings.count,
    now: args.now,
  });
}

export function answerElimination(
  state: EliminationState,
  playerId: string,
  action: { index: number; choice: number; clientElapsedMs: number },
  now: number,
): EliminationState | Rejection {
  return engine.move(state, playerId, action.index, now, (_player, question, serverMs) => {
    if (action.choice >= question.choices.length) {
      return { rejected: "That isn't one of the choices." };
    }
    const limit = engine.limitMs(state);
    const elapsedMs = creditedElapsed(action.clientElapsedMs, serverMs, limit);
    const correct = action.choice === question.correctChoice;
    return {
      index: state.index,
      choice: action.choice,
      correct,
      elapsedMs,
      points: pointsFor(correct, elapsedMs, limit, question.level),
    };
  });
}

// Views ---------------------------------------------------------------------------------------

export type EliminationStage = KnockoutStage<
  { prompt: string; choices: string[]; myChoice: number | null },
  QuizReviewItem,
  { review: QuizReviewItem[] }
>;

export interface EliminationView extends KnockoutViewBase<EliminationStage> {
  game: "quiz";
}

function reviewItem(state: EliminationState, player: Player | undefined, index: number) {
  const question = state.items[index]!;
  const answer = player?.answers.find((a) => a.index === index);
  return {
    index,
    questionId: question.id,
    prompt: question.prompt,
    choices: question.choices,
    myChoice: answer?.choice ?? null,
    correctChoice: question.correctChoice,
    correct: answer?.correct ?? false,
    points: answer?.points ?? 0,
    explanation: question.explanation,
    reference: question.reference,
  };
}

export function viewElimination(state: EliminationState, playerId: string): EliminationView {
  return {
    game: "quiz",
    ...knockoutView(state, playerId, engine.limitMs(state), {
      item: (question, player) => ({
        prompt: question.prompt,
        choices: question.choices,
        myChoice: player?.answers.find((a) => a.index === state.index)?.choice ?? null,
      }),
      reveal: (_question, index, player) => reviewItem(state, player, index),
      done: (player) => ({
        review: player ? player.answers.map((a) => reviewItem(state, player, a.index)) : [],
      }),
    }),
  };
}

export function summarizeElimination(state: EliminationState): GameSummary {
  return {
    category: state.settings.category,
    difficulty: state.settings.difficulty,
    mode: "elimination",
    rounds: state.index + 1,
    players: knockoutPlacings(state),
    items: itemResults(state.items.slice(0, state.index + 1), state.players),
  };
}
