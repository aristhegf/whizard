import { z } from "zod";

/** How many prompts a game of Most Likely To lasts. */
export const MOST_LIKELY_TO_ROUNDS = [5, 10, 15] as const;

/** How long each vote stays open. It closes sooner once everyone has voted. */
export const MOST_LIKELY_TO_VOTE_SECONDS = [10, 15, 20, 30] as const;

/** The prompt packs, each its own set in the content bank. */
export const MOST_LIKELY_TO_PACKS = [
  { id: "classic", name: "Classic", description: "Everyday habits and quirks, for any group." },
  { id: "family", name: "Family", description: "Kind and silly, for all ages around the table." },
  { id: "work", name: "Work", description: "Meetings, inboxes and office life." },
  {
    id: "couples",
    name: "Couples",
    description: "Light and romantic, for pairs and their friends.",
  },
] as const;

export type MostLikelyToPack = (typeof MOST_LIKELY_TO_PACKS)[number]["id"];

export const MOST_LIKELY_TO_PACK_IDS = MOST_LIKELY_TO_PACKS.map((p) => p.id) as [
  MostLikelyToPack,
  ...MostLikelyToPack[],
];

export const mostLikelyToSettingsSchema = z.object({
  rounds: z.literal(MOST_LIKELY_TO_ROUNDS),
  voteSeconds: z.literal(MOST_LIKELY_TO_VOTE_SECONDS),
  pack: z.enum(MOST_LIKELY_TO_PACK_IDS),
  /** The reveal shows the tally and the winners, but not who voted for whom. */
  anonymousVotes: z.boolean(),
});

export type MostLikelyToSettings = z.infer<typeof mostLikelyToSettingsSchema>;

export const DEFAULT_MOST_LIKELY_TO_SETTINGS: MostLikelyToSettings = {
  rounds: 10,
  voteSeconds: 20,
  pack: "classic",
  anonymousVotes: false,
};

/** One prompt per round from a pack, all different. */
export interface MostLikelyToContentRequest {
  kind: "most-likely-to-prompts";
  pack: MostLikelyToPack;
  count: number;
}

/**
 * A prompt as stored in the content bank. `text` finishes the sentence "Most likely to …",
 * e.g. "forget their own birthday"; the screen adds the start.
 */
export interface MostLikelyToPrompt {
  id: string;
  pack: MostLikelyToPack;
  text: string;
}
