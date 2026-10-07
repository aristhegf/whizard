import { z } from "zod";

/** How many rounds a game of Reaction lasts. */
export const REACTION_ROUNDS = [5, 10, 15] as const;

/** How long the options stay up: the window the tap has to land in. */
export const REACTION_TAP_SECONDS = [2, 3, 5] as const;

/**
 * The four levels, by how much is on screen to find the target among: Easy is one tile (pure
 * reaction), Medium two, Hard four, Insane a square grid the host picks the side of.
 */
export const REACTION_LEVELS = ["easy", "medium", "hard", "insane"] as const;
export type ReactionLevel = (typeof REACTION_LEVELS)[number];

export const REACTION_LEVEL_NAMES: Record<ReactionLevel, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  insane: "Insane",
};

/** Side lengths for Insane's grid: 5×5 (25 tiles), 6×6 (36) or 7×7 (49). */
export const REACTION_INSANE_SIZES = [5, 6, 7] as const;

export const reactionSettingsSchema = z.object({
  rounds: z.literal(REACTION_ROUNDS),
  tapSeconds: z.literal(REACTION_TAP_SECONDS),
  // Rooms made before the levels existed read back as Easy on a 5×5.
  level: z.literal(REACTION_LEVELS).default("easy"),
  insaneSize: z.literal(REACTION_INSANE_SIZES).default(5),
});

export type ReactionSettings = z.infer<typeof reactionSettingsSchema>;

export const DEFAULT_REACTION_SETTINGS: ReactionSettings = {
  rounds: 10,
  tapSeconds: 3,
  level: "easy",
  insaneSize: 5,
};
