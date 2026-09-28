import { z } from "zod";
import { knockoutLevelPlan } from "../knockout/knockout";
import { LEVELS, levelPlan, type Level } from "../levels";
import { levelChoiceSchema, roundsModeSchema, type RoundsMode } from "../rounds/rounds";

export const WORD_LEVELS = LEVELS;
export type WordLevel = Level;

export const WORD_RUSH_ROUNDS = [5, 10, 15] as const;
export const WORD_RUSH_TIME_LIMITS_SECONDS = [20, 30, 45] as const;

export const wordRushSettingsSchema = z.object({
  mode: roundsModeSchema,
  level: levelChoiceSchema,
  rounds: z.literal(WORD_RUSH_ROUNDS),
  timeLimitSeconds: z.literal(WORD_RUSH_TIME_LIMITS_SECONDS),
});

export type WordRushSettings = z.infer<typeof wordRushSettingsSchema>;

export const DEFAULT_WORD_RUSH_SETTINGS: WordRushSettings = {
  mode: "speed",
  level: "auto",
  rounds: 10,
  timeLimitSeconds: 30,
};

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

/**
 * The level of each word a game draws: one level throughout, or Auto's blend from easy to
 * hard. Elimination plans by its knock-out rounds and adds spares for sudden death.
 */
export function levelsFor(
  settings: { mode: RoundsMode; level: WordRushSettings["level"]; rounds: number },
  players = 1,
): WordLevel[] {
  return settings.mode === "elimination"
    ? knockoutLevelPlan(settings.level, players, settings.rounds)
    : levelPlan(settings.level, settings.rounds);
}
