import { z } from "zod";
import { LEVELS, type Level } from "../levels";

/** Minutes to find the four groups: for the whole game in Speed, for each round in Elimination. */
export const CONNECTIONS_MINUTES = [3, 5, 10] as const;

export const CONNECTIONS_MODES = [
  {
    id: "classic",
    name: "Classic",
    description: "No clock. Everyone races to find the four groups, and the first one done wins.",
  },
  {
    id: "speed",
    name: "Speed",
    description:
      "Against the countdown. The fastest solve wins; if time runs out, the most groups found.",
  },
  {
    id: "elimination",
    name: "Elimination",
    description:
      "A new puzzle each round, against the countdown. Solve it to stay safe; the fewest groups go out, until two meet in the final.",
  },
] as const;
export type ConnectionsMode = (typeof CONNECTIONS_MODES)[number]["id"];

const connectionsSettingsObject = z.object({
  mode: z.enum(CONNECTIONS_MODES.map((m) => m.id) as [ConnectionsMode, ...ConnectionsMode[]]),
  level: z.enum(LEVELS),
  minutes: z.literal(CONNECTIONS_MINUTES),
});

export type ConnectionsSettings = z.infer<typeof connectionsSettingsObject>;

export const connectionsSettingsSchema: z.ZodType<ConnectionsSettings> = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const raw = { ...(value as Record<string, unknown>) };
  // Rooms saved before modes raced against the clock, which is Speed now.
  raw.mode ??= "speed";
  return raw;
}, connectionsSettingsObject) as z.ZodType<ConnectionsSettings>;

export const DEFAULT_CONNECTIONS_SETTINGS: ConnectionsSettings = {
  mode: "speed",
  level: "medium",
  minutes: 5,
};

/** Puzzles at the level asked for: one, or for Elimination one per round, all different. */
export interface ConnectionsContentRequest {
  kind: "connections-puzzle";
  level: Level;
  /** How many puzzles; one when missing. */
  count?: number;
}

/** Four words that belong together, and what links them. */
export interface ConnectionsGroup {
  name: string;
  words: string[];
}

/** A puzzle as stored in the content bank: four groups, from the plainest to the trickiest. */
export interface ConnectionsPuzzle {
  id: string;
  level: Level;
  groups: ConnectionsGroup[];
}
