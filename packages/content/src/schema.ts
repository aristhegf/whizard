import {
  CONNECTIONS_GROUP_SIZE,
  IMPOSTOR_CATEGORY_IDS,
  HOW_WELL_NAME_PLACEHOLDER,
  HOW_WELL_PACK_IDS,
  LEVELS,
  MOST_LIKELY_TO_PACK_IDS,
  QUIZ_DIFFICULTIES,
  WORD_LEVELS,
  topicIdSchema,
  type ImpostorCategory,
} from "@whizard/game-core";
import { z } from "zod";

export const PROMPT_MAX = 120;
export const CHOICE_MAX = 40;
export const EXPLANATION_MAX = 160;

export const storedQuestionSchema = z.object({
  id: z.string().min(1),
  category: topicIdSchema,
  topic: z.string().min(1),
  difficulty: z.enum(QUIZ_DIFFICULTIES),
  prompt: z.string().min(1).max(PROMPT_MAX),
  /** Exactly four; the first is the correct answer. */
  choices: z.array(z.string().min(1).max(CHOICE_MAX)).length(4),
  explanation: z.string().min(1).max(EXPLANATION_MAX),
  /** Where the answer can be checked, e.g. a Bible verse. */
  reference: z.string().min(1).optional(),
});

export type StoredQuestion = z.infer<typeof storedQuestionSchema>;

const upperWord = z.string().regex(/^[A-Z]+$/);

/** A Word Rush word. Built from words/source.txt by `pnpm --filter @whizard/content words`. */
export const storedWordSchema = z.object({
  id: z.string().regex(/^word-\d{3}$/),
  level: z.enum(WORD_LEVELS),
  hint: z.string().min(1).max(24),
  word: upperWord.min(4).max(10),
  also: z.array(upperWord),
  gaps: z.array(z.number().int().min(1)),
  fits: z.array(upperWord),
});

export type StoredWord = z.infer<typeof storedWordSchema>;

/** A word on a Connections tile: capitals, with spaces or hyphens inside. */
const tileWord = z
  .string()
  .regex(/^[A-Z][A-Z -]*[A-Z]$/)
  .max(14);

/** A Connections puzzle: four groups of four, from the plainest link to the trickiest. */
export const storedConnectionsSchema = z
  .object({
    id: z.string().regex(/^connections-\d{3}$/),
    level: z.enum(LEVELS),
    groups: z
      .array(
        z.object({
          name: z.string().min(1).max(28),
          words: z.array(tileWord).length(CONNECTIONS_GROUP_SIZE),
        }),
      )
      .length(4),
  })
  .refine((p) => new Set(p.groups.flatMap((g) => g.words)).size === 16, {
    message: "Every word on the board must be different.",
  });

export type StoredConnections = z.infer<typeof storedConnectionsSchema>;

export const MOST_LIKELY_TO_PROMPT_MAX = 60;

/**
 * A Most Likely To prompt: the end of the sentence "Most likely to …", in lower case, with no
 * full stop ("forget their own birthday"). Its id names its pack.
 */
export const storedMostLikelyToPromptSchema = z
  .object({
    id: z.string().regex(/^mlt-[a-z]+-\d{3}$/),
    pack: z.enum(MOST_LIKELY_TO_PACK_IDS),
    text: z
      .string()
      .min(8)
      .max(MOST_LIKELY_TO_PROMPT_MAX)
      .regex(/^[a-z][a-zA-Z0-9 ',-]*[a-z]$/),
  })
  .refine((p) => p.id.startsWith(`mlt-${p.pack}-`), {
    message: "A prompt's id must name its pack.",
  })
  .refine((p) => !/^most likely/i.test(p.text), {
    message: "The screen adds “Most likely to”; the prompt is only the rest.",
  });

export type StoredMostLikelyToPrompt = z.infer<typeof storedMostLikelyToPromptSchema>;

/** An Impostor word: a capital first, then letters, with single spaces or hyphens inside. */
const impostorWord = z
  .string()
  .regex(/^[A-Z][a-z]*(?:[ -][A-Za-z][a-z]*)*$/)
  .max(20);

/** One Impostor category's words, as they're written in impostor/words.json. */
export const storedImpostorCategorySchema = z.object({
  category: z.enum(IMPOSTOR_CATEGORY_IDS),
  words: z.array(impostorWord).min(40),
});

export type StoredImpostorCategory = z.infer<typeof storedImpostorCategorySchema>;

/** A secret word for one round of Impostor, with an ID that tracks who has had it. */
export interface StoredImpostorWord {
  /** `impostor-<category>-<word>`, e.g. `impostor-food-ice-cream`. */
  id: string;
  category: ImpostorCategory;
  word: string;
}

export const HOW_WELL_PROMPT_MAX = 90;
export const HOW_WELL_CHOICE_MAX = 32;

/**
 * A How Well Do You Know Me? question. It has no right answer — the subject's own pick is the
 * answer — and says `{name}` where the subject's nickname goes.
 */
export const storedHowWellSchema = z
  .object({
    id: z.string().regex(/^how-well-[a-z-]+-\d{3}$/),
    pack: z.enum(HOW_WELL_PACK_IDS),
    prompt: z
      .string()
      .min(1)
      .max(HOW_WELL_PROMPT_MAX)
      .refine((p) => p.includes(HOW_WELL_NAME_PLACEHOLDER), {
        message: `The prompt must say ${HOW_WELL_NAME_PLACEHOLDER} where the subject's name goes.`,
      }),
    choices: z.array(z.string().min(1).max(HOW_WELL_CHOICE_MAX)).length(4),
  })
  .refine((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === 4, {
    message: "Every choice must be different.",
  })
  .refine((q) => q.id.startsWith(`how-well-${q.pack}-`), {
    message: "The id must name the question's pack.",
  });

export type StoredHowWell = z.infer<typeof storedHowWellSchema>;
