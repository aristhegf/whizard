import { randomToken } from "@whizard/game-core";
import {
  AI_BATCH_SIZE,
  BANK_CHOICE_MAX,
  BANK_EXPLANATION_MAX,
  BANK_PROMPT_MAX,
  BANK_REFERENCE_MAX,
  IMPORT_MAX_BYTES,
  IMPORT_TTL_MS,
  MAX_IMPORT_ROWS,
  MAX_QUESTIONS_PER_BANK,
  bankImportPatchSchema,
  bankImportSchema,
  type BankImportCounts,
  type BankImportPatch,
  type BankImportRow,
  type PlayerBankImport,
} from "@whizard/protocol";
import type { z } from "zod";
import { parseCsvLines } from "./adminImport";
import { ownedBank, withinWriteLimit } from "./banks";
import { requireUser } from "./account";
import type { Env } from "./env";
import { AiBusyError, answerBatch, type BatchQuestion } from "./gemini";
import { HttpError, requireSameOrigin, type RequestContext } from "./http";

/**
 * CSV import and export for a player's own bank. The file is staged into `user_bank_imports`
 * for review: rows with an answer key are ready straight away, rows without one wait for the
 * AI (one Gemini call per request, in bounded batches) or for the owner to pick. Nothing
 * reaches the bank until they confirm, and then all of it lands in one D1 batch — or none of
 * it does. Every lookup is scoped to the owner, like the rest of the bank's routes.
 */

interface ImportRowRecord {
  import_id: string;
  idx: number;
  row_number: number;
  prompt: string;
  choices: string;
  answer_index: number | null;
  explanation: string;
  reference: string | null;
  source: string;
  review: string;
  ai_explanation: string;
}

interface ImportRecord {
  id: string;
  owner_id: string;
  bank_id: string;
  total: number;
  created_at: number;
  expires_at: number;
}

// Reading the file ---------------------------------------------------------------------------------

/** The columns a bank import CSV uses, and what each one may hold. */
const IMPORT_COLUMNS = [
  "question",
  "option1",
  "option2",
  "option3",
  "option4",
  "answer",
  "explanation",
  "reference",
] as const;

/** A header cell as its column key: "Option 1" and "option_1" are one column. */
function csvKey(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** The import column a header cell names; null when the cell is nothing we asked for. */
function importColumn(key: string): string | null {
  if ((IMPORT_COLUMNS as readonly string[]).includes(key)) return key;
  if (key === "prompt") return "question";
  if (/^choice_[1-4]$/.test(key)) return `option${key.slice(-1)}`;
  if (key === "correct_answer") return "answer";
  return null;
}

/** One row as the upload classified it, before it's staged. */
interface ParsedRow {
  row: number;
  /** Its place among the file's kept rows, from 0 — what the staged row will be keyed by. */
  idx: number;
  prompt: string;
  choices: string[];
  answerText: string;
  answerIndex: number | null;
  explanation: string;
  reference: string | null;
  source: "key" | "none";
  review: string;
}

/** A row the file couldn't hold, with the words to show next to its line number. */
interface InvalidRow {
  row: number;
  message: string;
}

/** Which of a row's options the answer names: the letter A–D, or the option's exact text. */
function resolveAnswer(
  answer: string,
  choices: string[],
): { index: number; ambiguous?: boolean } | null {
  const clean = answer.trim();
  if (!clean) return null;
  const letter = /^[A-Da-d]$/.exec(clean);
  if (letter) return { index: letter[0]!.toUpperCase().charCodeAt(0) - 65 };
  const matches = choices
    .map((choice, i) => (choice.trim() === clean ? i : -1))
    .filter((i) => i >= 0);
  if (matches.length === 1) return { index: matches[0]! };
  if (matches.length > 1) return { index: -1, ambiguous: true };
  return null;
}

/**
 * Splits an import file into rows the bank can hold and notes on the ones it can't. The header
 * must carry the template's columns; a row is refused only for what's wrong with that row, so
 * one bad line never costs somebody the whole file.
 */
export function parseBankCsv(text: string): { rows: ParsedRow[]; invalid: InvalidRow[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = parseCsvLines(clean);
  if (lines.length === 0) throw new HttpError(400, "invalid_import", "That file is empty.");
  const header = lines[0]!.cells.map(csvKey).map(importColumn);
  const missing = ["question", "option1", "option2", "option3", "option4"].filter(
    (column) => !header.includes(column),
  );
  if (missing.length > 0) {
    throw new HttpError(
      400,
      "invalid_import",
      `That CSV needs a header row with these columns: ${IMPORT_COLUMNS.join(", ")}.`,
    );
  }

  const rows: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];
  const seenPrompts = new Set<string>();
  for (const line of lines.slice(1)) {
    if (line.cells.every((cell) => cell.trim() === "")) continue;
    const cells: Record<string, string> = {};
    header.forEach((column, i) => {
      if (column) cells[column] = (line.cells[i] ?? "").trim();
    });
    const row: ParsedRow = {
      row: line.row,
      idx: rows.length,
      prompt: cells.question ?? "",
      choices: [1, 2, 3, 4].map((n) => cells[`option${n}`] ?? ""),
      answerText: cells.answer ?? "",
      answerIndex: null,
      explanation: cells.explanation ?? "",
      reference: cells.reference || null,
      source: "none",
      review: "",
    };
    const problem = rowProblem(row, seenPrompts);
    if (problem) {
      invalid.push({ row: line.row, message: problem });
      continue;
    }
    seenPrompts.add(row.prompt.trim().toLowerCase());
    rows.push(row);
  }
  return { rows, invalid };
}

/** What's wrong with a row, empty when it's one the bank can hold. */
function rowProblem(row: ParsedRow, seenPrompts: ReadonlySet<string>): string {
  if (!row.prompt) return "The question can’t be empty.";
  if (row.prompt.length > BANK_PROMPT_MAX) {
    return `The question can be up to ${BANK_PROMPT_MAX} characters.`;
  }
  for (const [i, choice] of row.choices.entries()) {
    if (!choice) return `Option ${i + 1} can’t be empty.`;
    if (choice.length > BANK_CHOICE_MAX) {
      return `Option ${i + 1} can be up to ${BANK_CHOICE_MAX} characters.`;
    }
  }
  if (new Set(row.choices).size < 4) return "The four options must all be different.";
  if (row.explanation.length > BANK_EXPLANATION_MAX) {
    return `The explanation can be up to ${BANK_EXPLANATION_MAX} characters.`;
  }
  if (row.reference && row.reference.length > BANK_REFERENCE_MAX) {
    return `The reference can be up to ${BANK_REFERENCE_MAX} characters.`;
  }
  if (seenPrompts.has(row.prompt.trim().toLowerCase())) {
    return "This question was asked earlier in the file.";
  }
  return "";
}

/** Where a row's answer stands once the file's key (or lack of one) is taken into account. */
function classifyAnswer(row: ParsedRow): void {
  if (!row.answerText.trim()) {
    row.review = "No answer key in this row — the AI can suggest one, or you can pick.";
    return;
  }
  const resolved = resolveAnswer(row.answerText, row.choices);
  if (resolved?.ambiguous) {
    row.review = "The answer matches more than one option. Pick one yourself.";
    return;
  }
  if (resolved) {
    row.answerIndex = resolved.index;
    row.source = "key";
    return;
  }
  row.review = "The answer doesn’t match any option. Pick one yourself.";
}

/** The bank's "correct first" shape: the answered option moved to the front, rest in order. */
function normalizedChoices(choices: string[], answerIndex: number): string[] {
  const copy = [...choices];
  const [answer] = copy.splice(answerIndex, 1);
  return [answer!, ...copy];
}

// The staged import itself ------------------------------------------------------------------------

async function rowsOf(env: Env, importId: string): Promise<ImportRowRecord[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM user_bank_import_rows WHERE import_id = ? ORDER BY idx",
  )
    .bind(importId)
    .all<ImportRowRecord>();
  return results;
}

/** What the review screen shows: counts, and the rows those counts are about. */
function toPayload(
  record: ImportRecord,
  rows: readonly ImportRowRecord[],
  invalid?: { count: number; notes: InvalidRow[] },
): PlayerBankImport {
  const view = rows.map((row): BankImportRow => ({
    idx: row.idx,
    row: row.row_number,
    prompt: row.prompt,
    choices: JSON.parse(row.choices) as string[],
    answerIndex: row.answer_index,
    explanation: row.explanation,
    reference: row.reference,
    source: row.source as BankImportRow["source"],
    review: row.review,
    aiExplanation: row.ai_explanation,
  }));
  const counts: BankImportCounts = {
    total: rows.length,
    ready: view.filter((row) => row.answerIndex !== null && !row.review).length,
    withKey: view.filter((row) => row.source === "key").length,
    aiAnswered: view.filter((row) => row.source === "ai").length,
    needsReview: view.filter((row) => row.answerIndex === null || !!row.review).length,
    pending: view.filter((row) => row.answerIndex === null).length,
  };
  const payload: PlayerBankImport = {
    id: record.id,
    bankId: record.bank_id,
    counts,
    flagged: view.filter((row) => row.answerIndex === null || !!row.review),
  };
  if (invalid) payload.invalid = { count: invalid.count, notes: invalid.notes.slice(0, 25) };
  return payload;
}

/**
 * The signed-in user's unfinished import, or a 404 — missing, somebody else's, or past its
 * time. Expired imports are cleaned up on the way out, so a forgotten draft doesn't linger.
 */
async function ownedImport(
  env: Env,
  bankId: string,
  importId: string,
  ownerId: string,
): Promise<ImportRecord> {
  const row = await env.DB.prepare(
    "SELECT * FROM user_bank_imports WHERE id = ? AND bank_id = ? AND owner_id = ?",
  )
    .bind(importId, bankId, ownerId)
    .first<ImportRecord>();
  if (!row) throw new HttpError(404, "not_found", "That import doesn’t exist.");
  if (row.expires_at <= Date.now()) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM user_bank_import_rows WHERE import_id = ?").bind(row.id),
      env.DB.prepare("DELETE FROM user_bank_imports WHERE id = ?").bind(row.id),
    ]);
    throw new HttpError(404, "import_expired", "That import has expired. Start it again.");
  }
  return row;
}

// The endpoints -----------------------------------------------------------------------------------

/** Reads a JSON body under the import size cap, with the form's own validation wording. */
async function readImportBody<T>(
  context: RequestContext,
  schema: z.ZodType<T>,
  code: string,
): Promise<T> {
  const text = await context.request.text();
  if (text.length > IMPORT_MAX_BYTES + 2048) {
    throw new HttpError(413, "invalid_import", "That file is too big for one import.");
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, code, "That wasn’t valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, code, parsed.error.issues[0]?.message ?? "Check what you sent.");
  }
  return parsed.data;
}

/** The bank this import's route names, for the owner or a 404. */
function bankOf(context: RequestContext, user: { id: string }) {
  return ownedBank(context.env, decodeURIComponent(context.params[0] ?? ""), user.id);
}

/**
 * `POST /api/banks/:id/imports` with `{ csv }`: stage the file for review. One draft per bank —
 * starting again replaces whatever was there, so there's never a question of which import the
 * owner is working on.
 */
export async function startImport(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bank = await bankOf(context, user);
  const input = await readImportBody(context, bankImportSchema, "invalid_import");

  const { rows, invalid } = parseBankCsv(input.csv);
  if (rows.length === 0) {
    throw new HttpError(
      400,
      "invalid_import",
      "That file has no questions the bank can take." +
        (invalid.length > 0 ? ` (${invalid.length} rows need fixing.)` : ""),
    );
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new HttpError(
      400,
      "invalid_import",
      `That file has ${rows.length} questions. Import up to ${MAX_IMPORT_ROWS} at a time.`,
    );
  }

  const { n: existing } = (await context.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM user_bank_questions WHERE bank_id = ?",
  )
    .bind(bank.id)
    .first<{ n: number }>())!;
  if (existing + rows.length > MAX_QUESTIONS_PER_BANK) {
    throw new HttpError(
      400,
      "import_too_large",
      `This bank can hold ${MAX_QUESTIONS_PER_BANK} questions and already has ${existing}. ` +
        `That file has ${rows.length}.`,
    );
  }

  const { results: stale } = await context.env.DB.prepare(
    "SELECT id FROM user_bank_imports WHERE bank_id = ? AND owner_id = ?",
  )
    .bind(bank.id, user.id)
    .all<{ id: string }>();

  rows.forEach((row) => classifyAnswer(row));

  const now = Date.now();
  const id = `imp_${randomToken(9)}`;
  const record: ImportRecord = {
    id,
    owner_id: user.id,
    bank_id: bank.id,
    total: rows.length,
    created_at: now,
    expires_at: now + IMPORT_TTL_MS,
  };
  await context.env.DB.batch([
    ...stale.map((old) =>
      context.env.DB.prepare("DELETE FROM user_bank_import_rows WHERE import_id = ?").bind(old.id),
    ),
    ...stale.map((old) =>
      context.env.DB.prepare("DELETE FROM user_bank_imports WHERE id = ?").bind(old.id),
    ),
    context.env.DB.prepare(
      `INSERT INTO user_bank_imports (id, owner_id, bank_id, total, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, record.owner_id, record.bank_id, record.total, now, record.expires_at),
    ...rows.map((row) =>
      context.env.DB.prepare(
        `INSERT INTO user_bank_import_rows
           (import_id, idx, row_number, prompt, choices, answer_index, explanation, reference,
            source, review, ai_explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
      ).bind(
        id,
        row.idx,
        row.row,
        row.prompt,
        JSON.stringify(row.choices),
        row.answerIndex,
        row.explanation,
        row.reference,
        row.source,
        row.review,
      ),
    ),
  ]);
  const records: ImportRowRecord[] = rows.map((row) => ({
    import_id: id,
    idx: row.idx,
    row_number: row.row,
    prompt: row.prompt,
    choices: JSON.stringify(row.choices),
    answer_index: row.answerIndex,
    explanation: row.explanation,
    reference: row.reference,
    source: row.source,
    review: row.review,
    ai_explanation: "",
  }));
  const payload = toPayload(record, records, { count: invalid.length, notes: invalid });
  return Response.json({ import: payload }, { status: 201 });
}

/** `GET /api/banks/:id/imports`: the latest draft for this bank, or null when there's none. */
export async function latestImport(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const bank = await bankOf(context, user);
  const record = await context.env.DB.prepare(
    `SELECT * FROM user_bank_imports
      WHERE bank_id = ? AND owner_id = ? AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(bank.id, user.id, Date.now())
    .first<ImportRecord>();
  if (!record) return Response.json({ import: null });
  const payload = toPayload(record, await rowsOf(context.env, record.id));
  return Response.json({ import: payload }, { headers: { "Cache-Control": "no-store" } });
}

/** `GET /api/banks/:id/imports/:impId`: resume a draft mid-review. */
export async function getImport(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const record = await ownedImport(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  const payload = toPayload(record, await rowsOf(context.env, record.id));
  return Response.json({ import: payload }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * `POST /api/banks/:id/imports/:impId/answers`: answer the next batch of key-less rows with
 * the AI — one Gemini call for this request. The web app loops until nothing is left; a busy
 * key comes back as 429 to try again, and a broken one flags the batch for a person rather
 * than losing it.
 */
export async function processImportAnswers(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const record = await ownedImport(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  if (!context.env.GEMINI_API_KEY) {
    throw new HttpError(
      503,
      "ai_not_configured",
      "AI answers aren’t set up on this server yet. Give every question an answer yourself.",
    );
  }

  const all = await rowsOf(context.env, record.id);
  const batch = all.filter((row) => row.answer_index === null).slice(0, AI_BATCH_SIZE);
  if (batch.length === 0) {
    return Response.json({ import: toPayload(record, all) });
  }

  const questions: BatchQuestion[] = batch.map((row) => ({
    id: `q${row.idx}`,
    prompt: row.prompt,
    choices: JSON.parse(row.choices) as string[],
  }));
  let answers: Map<
    string,
    { answerIndex: number | null; explanation: string; reviewNeeded: boolean }
  >;
  try {
    answers = await answerBatch(context.env, questions);
  } catch (error) {
    if (error instanceof AiBusyError) {
      throw new HttpError(429, "ai_busy", "The answer service is busy. Trying again shortly.");
    }
    // The provider failed; flag the batch, keeping every row, so a retry can still happen.
    const failed = batch.map((row) => ({
      ...row,
      review: "The AI couldn’t answer this one. Pick an answer yourself.",
    }));
    await context.env.DB.batch(
      failed.map((row) =>
        context.env.DB.prepare(
          "UPDATE user_bank_import_rows SET review = ? WHERE import_id = ? AND idx = ?",
        ).bind(row.review, record.id, row.idx),
      ),
    );
    const next = all.map((row) => failed.find((f) => f.idx === row.idx) ?? row);
    return Response.json({ import: toPayload(record, next) });
  }

  const updates: ImportRowRecord[] = batch.map((row) => {
    const answer = answers.get(`q${row.idx}`);
    const usable =
      answer && answer.answerIndex !== null && answer.answerIndex >= 0 && answer.answerIndex <= 3;
    if (!usable || !answer) {
      return {
        ...row,
        review: answer?.reviewNeeded
          ? "The AI wasn’t sure about this one. Pick an answer yourself."
          : "The AI couldn’t answer this one. Pick an answer yourself.",
        ai_explanation: (answer?.explanation ?? "").slice(0, BANK_EXPLANATION_MAX),
      };
    }
    const aiExplanation = answer.explanation.slice(0, BANK_EXPLANATION_MAX);
    return {
      ...row,
      answer_index: answer.answerIndex,
      source: "ai",
      review: answer.reviewNeeded ? "The AI wasn’t sure — double-check this one." : "",
      ai_explanation: aiExplanation,
      // The file's own explanation wins; the AI's fills the gap when there wasn't one.
      explanation: row.explanation || aiExplanation || "Answered by AI.",
    };
  });
  await context.env.DB.batch(
    updates.map((row) =>
      context.env.DB.prepare(
        `UPDATE user_bank_import_rows
            SET answer_index = ?, source = ?, review = ?, ai_explanation = ?, explanation = ?
          WHERE import_id = ? AND idx = ?`,
      ).bind(
        row.answer_index,
        row.source,
        row.review,
        row.ai_explanation,
        row.explanation,
        record.id,
        row.idx,
      ),
    ),
  );
  const next = all.map((row) => updates.find((u) => u.idx === row.idx) ?? row);
  return Response.json({ import: toPayload(record, next) });
}

/** `PATCH /api/banks/:id/imports/:impId/rows`: accept the AI's flagged answers, fix rows by hand. */
export async function patchImportRows(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const record = await ownedImport(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  const input = await readImportBody<BankImportPatch>(
    context,
    bankImportPatchSchema,
    "invalid_import",
  );
  const all = await rowsOf(context.env, record.id);
  const byIdx = new Map(all.map((row) => [row.idx, row]));
  const updates = new Map<number, ImportRowRecord>();

  if (input.acceptAi) {
    for (const row of all) {
      if (row.source === "ai" && row.review) updates.set(row.idx, { ...row, review: "" });
    }
  }
  for (const change of input.set ?? []) {
    const row = byIdx.get(change.idx);
    if (!row) {
      throw new HttpError(
        400,
        "invalid_import",
        `There’s no row ${change.idx + 1} in this import.`,
      );
    }
    const explanation = change.explanation !== undefined ? change.explanation : row.explanation;
    if (!explanation.trim()) {
      throw new HttpError(
        400,
        "invalid_import",
        `Row ${row.row_number} needs a short explanation with its answer.`,
      );
    }
    updates.set(row.idx, {
      ...row,
      answer_index: change.answerIndex,
      source: "manual",
      review: "",
      explanation,
    });
  }
  const changed = [...updates.values()];
  if (changed.length > 0) {
    await context.env.DB.batch(
      changed.map((row) =>
        context.env.DB.prepare(
          `UPDATE user_bank_import_rows
              SET answer_index = ?, source = ?, review = ?, explanation = ?
            WHERE import_id = ? AND idx = ?`,
        ).bind(row.answer_index, row.source, row.review, row.explanation, record.id, row.idx),
      ),
    );
  }
  const next = all.map((row) => updates.get(row.idx) ?? row);
  return Response.json({ import: toPayload(record, next) });
}

/**
 * `POST /api/banks/:id/imports/:impId/commit`: put the whole staged import into the bank —
 * questions, in file order, in one D1 batch, with the draft deleted in that same batch. Either
 * all of it lands or none of it does.
 */
export async function commitImport(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const record = await ownedImport(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  const rows = await rowsOf(context.env, record.id);
  const counts = toPayload(record, rows).counts;
  if (counts.pending > 0 || counts.needsReview > 0) {
    throw new HttpError(
      400,
      "import_unready",
      counts.pending > 0
        ? `${counts.pending} questions still need an answer.`
        : `${counts.needsReview} questions still need review.`,
    );
  }

  const now = Date.now();
  const { position: start } = (await context.env.DB.prepare(
    "SELECT COALESCE(MAX(position), 0) AS position FROM user_bank_questions WHERE bank_id = ?",
  )
    .bind(bankId)
    .first<{ position: number }>())!;
  const inserts = rows.map((row, i) => {
    const choices = JSON.parse(row.choices) as string[];
    const answerIndex = row.answer_index ?? 0;
    return context.env.DB.prepare(
      `INSERT INTO user_bank_questions
         (id, bank_id, position, prompt, choices, explanation, reference, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `q_${randomToken(9)}`,
      bankId,
      start + i + 1,
      row.prompt,
      JSON.stringify(normalizedChoices(choices, answerIndex)),
      row.explanation,
      row.reference,
      now,
      now,
    );
  });
  await context.env.DB.batch([
    ...inserts,
    context.env.DB.prepare("UPDATE user_banks SET updated_at = ? WHERE id = ?").bind(now, bankId),
    context.env.DB.prepare("DELETE FROM user_bank_import_rows WHERE import_id = ?").bind(record.id),
    context.env.DB.prepare("DELETE FROM user_bank_imports WHERE id = ?").bind(record.id),
  ]);
  return Response.json({ ok: true, added: rows.length });
}

/** `DELETE /api/banks/:id/imports/:impId`: throw the draft away without touching the bank. */
export async function discardImport(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await withinWriteLimit(context);
  const bankId = decodeURIComponent(context.params[0] ?? "");
  const record = await ownedImport(
    context.env,
    bankId,
    decodeURIComponent(context.params[1] ?? ""),
    user.id,
  );
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM user_bank_import_rows WHERE import_id = ?").bind(record.id),
    context.env.DB.prepare("DELETE FROM user_bank_imports WHERE id = ?").bind(record.id),
  ]);
  return Response.json({ ok: true });
}

// Export -----------------------------------------------------------------------------------------

/** One CSV cell, quoted the way spreadsheets expect when it must be. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * `GET /api/banks/:id/export`: the bank as a CSV the same importer can read back — question,
 * the four options with the correct one first, the answer spelled out, explanation, reference.
 */
export async function exportBankCsv(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const bank = await bankOf(context, user);
  const { results } = await context.env.DB.prepare(
    "SELECT prompt, choices, explanation, reference FROM user_bank_questions WHERE bank_id = ? ORDER BY position",
  )
    .bind(bank.id)
    .all<{ prompt: string; choices: string; explanation: string; reference: string | null }>();
  const lines = [IMPORT_COLUMNS.join(",")];
  for (const row of results) {
    const choices = JSON.parse(row.choices) as string[];
    lines.push(
      [
        csvCell(row.prompt),
        csvCell(choices[0] ?? ""),
        csvCell(choices[1] ?? ""),
        csvCell(choices[2] ?? ""),
        csvCell(choices[3] ?? ""),
        csvCell(choices[0] ?? ""),
        csvCell(row.explanation),
        csvCell(row.reference ?? ""),
      ].join(","),
    );
  }
  const filename = `whizard-${bank.id}.csv`;
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
