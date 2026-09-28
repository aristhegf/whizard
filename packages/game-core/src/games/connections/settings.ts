import { z } from "zod";
import { LEVELS, type Level } from "../levels";

/** Minutes a player has to find the four groups. */
export const CONNECTIONS_MINUTES = [3, 5, 10] as const;

export const connectionsSettingsSchema = z.object({
  level: z.enum(LEVELS),
  minutes: z.literal(CONNECTIONS_MINUTES),
});

export type ConnectionsSettings = z.infer<typeof connectionsSettingsSchema>;

export const DEFAULT_CONNECTIONS_SETTINGS: ConnectionsSettings = { level: "medium", minutes: 5 };

/** One puzzle at the level asked for. */
export interface ConnectionsContentRequest {
  kind: "connections-puzzle";
  level: Level;
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
