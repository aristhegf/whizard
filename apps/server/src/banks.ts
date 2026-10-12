import { findDuplicate, type StoredQuestion } from "@whizard/content";
import { randomToken } from "@whizard/game-core";
import {
  BANK_CHOICE_MAX,
  BANK_EXPLANATION_MAX,
  BANK_PROMPT_MAX,
  BANK_REFERENCE_MAX,
  bankCreateSchema,
  bankUpdateSchema,
  MAX_BANKS_PER_USER,
  MAX_QUESTIONS_PER_BANK,
  type BankCreate,
  type BankUpdate,
  type PlayerBank,
  type PlayerBankDetail,
  type PlayerBankQuestion,
} from "@whizard/protocol";
import { z } from "zod";
import { requireUser } from "./account";
import type { Env } from "./env";
import { HttpError, requireSameOrigin, withinLimit, type RequestContext } from "./http";
import { plainProblems } from "./adminQuestions";

/**
 * A signed-in player's own question banks: private rows in `user_banks`, kept apart from the
 * shipped bank and from the admin overlay in `custom_questions`. Every lookup is scoped to the
 * owner, so somebody else's bank reads as "not found" rather than "not yours".
 */

interface BankRow {
  id: string;
  owner_id: string;
  name: string;
  exam: string | null;
  subject: string | null;
  created_at: number;
  updated_at: number;
}

interface QuestionRow {
  id: string;
  bank_id: string;
  position: number;
  prompt: string;
  /** JSON array of four; the first is the correct answer. */
  choices: string;
  explanation: string;
  reference: string | null;
  created_at: number;
  updated_at: number;
}

const toSummary = (row: BankRow & { question_count?: number | null }): PlayerBank => ({
  id: row.id,
  name: row.name,
  exam: row.exam,
  subject: row.subject,
  questionCount: Number(row.question_count ?? 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toQuestion = (row: QuestionRow): PlayerBankQuestion => ({
  id: row.id,
  prompt: row.prompt,
  choices: JSON.parse(row.choices) as string[],
  explanation: row.explanation,
  reference: row.reference,
});

/** The signed-in user's bank, or a 404 — whether it's missing or somebody else's. */
export async function ownedBank(env: Env, bankId: string, ownerId: string): Promise<BankRow> {
  const row = await env.DB.prepare("SELECT * FROM user_banks WHERE id = ? AND owner_id = ?")
    .bind(bankId, ownerId)
    .first<BankRow>();
  if (!row) throw new HttpError(404, "not_found", "That bank doesn’t exist.");
  return row;
}

/** Bank writes go through one per-address limit, like room creation and reports. */
export async function withinWriteLimit(context: RequestContext): Promise<void> {
  if (!(await withinLimit(context.env.BANK_LIMIT, context.request))) {
    throw new HttpError(
      429,
      "too_many_writes",
      "That’s a lot of changes at once. Try again in a minute.",
    );
  }
}

/** Parses a body, showing the first validation message under the form that sent it. */
async function readBody<T>(
  context: RequestContext,
  schema: z.ZodType<T>,
  code: string,
): Promise<T> {
  const text = await context.request.text();
  if (text.length > 16 * 1024) {
    throw new HttpError(413, "too_large", "Request is too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, code, "That wasn’t valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, code, parsed.error.issues[0]?.message ?? "Check what you typed.");
  }
  return parsed.data;
}

/** `GET /api/banks`: every bank the signed-in player owns, most recently touched first. */
export async function listBanks(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const { results } = await context.env.DB.prepare(
    `SELECT b.id, b.name, b.exam, b.subject, b.created_at, b.updated_at,
            (SELECT COUNT(*) FROM user_bank_questions q WHERE q.bank_id = b.id) AS question_count
       FROM user_banks b
      WHERE b.owner_id = ?
      ORDER BY b.updated_at DESC`,
  )
    .bind(user.id)
    .all<BankRow & { question_count: number }>();
  return Response.json(
    { banks: results.map(toSummary) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** `POST /api/banks` with `{ name, exam?, subject? }`: a new, empty bank. */
export async function createBank(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const input = await readBody<BankCreate>(context, bankCreateSchema, "invalid_bank");

  const { n } = (await context.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM user_banks WHERE owner_id = ?",
  )
    .bind(user.id)
    .first<{ n: number }>())!;
  if (n >= MAX_BANKS_PER_USER) {
    throw new HttpError(
      400,
      "too_many_banks",
      `You can keep up to ${MAX_BANKS_PER_USER} banks. Delete one to make room.`,
    );
  }

  const now = Date.now();
  const row: BankRow = {
    id: `b_${randomToken(9)}`,
    owner_id: user.id,
    name: input.name,
    exam: input.exam ?? null,
    subject: input.subject ?? null,
    created_at: now,
    updated_at: now,
  };
  await context.env.DB.prepare(
    `INSERT INTO user_banks (id, owner_id, name, exam, subject, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(row.id, row.owner_id, row.name, row.exam, row.subject, now, now)
    .run();
  return Response.json({ bank: toSummary({ ...row, question_count: 0 }) }, { status: 201 });
}

/** `GET /api/banks/:id`: one bank with its questions, in order. */
export async function getBank(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const bank = await ownedBank(context.env, decodeURIComponent(context.params[0] ?? ""), user.id);
  const questions = (
    await context.env.DB.prepare(
      "SELECT * FROM user_bank_questions WHERE bank_id = ? ORDER BY position",
    )
      .bind(bank.id)
      .all<QuestionRow>()
  ).results.map(toQuestion);
  const body: PlayerBankDetail = {
    ...toSummary(bank),
    // The raw row has no count beside it, and the questions are already here.
    questionCount: questions.length,
    questions,
  };
  return Response.json({ bank: body }, { headers: { "Cache-Control": "no-store" } });
}

/** `PATCH /api/banks/:id` with any of `{ name, exam, subject }`: rename or relabel. */
export async function updateBank(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bank = await ownedBank(context.env, decodeURIComponent(context.params[0] ?? ""), user.id);
  const update = await readBody<BankUpdate>(context, bankUpdateSchema, "invalid_bank");
  const next = {
    name: update.name ?? bank.name,
    exam: update.exam === undefined ? bank.exam : update.exam,
    subject: update.subject === undefined ? bank.subject : update.subject,
  };
  await context.env.DB.prepare(
    "UPDATE user_banks SET name = ?, exam = ?, subject = ?, updated_at = ? WHERE id = ? AND owner_id = ?",
  )
    .bind(next.name, next.exam, next.subject, Date.now(), bank.id, user.id)
    .run();
  return Response.json({
    bank: toSummary({ ...bank, ...next, updated_at: Date.now() }),
  });
}

/**
 * `DELETE /api/banks/:id`: the bank and its questions. The questions go first by hand, so the
 * cleanup doesn't depend on the database enforcing the cascade.
 */
export async function deleteBank(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bank = await ownedBank(context.env, decodeURIComponent(context.params[0] ?? ""), user.id);
  await context.env.DB.batch([
    // Imports first, so nothing outlives the bank they were staged for.
    context.env.DB.prepare(
      "DELETE FROM user_bank_import_rows WHERE import_id IN (SELECT id FROM user_bank_imports WHERE bank_id = ?)",
    ).bind(bank.id),
    context.env.DB.prepare("DELETE FROM user_bank_imports WHERE bank_id = ?").bind(bank.id),
    context.env.DB.prepare("DELETE FROM user_bank_questions WHERE bank_id = ?").bind(bank.id),
    context.env.DB.prepare("DELETE FROM user_banks WHERE id = ? AND owner_id = ?").bind(
      bank.id,
      user.id,
    ),
  ]);
  return Response.json({ ok: true });
}

/** The question body a bank accepts: the shipped bank's shape, without a topic or level. */
const questionSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, "The question can’t be empty.")
    .max(BANK_PROMPT_MAX, `The question can be up to ${BANK_PROMPT_MAX} characters.`),
  choices: z
    .array(
      z
        .string()
        .trim()
        .min(1, "An answer can’t be empty.")
        .max(BANK_CHOICE_MAX, `An answer can be up to ${BANK_CHOICE_MAX} characters.`),
    )
    .length(4, "There must be four answers."),
  explanation: z
    .string()
    .trim()
    .min(1, "The explanation can’t be empty.")
    .max(BANK_EXPLANATION_MAX, `The explanation can be up to ${BANK_EXPLANATION_MAX} characters.`),
  reference: z
    .string()
    .trim()
    .max(BANK_REFERENCE_MAX, `The reference can be up to ${BANK_REFERENCE_MAX} characters.`)
    .nullable()
    .transform((value) => (value ? value : null)),
});

type QuestionInput = z.infer<typeof questionSchema>;

/** A bank question as the quality checks see it: no topic, so no category-specific rules. */
const asStored = (
  input: Pick<QuestionInput, "prompt" | "choices" | "explanation" | "reference">,
  id = "",
): StoredQuestion => ({
  id,
  category: "general-knowledge",
  topic: "Bank",
  difficulty: "easy",
  prompt: input.prompt,
  choices: input.choices,
  explanation: input.explanation,
  ...(input.reference ? { reference: input.reference } : {}),
});

/**
 * The quality checks the shipped bank passes in CI, plus the bank's own duplicate check,
 * phrased for the person who just typed the question.
 */
function problems(input: QuestionInput, siblings: readonly StoredQuestion[]): string[] {
  const found = plainProblems(asStored(input));
  const same = findDuplicate(asStored(input), siblings);
  if (same) found.push(`You already have a question that asks this: “${same.prompt}”`);
  return found;
}

/** The bank's other questions, as the duplicate check sees them. */
async function siblingsOf(env: Env, bankId: string, exceptId: string): Promise<StoredQuestion[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, prompt, choices FROM user_bank_questions WHERE bank_id = ? AND id != ?",
  )
    .bind(bankId, exceptId)
    .all<Pick<QuestionRow, "id" | "prompt" | "choices">>();
  return results.map((row) => ({
    id: row.id,
    category: "general-knowledge",
    topic: "Bank",
    difficulty: "easy",
    prompt: row.prompt,
    choices: JSON.parse(row.choices) as string[],
    explanation: "",
  }));
}

/** `POST /api/banks/:id/questions`: a new question at the end of the bank. */
export async function addBankQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bank = await ownedBank(context.env, decodeURIComponent(context.params[0] ?? ""), user.id);
  const input = await readBody<QuestionInput>(context, questionSchema, "invalid_question");

  const { n } = (await context.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM user_bank_questions WHERE bank_id = ?",
  )
    .bind(bank.id)
    .first<{ n: number }>())!;
  if (n >= MAX_QUESTIONS_PER_BANK) {
    throw new HttpError(
      400,
      "bank_full",
      `A bank can hold up to ${MAX_QUESTIONS_PER_BANK} questions.`,
    );
  }
  const found = problems(input, await siblingsOf(context.env, bank.id, ""));
  if (found.length > 0) throw new HttpError(400, "invalid_question", found.join(" "));

  const now = Date.now();
  const id = `q_${randomToken(9)}`;
  const { position } = (await context.env.DB.prepare(
    "SELECT COALESCE(MAX(position), 0) + 1 AS position FROM user_bank_questions WHERE bank_id = ?",
  )
    .bind(bank.id)
    .first<{ position: number }>())!;
  const row: QuestionRow = {
    id,
    bank_id: bank.id,
    position,
    prompt: input.prompt,
    choices: JSON.stringify(input.choices),
    explanation: input.explanation,
    reference: input.reference,
    created_at: now,
    updated_at: now,
  };
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO user_bank_questions
           (id, bank_id, position, prompt, choices, explanation, reference, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.id,
      row.bank_id,
      row.position,
      row.prompt,
      row.choices,
      row.explanation,
      row.reference,
      now,
      now,
    ),
    // Touch the bank, so the list's "recently updated" order follows edits too.
    context.env.DB.prepare("UPDATE user_banks SET updated_at = ? WHERE id = ?").bind(now, bank.id),
  ]);
  return Response.json({ question: toQuestion(row) }, { status: 201 });
}

/** The signed-in user's question in their own bank, or a 404 either way. */
async function ownedQuestion(
  env: Env,
  bankId: string,
  questionId: string,
  ownerId: string,
): Promise<QuestionRow> {
  await ownedBank(env, bankId, ownerId);
  const row = await env.DB.prepare("SELECT * FROM user_bank_questions WHERE id = ? AND bank_id = ?")
    .bind(questionId, bankId)
    .first<QuestionRow>();
  if (!row) throw new HttpError(404, "not_found", "That question doesn’t exist.");
  return row;
}

/** `PATCH /api/banks/:id/questions/:qid`: new wording, in place. */
export async function updateBankQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const existing = await ownedQuestion(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  const input = await readBody<QuestionInput>(context, questionSchema, "invalid_question");
  const found = problems(input, await siblingsOf(context.env, bankId, existing.id));
  if (found.length > 0) throw new HttpError(400, "invalid_question", found.join(" "));

  const now = Date.now();
  const row: QuestionRow = {
    ...existing,
    prompt: input.prompt,
    choices: JSON.stringify(input.choices),
    explanation: input.explanation,
    reference: input.reference,
    updated_at: now,
  };
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE user_bank_questions
            SET prompt = ?, choices = ?, explanation = ?, reference = ?, updated_at = ?
          WHERE id = ? AND bank_id = ?`,
    ).bind(row.prompt, row.choices, row.explanation, row.reference, now, existing.id, bankId),
    context.env.DB.prepare("UPDATE user_banks SET updated_at = ? WHERE id = ?").bind(now, bankId),
  ]);
  return Response.json({ question: toQuestion(row) });
}

/** `DELETE /api/banks/:id/questions/:qid`: take one question out. */
export async function deleteBankQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const existing = await ownedQuestion(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM user_bank_questions WHERE id = ? AND bank_id = ?").bind(
      existing.id,
      bankId,
    ),
    context.env.DB.prepare("UPDATE user_banks SET updated_at = ? WHERE id = ?").bind(now, bankId),
  ]);
  return Response.json({ ok: true });
}

/** The signed-in player's banks with their questions, for the account's data export. */
export async function exportBanks(
  env: Env,
  userId: string,
): Promise<{ questionBanks: PlayerBankDetail[] }> {
  const banks = (
    await env.DB.prepare(
      `SELECT b.id, b.name, b.exam, b.subject, b.created_at, b.updated_at,
              (SELECT COUNT(*) FROM user_bank_questions q WHERE q.bank_id = b.id) AS question_count
         FROM user_banks b WHERE b.owner_id = ? ORDER BY b.created_at`,
    )
      .bind(userId)
      .all<BankRow & { question_count: number }>()
  ).results;
  const questions = (
    await env.DB.prepare(
      `SELECT q.* FROM user_bank_questions q
         JOIN user_banks b ON b.id = q.bank_id
        WHERE b.owner_id = ? ORDER BY q.bank_id, q.position`,
    )
      .bind(userId)
      .all<QuestionRow>()
  ).results;
  return {
    questionBanks: banks.map((row) => ({
      ...toSummary(row),
      questions: questions.filter((q) => q.bank_id === row.id).map(toQuestion),
    })),
  };
}

/** Deleting an account takes its banks, their questions and their staged imports with it. */
export function deleteBankStatements(db: D1Database, userId: string) {
  return [
    db
      .prepare(
        "DELETE FROM user_bank_import_rows WHERE import_id IN (SELECT id FROM user_bank_imports WHERE owner_id = ?)",
      )
      .bind(userId),
    db.prepare("DELETE FROM user_bank_imports WHERE owner_id = ?").bind(userId),
    db
      .prepare(
        "DELETE FROM user_bank_questions WHERE bank_id IN (SELECT id FROM user_banks WHERE owner_id = ?)",
      )
      .bind(userId),
    db.prepare("DELETE FROM user_banks WHERE owner_id = ?").bind(userId),
  ];
}
