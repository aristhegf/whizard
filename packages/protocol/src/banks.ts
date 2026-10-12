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
/** Most questions one bank may hold. */
export const MAX_QUESTIONS_PER_BANK = 500;
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
