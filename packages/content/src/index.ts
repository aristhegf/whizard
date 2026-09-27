// Server-only: this package contains the answers, so the web app must never import it.
import {
  seededRng,
  shuffled,
  type ContentRequest,
  type QuizCategory,
  type QuizDifficulty,
} from "@whizard/game-core";
import { z } from "zod";
import animals from "./questions/animals.json";
import bible from "./questions/bible.json";
import football from "./questions/football.json";
import generalKnowledge from "./questions/general-knowledge.json";
import geography from "./questions/geography.json";
import history from "./questions/history.json";
import movies from "./questions/movies.json";
import music from "./questions/music.json";
import nigerianCulture from "./questions/nigerian-culture.json";
import popCulture from "./questions/pop-culture.json";
import science from "./questions/science.json";
import { storedQuestionSchema, type StoredQuestion } from "./schema";

export * from "./quality";
export * from "./schema";

/** One file per category. They ship with the Worker until reports and history need D1. */
export const QUESTION_FILES: Record<QuizCategory, unknown> = {
  bible,
  geography,
  history,
  science,
  animals,
  football,
  movies,
  music,
  "nigerian-culture": nigerianCulture,
  "general-knowledge": generalKnowledge,
  "pop-culture": popCulture,
};

export const QUESTIONS: readonly StoredQuestion[] = Object.values(QUESTION_FILES).flatMap((file) =>
  z.array(storedQuestionSchema).parse(file),
);

export type QuestionCounts = Partial<Record<QuizCategory, Record<QuizDifficulty, number>>>;

export function questionCounts(questions: readonly StoredQuestion[] = QUESTIONS): QuestionCounts {
  const counts: QuestionCounts = {};
  for (const q of questions) {
    const row = (counts[q.category] ??= { easy: 0, medium: 0, hard: 0 });
    row[q.difficulty]++;
  }
  return counts;
}

export function drawQuestions(
  category: QuizCategory,
  difficulty: QuizDifficulty,
  count: number,
  seed: number,
  questions: readonly StoredQuestion[] = QUESTIONS,
): StoredQuestion[] {
  const pool = questions.filter((q) => q.category === category && q.difficulty === difficulty);
  return shuffled(pool, seededRng(seed)).slice(0, count);
}

export function drawContent(request: ContentRequest, seed: number): unknown[] {
  switch (request.kind) {
    case "quiz-questions":
      return drawQuestions(request.category, request.difficulty, request.count, seed);
  }
}
