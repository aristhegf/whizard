import { z } from "zod";

/**
 * A signed-in player's own question bank, and the questions inside it. Private by default:
 * nothing here is playable in public rooms yet (workstream 7), and none of it touches the
 * shipped bank or the admin overlay in `custom_questions`.
 */

/** How long a bank's name may be. */
export const BANK_NAME_MAX = 60;
/** How long the optional exam and subject labels may be. */
export const BANK_LABEL_MAX = 40;
/** Most banks one account may keep. */
export const MAX_BANKS_PER_USER = 50;
/** Most questions one bank may hold. Import brings this within one CSV's reach. */
export const MAX_QUESTIONS_PER_BANK = 1000;
/** How long an optional verse/source reference may be. */
export const BANK_REFERENCE_MAX = 60;
/**
 * Question caps for a bank. The same numbers the shipped bank uses (`PROMPT_MAX` and friends
 * in `@whizard/content`); kept here so the web form and the server's validation agree without
 * the web app taking a dependency on the content package. Gate G1 owns widening the shape —
 * both copies move together then.
 */
export const BANK_PROMPT_MAX = 120;
export const BANK_CHOICE_MAX = 40;
export const BANK_EXPLANATION_MAX = 160;

/** One question in a bank. Four choices, the first correct — the shipped bank's shape. */
export interface PlayerBankQuestion {
  id: string;
  prompt: string;
  choices: string[];
  explanation: string;
  reference: string | null;
}

/** A bank as the list shows it: its labels and how many questions it holds. */
export interface PlayerBank {
  id: string;
  name: string;
  exam: string | null;
  subject: string | null;
  questionCount: number;
  createdAt: number;
  updatedAt: number;
}

/** A bank with its questions, in playing order. */
export interface PlayerBankDetail extends PlayerBank {
  questions: PlayerBankQuestion[];
}

const trimmed = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} can’t be empty.`)
    .max(max, `${label} can be up to ${max} characters.`);

const label = z
  .string()
  .trim()
  .max(BANK_LABEL_MAX, `The label can be up to ${BANK_LABEL_MAX} characters.`)
  .nullable()
  .transform((value) => (value ? value : null));

/** `POST /api/banks`: the body that makes one. */
export const bankCreateSchema = z.object({
  name: trimmed("The bank’s name", BANK_NAME_MAX),
  exam: label.optional(),
  subject: label.optional(),
});

/** `PATCH /api/banks/:id`: whatever of the three fields is being changed. */
export const bankUpdateSchema = z
  .object({
    name: trimmed("The bank’s name", BANK_NAME_MAX).optional(),
    exam: label.optional(),
    subject: label.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.exam !== undefined || body.subject !== undefined,
    { message: "Nothing to change." },
  );

export type BankCreate = z.infer<typeof bankCreateSchema>;
export type BankUpdate = z.infer<typeof bankUpdateSchema>;

// CSV import and export -----------------------------------------------------------------------

/** Most rows one import file may carry, matching the admin importer's cap. */
export const MAX_IMPORT_ROWS = 1000;
/** How big an import file's text may be: a thousand questions is a few hundred KB. */
export const IMPORT_MAX_BYTES = 1024 * 1024;
/** How many questions one AI call answers; the web app loops until the import is done. */
export const AI_BATCH_SIZE = 20;
/** How long an unfinished import waits before it's cleaned up. */
export const IMPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Where a staged row's answer came from: the file's key, the AI, a manual pick, or nowhere yet. */
export type ImportRowSource = "key" | "ai" | "manual" | "none";

/** One staged import row as the review screen shows it. */
export interface BankImportRow {
  /** Position among the file's rows, from 0. */
  idx: number;
  /** The file's own line number, for messages. */
  row: number;
  prompt: string;
  /** The four options as the file had them, before any answer was moved to the front. */
  choices: string[];
  /** Which option (0–3 into `choices`) is marked correct, or null while unanswered. */
  answerIndex: number | null;
  explanation: string;
  reference: string | null;
  source: ImportRowSource;
  /** Why this row needs the owner's eye; empty once it's ready. */
  review: string;
  /** A short explanation the AI offered, kept beside the file's own. */
  aiExplanation: string;
}

/** How an import stands: totals, what's ready, and what still needs a person. */
export interface BankImportCounts {
  total: number;
  ready: number;
  withKey: number;
  aiAnswered: number;
  needsReview: number;
  /** Rows still waiting for an answer (from the AI or by hand). */
  pending: number;
}

/** A row the file couldn't hold, reported once at upload and not staged. */
export interface BankImportInvalidNote {
  row: number;
  message: string;
}

/** A staged import under review, before anything reaches the bank. */
export interface PlayerBankImport {
  id: string;
  bankId: string;
  counts: BankImportCounts;
  /** The rows that need review — the only ones the screen lists. */
  flagged: BankImportRow[];
  /** Rows the file couldn't take, only on the upload response. */
  invalid?: { count: number; notes: BankImportInvalidNote[] };
}

/** `POST /api/banks/:id/imports`: the CSV text to stage. */
export const bankImportSchema = z.object({
  csv: z.string().min(1, "The file is empty.").max(IMPORT_MAX_BYTES, "That file is too big."),
});

/** One manual correction in a staged import: which row, which answer, and maybe a new explanation. */
export const importRowSetSchema = z.object({
  idx: z.number().int().min(0),
  answerIndex: z.number().int().min(0).max(3, "Pick one of the four answers."),
  explanation: z
    .string()
    .trim()
    .max(BANK_EXPLANATION_MAX, `The explanation can be up to ${BANK_EXPLANATION_MAX} characters.`)
    .optional(),
});

/** `PATCH /api/banks/:id/imports/:impId/rows`: accept the AI's flagged answers and/or fix rows. */
export const bankImportPatchSchema = z
  .object({
    acceptAi: z.boolean().optional(),
    set: z.array(importRowSetSchema).max(MAX_IMPORT_ROWS).optional(),
  })
  .refine((body) => body.acceptAi !== undefined || body.set !== undefined, {
    message: "Nothing to change.",
  });

export type BankImportPatch = z.infer<typeof bankImportPatchSchema>;
