import { z } from "zod";

/** How many questions a game of Memory lasts. */
export const MEMORY_ROUNDS = [5, 10, 15] as const;

/** How long the items stay on screen before the question: seconds to remember them. */
export const MEMORY_REVEAL_SECONDS = [3, 5, 8] as const;

export const memorySettingsSchema = z.object({
  rounds: z.literal(MEMORY_ROUNDS),
  revealSeconds: z.literal(MEMORY_REVEAL_SECONDS),
});

export type MemorySettings = z.infer<typeof memorySettingsSchema>;

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  rounds: 10,
  revealSeconds: 5,
};
