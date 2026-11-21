import { z } from "zod";

/** How many rounds a game lasts: one subject and one question each. */
export const HOW_WELL_ROUNDS = [5, 10, 15] as const;

/** How long everyone has to answer: the subject picks their answer, the others guess it. */
export const HOW_WELL_ANSWER_SECONDS = [15, 20, 30] as const;

/** The question packs, each written for a different kind of group. */
export const HOW_WELL_PACKS = [
  {
    id: "couples",
    name: "Couples",
    description: "Sweet, light questions for two people who know each other best.",
  },
  {
    id: "best-friends",
    name: "Best friends",
    description: "Inside-out questions for friends who think they know it all.",
  },
  {
    id: "family",
    name: "Family",
    description: "Warm questions for parents, kids, siblings and cousins of every age.",
  },
  {
    id: "friend-group",
    name: "Friend group",
    description: "Fun questions for a whole crowd of friends.",
  },
] as const;

export type HowWellPack = (typeof HOW_WELL_PACKS)[number]["id"];

export const HOW_WELL_PACK_IDS = HOW_WELL_PACKS.map((p) => p.id) as [HowWellPack, ...HowWellPack[]];

export const howWellSettingsSchema = z.object({
  rounds: z.literal(HOW_WELL_ROUNDS),
  answerSeconds: z.literal(HOW_WELL_ANSWER_SECONDS),
  pack: z.enum(HOW_WELL_PACK_IDS),
});

export type HowWellSettings = z.infer<typeof howWellSettingsSchema>;

export const DEFAULT_HOW_WELL_SETTINGS: HowWellSettings = {
  rounds: 10,
  answerSeconds: 20,
  pack: "friend-group",
};

/** Where a question says the subject's nickname: "What's {name}'s ideal Saturday?". */
export const HOW_WELL_NAME_PLACEHOLDER = "{name}";

/** One question per round from the pack, all different. */
export interface HowWellContentRequest {
  kind: "how-well-questions";
  pack: HowWellPack;
  count: number;
}

/** A question as stored in the content bank. It has no right answer: the subject's pick is it. */
export interface HowWellQuestion {
  id: string;
  pack: HowWellPack;
  /** With `{name}` where the subject's nickname goes. */
  prompt: string;
  /** Exactly four. */
  choices: string[];
}

/** A question as it reads for this subject: every `{name}` swapped for their nickname. */
export function fillName(prompt: string, nickname: string): string {
  return prompt.split(HOW_WELL_NAME_PLACEHOLDER).join(nickname);
}
