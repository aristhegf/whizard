import { shuffled } from "../../random";
import type { ItemResult } from "../types";
import type { QuizQuestion } from "./settings";

// What Classic and Speed share with Elimination.

/** Answers this early are accepted, to allow for small clock differences. */
export const EARLY_TOLERANCE_MS = 1000;

export interface PreparedQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctChoice: number;
  explanation: string | null;
  reference: string | null;
}

export interface AnswerRecord {
  index: number;
  /** null when time ran out. */
  choice: number | null;
  correct: boolean;
  points: number;
  elapsedMs: number;
}

export interface QuizReviewItem {
  index: number;
  /** The bank's ID for the question, so a player can report it. */
  questionId: string;
  prompt: string;
  choices: string[];
  myChoice: number | null;
  correctChoice: number;
  correct: boolean;
  points: number;
  explanation: string | null;
  reference: string | null;
}

export function prepare(question: QuizQuestion, rng: () => number): PreparedQuestion {
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

/** How each question went, for the admin numbers. Counts everyone who answered it. */
export function itemResults(
  questions: readonly PreparedQuestion[],
  players: readonly { answers: readonly AnswerRecord[] }[],
): ItemResult[] {
  return questions.map((q, index) => {
    const item: ItemResult = { id: q.id, answered: 0, correct: 0, timedOut: 0, wrongPicks: {} };
    for (const player of players) {
      const answer = player.answers.find((a) => a.index === index);
      if (!answer) continue;
      if (answer.choice === null) {
        item.timedOut++;
        continue;
      }
      item.answered++;
      if (answer.correct) item.correct++;
      else {
        const text = q.choices[answer.choice] ?? "";
        item.wrongPicks[text] = (item.wrongPicks[text] ?? 0) + 1;
      }
    }
    return item;
  });
}
