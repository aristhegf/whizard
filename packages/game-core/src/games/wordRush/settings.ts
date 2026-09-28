import { z } from "zod";

export const WORD_LEVELS = ["easy", "medium", "hard"] as const;
export type WordLevel = (typeof WORD_LEVELS)[number];

export const WORD_RUSH_ROUNDS = [5, 10, 15] as const;
export const WORD_RUSH_TIME_LIMITS_SECONDS = [20, 30, 45] as const;

export const wordRushSettingsSchema = z.object({
  rounds: z.literal(WORD_RUSH_ROUNDS),
  timeLimitSeconds: z.literal(WORD_RUSH_TIME_LIMITS_SECONDS),
});

export type WordRushSettings = z.infer<typeof wordRushSettingsSchema>;

export const DEFAULT_WORD_RUSH_SETTINGS: WordRushSettings = { rounds: 10, timeLimitSeconds: 30 };

/** One word per round, at the level given for that round. */
export interface WordsContentRequest {
  kind: "words";
  levels: WordLevel[];
}

/** A word as stored in the content bank. */
export interface WordEntry {
  id: string;
  level: WordLevel;
  /** Shown with the puzzle, e.g. "Animal". */
  hint: string;
  /** Upper case A to Z. */
  word: string;
  /** Other words made of the same letters. They count when unscrambling. */
  also: string[];
  /** Letters hidden in a missing-letters puzzle, by position. Empty if it only unscrambles. */
  gaps: number[];
  /** Other words that fit the missing-letters pattern. They count too. */
  fits: string[];
}

/** Easy words first, harder ones as the game goes on. */
export function levelsFor(rounds: number): WordLevel[] {
  return Array.from({ length: rounds }, (_, i) => WORD_LEVELS[Math.floor((i * 3) / rounds)]!);
}
