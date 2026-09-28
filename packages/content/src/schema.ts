import {
  QUIZ_CATEGORIES,
  QUIZ_DIFFICULTIES,
  WORD_LEVELS,
  type QuizCategory,
} from "@whizard/game-core";
import { z } from "zod";

export const PROMPT_MAX = 120;
export const CHOICE_MAX = 40;
export const EXPLANATION_MAX = 160;

export const storedQuestionSchema = z.object({
  id: z.string().min(1),
  category: z.enum(QUIZ_CATEGORIES.map((c) => c.id) as [QuizCategory, ...QuizCategory[]]),
  topic: z.string().min(1),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  prompt: z.string().min(1).max(PROMPT_MAX),
  /** Exactly four; the first is the correct answer. */
  choices: z.array(z.string().min(1).max(CHOICE_MAX)).length(4),
  explanation: z.string().min(1).max(EXPLANATION_MAX),
  /** Where the answer can be checked, e.g. a Bible verse. */
  reference: z.string().min(1).optional(),
});

export type StoredQuestion = z.infer<typeof storedQuestionSchema>;

const upperWord = z.string().regex(/^[A-Z]+$/);

/** A Word Rush word. Built from words/source.txt by `pnpm --filter @whizard/content words`. */
export const storedWordSchema = z.object({
  id: z.string().regex(/^word-\d{3}$/),
  level: z.enum(WORD_LEVELS),
  hint: z.string().min(1).max(24),
  word: upperWord.min(4).max(10),
  also: z.array(upperWord),
  gaps: z.array(z.number().int().min(1)),
  fits: z.array(upperWord),
});

export type StoredWord = z.infer<typeof storedWordSchema>;
