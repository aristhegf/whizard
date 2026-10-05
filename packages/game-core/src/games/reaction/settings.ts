import { z } from "zod";

/** How many rounds a game of Reaction lasts. */
export const REACTION_ROUNDS = [5, 10, 15] as const;

/** How long the pad stays lit after the signal: the window the tap has to land in. */
export const REACTION_TAP_SECONDS = [2, 3, 5] as const;

export const reactionSettingsSchema = z.object({
  rounds: z.literal(REACTION_ROUNDS),
  tapSeconds: z.literal(REACTION_TAP_SECONDS),
});

export type ReactionSettings = z.infer<typeof reactionSettingsSchema>;

export const DEFAULT_REACTION_SETTINGS: ReactionSettings = {
  rounds: 10,
  tapSeconds: 3,
};
