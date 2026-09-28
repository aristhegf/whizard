import { z } from "zod";

export const SPOT_IT_ROUNDS = [5, 10, 15] as const;
export const SPOT_IT_TIME_LIMITS_SECONDS = [15, 20, 30] as const;

export const spotItSettingsSchema = z.object({
  rounds: z.literal(SPOT_IT_ROUNDS),
  timeLimitSeconds: z.literal(SPOT_IT_TIME_LIMITS_SECONDS),
});

export type SpotItSettings = z.infer<typeof spotItSettingsSchema>;

export const DEFAULT_SPOT_IT_SETTINGS: SpotItSettings = { rounds: 10, timeLimitSeconds: 20 };
