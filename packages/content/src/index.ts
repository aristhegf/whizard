// Server-only: this package contains the answers, so the web app must never import it.
import {
  QUIZ_CATEGORIES,
  QUIZ_DIFFICULTIES,
  seededRng,
  shuffled,
  type ContentRequest,
  type QuizCategory,
  type QuizDifficulty,
} from "@whizard/game-core";
import { z } from "zod";
import bible from "./questions/bible.json";

export const storedQuestionSchema = z.object({
  id: z.string().min(1),
  category: z.enum(QUIZ_CATEGORIES.map((c) => c.id) as [QuizCategory, ...QuizCategory[]]),
  topic: z.string().min(1),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  prompt: z.string().min(1).max(120),
  choices: z.array(z.string().min(1).max(40)).length(4),
  explanation: z.string().min(1).max(160),
  reference: z.string().min(1),
});

export type StoredQuestion = z.infer<typeof storedQuestionSchema>;

/** Until the content pipeline moves questions into D1, they ship with the Worker. */
export const QUESTIONS: readonly StoredQuestion[] = z.array(storedQuestionSchema).parse(bible);

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
