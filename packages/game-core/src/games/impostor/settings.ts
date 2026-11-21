import { z } from "zod";

/** How many rounds a game of Impostor lasts: one secret word and one impostor each. */
export const IMPOSTOR_ROUNDS = [3, 5, 8] as const;

/** Seconds each player has for their clue. */
export const IMPOSTOR_CLUE_SECONDS = [15, 20, 30] as const;

/** Seconds everyone has to vote for who they think the impostor is. */
export const IMPOSTOR_VOTE_SECONDS = [20, 30, 45] as const;

/**
 * How clues are given: typed (one word each, shown to everyone as it arrives) or spoken out loud,
 * for a group in the same room — the turn only shows whose go it is, with a "done" button.
 */
export const IMPOSTOR_CLUE_MODES = [
  { id: "typed", name: "Typed" },
  { id: "spoken", name: "Spoken" },
] as const;
export type ImpostorClueMode = (typeof IMPOSTOR_CLUE_MODES)[number]["id"];

/** The word categories. Every round's word comes from one, and the category is shown to all. */
export const IMPOSTOR_CATEGORIES = [
  { id: "food", name: "Food" },
  { id: "animals", name: "Animals" },
  { id: "places", name: "Places" },
  { id: "jobs", name: "Jobs" },
  { id: "home", name: "Things at home" },
  { id: "sports", name: "Sports" },
] as const;
export type ImpostorCategory = (typeof IMPOSTOR_CATEGORIES)[number]["id"];

/** What the host picks the words from: one category, or Mixed, which takes turns through them. */
export const IMPOSTOR_PACKS = [{ id: "mixed", name: "Mixed" }, ...IMPOSTOR_CATEGORIES] as const;
export type ImpostorPack = (typeof IMPOSTOR_PACKS)[number]["id"];

export const IMPOSTOR_CATEGORY_IDS = IMPOSTOR_CATEGORIES.map((c) => c.id) as [
  ImpostorCategory,
  ...ImpostorCategory[],
];
const PACK_IDS = IMPOSTOR_PACKS.map((p) => p.id) as [ImpostorPack, ...ImpostorPack[]];
const CLUE_MODE_IDS = IMPOSTOR_CLUE_MODES.map((m) => m.id) as [
  ImpostorClueMode,
  ...ImpostorClueMode[],
];

export function impostorCategoryName(id: string): string {
  return IMPOSTOR_CATEGORIES.find((c) => c.id === id)?.name ?? id;
}

export const impostorSettingsSchema = z.object({
  rounds: z.literal(IMPOSTOR_ROUNDS),
  clueSeconds: z.literal(IMPOSTOR_CLUE_SECONDS),
  voteSeconds: z.literal(IMPOSTOR_VOTE_SECONDS),
  clues: z.enum(CLUE_MODE_IDS),
  wordPack: z.enum(PACK_IDS),
});

export type ImpostorSettings = z.infer<typeof impostorSettingsSchema>;

export const DEFAULT_IMPOSTOR_SETTINGS: ImpostorSettings = {
  rounds: 5,
  clueSeconds: 20,
  voteSeconds: 30,
  clues: "typed",
  wordPack: "mixed",
};

/** How many choices the caught impostor picks the word from: the word and seven others. */
export const IMPOSTOR_GUESS_OPTIONS = 8;

/** One secret word per round from the pack, all different within a game. */
export interface ImpostorContentRequest {
  kind: "impostor-words";
  pack: ImpostorPack;
  count: number;
}

/** A round's word as the content bank hands it over, with the wrong picks for the last chance. */
export interface ImpostorWord {
  id: string;
  category: ImpostorCategory;
  word: string;
  /** Other words from the same category: the caught impostor picks the word from among them. */
  decoys: string[];
}
