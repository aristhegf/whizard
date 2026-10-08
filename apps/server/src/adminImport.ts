import {
  CHOICE_MAX,
  EXPLANATION_MAX,
  PROMPT_MAX,
  findDuplicate,
  normalize,
  repeatsAcrossCategories,
  type StoredQuestion,
} from "@whizard/content";
import { QUIZ_CATEGORIES, QUIZ_DIFFICULTIES } from "@whizard/game-core";
import type { ImportNote, QuestionImportResult } from "@whizard/protocol";
import { logAdmin, requireAdmin } from "./admin";
import { idAllocator, insertQuestion, plainProblems } from "./adminQuestions";
import { forgetBank, loadBank } from "./bank";
import { HttpError, requireSameOrigin, type RequestContext } from "./http";

/** How many questions one import may carry. */
export const IMPORT_MAX_ROWS = 1000;
/** And how big the file behind them may be: a thousand questions is a few hundred KB. */
const IMPORT_MAX_BYTES = 1024 * 1024;

/** The CSV header for the bank's own row shape, which is also what a JSON file uses. */
const STORED_COLUMNS = [
  "category",
  "topic",
  "difficulty",
  "prompt",
  "choice_1",
  "choice_2",
  "choice_3",
  "choice_4",
  "explanation",
];

/** The CSV header for flat rows, whose `topic` is the category and `question` the prompt. */
const FLAT_COLUMNS = [
  "topic",
  "sub_topic",
  "question",
  "correct_answer",
  "wrong_answer_1",
  "wrong_answer_2",
  "wrong_answer_3",
  "explanation",
];

/** One row of an import file, with its place in the file for the messages. */
export interface ImportRow {
  row: number;
  data: unknown;
}

// Reading the file ---------------------------------------------------------------------------------

/** One line of a CSV file, with the line's number so messages can point at it. */
interface CsvLine {
  row: number;
  cells: string[];
}

/**
 * Splits a CSV file into lines of cells, the way spreadsheets write it: quotes protect commas
 * and newlines, a doubled quote is one quote, and line endings may be anything.
 */
export function parseCsvLines(text: string): CsvLine[] {
  const clean = text.replace(/\r\n?/g, "\n");
  const lines: CsvLine[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let atStart = true;
  let row = 1;
  const endLine = () => {
    cells.push(cell);
    lines.push({ row, cells });
    cells = [];
    cell = "";
    atStart = true;
    row++;
  };
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
      atStart = true;
    } else if (char === "\n") {
      endLine();
    } else {
      cell += char;
      atStart = false;
    }
  }
  // The last line, unless the file ended with a newline.
  if (cells.length > 0 || cell !== "") endLine();
  return lines;
}

/** A header cell as its column key: "Choice 1" and "choice_1" are one column. */
function csvKey(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * The rows of a JSON or CSV question file: the bank's own row shape (`prompt`, `choices`, …) or
 * the flat one (`question`, `correct_answer`, …). Row numbers run from 1 — the question's place
 * in a JSON array, or the CSV's line, where the header is line 1 so numbers match the sheet.
 * A file that isn't a question file at all throws a 400 saying what a file should look like.
 */
export function parseImportText(text: string, filename: string): ImportRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const name = filename.toLowerCase();
  const json = name.endsWith(".json") || (!name.endsWith(".csv") && /^\s*\[/.test(clean));
  if (!json) return parseCsvRows(clean);
  let data: unknown;
  try {
    data = JSON.parse(clean);
  } catch {
    throw new HttpError(400, "invalid_import", "That file isn’t valid JSON.");
  }
  if (!Array.isArray(data)) {
    throw new HttpError(400, "invalid_import", "That JSON should be an array of questions.");
  }
  return data.map((item, i) => ({ row: i + 1, data: item }));
}

/** A CSV keyed by its header row, blank lines skipped. */
function parseCsvRows(text: string): ImportRow[] {
  const lines = parseCsvLines(text);
  if (lines.length === 0) throw new HttpError(400, "invalid_import", "That file is empty.");
  const header = lines[0]!.cells.map(csvKey);
  const stored = header.includes("prompt");
  const required = stored ? STORED_COLUMNS : header.includes("question") ? FLAT_COLUMNS : null;
  if (!required) {
    throw new HttpError(
      400,
      "invalid_import",
      `That CSV needs a header row with these columns: ${STORED_COLUMNS.join(", ")}.`,
    );
  }
  const missing = required.filter((key) => !header.includes(key));
  if (missing.length > 0) {
    throw new HttpError(
      400,
      "invalid_import",
      `That CSV needs these columns: ${missing.join(", ")}.`,
    );
  }
  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    if (line.cells.every((cell) => cell.trim() === "")) continue;
    const data: Record<string, unknown> = {};
    header.forEach((key, i) => {
      data[key] = line.cells[i] ?? "";
    });
    if (stored) data.choices = [data.choice_1, data.choice_2, data.choice_3, data.choice_4];
    rows.push({ row: line.row, data });
  }
  return rows;
}

// Checking the rows ---------------------------------------------------------------------------------

/** One cell of a row as text: numbers count, anything that isn't a value doesn't. */
function cell(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** What's wrong with one field, empty when it's fine. The words the single-question form uses. */
function fieldProblem(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null) return `${label} can’t be empty.`;
  const raw = cell(value);
  if (raw === null) return `${label} must be text.`;
  if (raw === "") return `${label} can’t be empty.`;
  if (raw.length > max) return `${label} can be up to ${max} characters.`;
  return "";
}

/**
 * A row renamed onto the bank's fields. The bank's own shape has `prompt` and `choices`; the
 * flat shape spells those out as `question`, `correct_answer` and `wrong_answer_1` to `3`.
 * A file's `id` is left out: ids are assigned while planning the import.
 */
function canonicalRow(row: Record<string, unknown>): Record<string, unknown> {
  if ("prompt" in row || "choices" in row) return row;
  return {
    category: row.topic,
    difficulty: row.level,
    topic: row.sub_topic,
    prompt: row.question,
    choices: [row.correct_answer, row.wrong_answer_1, row.wrong_answer_2, row.wrong_answer_3],
    explanation: row.explanation,
    reference: row.verse_reference,
  };
}

/**
 * Maps one row of an import file onto a question ready to store, or says what's wrong with it.
 * The checks and the wording are the ones the single-question editor runs.
 */
export function rowToQuestion(data: unknown): { question: StoredQuestion } | { error: string } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { error: "Not a question: each row must be an object." };
  }
  const row = canonicalRow(data as Record<string, unknown>);
  const choices = Array.isArray(row.choices) ? row.choices : null;
  if (!choices || choices.length !== 4) return { error: "There must be four answers." };
  const fields: [unknown, string, number][] = [
    [row.category, "The topic", 40],
    [row.topic, "The sub-topic", 40],
    [row.prompt, "The question", PROMPT_MAX],
    [choices[0], "The first answer", CHOICE_MAX],
    [choices[1], "The second answer", CHOICE_MAX],
    [choices[2], "The third answer", CHOICE_MAX],
    [choices[3], "The fourth answer", CHOICE_MAX],
    [row.explanation, "The explanation", EXPLANATION_MAX],
  ];
  for (const [value, label, max] of fields) {
    const wrong = fieldProblem(value, label, max);
    if (wrong) return { error: wrong };
  }
  const topic = cell(row.category)!;
  const category = categoryOf(topic);
  if (!category) {
    return {
      error: `Unknown topic “${topic}”. Topics are: ${QUIZ_CATEGORIES.map((c) => c.name).join(", ")}.`,
    };
  }
  const level = cell(row.difficulty) ?? "";
  const difficulty = levelOf(level);
  if (!difficulty) return { error: `Unknown level “${level}”. Use Easy, Medium or Hard.` };
  const reference = cell(row.reference) ?? "";
  if (reference.length > 60) return { error: "The reference can be up to 60 characters." };
  const question: StoredQuestion = {
    // Filled in by planImport, continuing the category's numbering.
    id: "",
    category: category as StoredQuestion["category"],
    topic: cell(row.topic)!,
    difficulty: difficulty as StoredQuestion["difficulty"],
    prompt: cell(row.prompt)!,
    choices: choices.map((choice) => cell(choice)!),
    explanation: cell(row.explanation)!,
    ...(reference ? { reference } : {}),
  };
  const wrong = plainProblems(question);
  if (wrong.length > 0) return { error: wrong.join(" ") };
  return { question };
}

/** The category a file's topic means: "Bible", "bible" and "BIBLE" are all bible. */
export function categoryOf(value: string): string | null {
  const key = normalize(value);
  return (
    QUIZ_CATEGORIES.find((c) => normalize(c.id) === key || normalize(c.name) === key)?.id ?? null
  );
}

/** The level a file's difficulty means. Blank means Easy, as the single-question form starts. */
export function levelOf(value: string): string | null {
  if (!value) return "easy";
  const key = value.trim().toLowerCase();
  return (QUIZ_DIFFICULTIES as readonly string[]).includes(key) ? key : null;
}

// Planning the import -------------------------------------------------------------------------------

interface Entry {
  question: StoredQuestion;
  prompt: string;
  answer: string;
}

const entryOf = (question: StoredQuestion): Entry => ({
  question,
  prompt: normalize(question.prompt),
  answer: normalize(question.choices[0]!),
});

export interface ImportPlan {
  /** Questions ready to store, numbered where each topic's and level's sequence left off. */
  add: StoredQuestion[];
  skipped: ImportNote[];
  errors: ImportNote[];
}

/**
 * Works out what an import can take: new questions, rows the bank or an earlier row already
 * asks (skipped, so one repeat doesn't hold up the rest of the file), and rows to fix. New
 * questions get ids that continue the bank's own numbering; the file's ids are not used.
 */
export function planImport(
  rows: readonly ImportRow[],
  existing: readonly StoredQuestion[],
): ImportPlan {
  const add: StoredQuestion[] = [];
  const skipped: ImportNote[] = [];
  const errors: ImportNote[] = [];
  const pool = existing.map(entryOf);
  const nextId = idAllocator(existing);
  for (const { row, data } of rows) {
    const built = rowToQuestion(data);
    if ("error" in built) {
      errors.push({ row, message: built.error });
      continue;
    }
    const question = built.question;
    const prompt = normalize(question.prompt);
    const answer = normalize(question.choices[0]!);
    // Pairs sharing neither a prompt nor an answer can't be duplicates, so only those need
    // the full checks the bank's own tests run.
    const near = pool.filter((e) => e.prompt === prompt || e.answer === answer);
    const same = findDuplicate(
      question,
      near.map((e) => e.question).filter((q) => q.category === question.category),
    );
    if (same) {
      skipped.push({ row, message: `Already asked as ${same.id}.` });
      continue;
    }
    const elsewhere = near
      .map((e) => e.question)
      .find((q) => q.category !== question.category && repeatsAcrossCategories(question, q));
    if (elsewhere) {
      skipped.push({ row, message: `Another topic already asks this, in ${elsewhere.id}.` });
      continue;
    }
    question.id = nextId(question.category, question.difficulty);
    add.push(question);
    pool.push(entryOf(question));
  }
  return { add, skipped, errors };
}

// The endpoint ----------------------------------------------------------------------------------------

/** `POST /api/admin/questions/import`: questions from a JSON or CSV file, checked row by row. */
export async function importQuestions(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { request, env } = context;
  let payload: { filename?: unknown; text?: unknown };
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "bad_request", "That wasn’t valid JSON.");
  }
  if (typeof payload.text !== "string") {
    throw new HttpError(400, "bad_request", "The file’s text is missing.");
  }
  if (payload.text.length > IMPORT_MAX_BYTES) {
    throw new HttpError(413, "invalid_import", "That file is too big for one import.");
  }
  const filename = typeof payload.filename === "string" ? payload.filename : "";
  const rows = parseImportText(payload.text, filename);
  if (rows.length === 0) {
    throw new HttpError(400, "invalid_import", "That file has no questions in it.");
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new HttpError(
      400,
      "invalid_import",
      `That file has ${rows.length} questions. Import up to ${IMPORT_MAX_ROWS} at a time.`,
    );
  }

  forgetBank();
  const bank = await loadBank(env);
  const { add, skipped, errors } = planImport(rows, bank.questions);
  if (add.length > 0) {
    const db = env.DB;
    const now = Date.now();
    await db.batch([
      ...add.map((question) => insertQuestion(db, question, user.id, now)),
      logAdmin(db, user.id, "question:import", logTarget(add)),
    ]);
    forgetBank();
  }
  const body: QuestionImportResult = { added: add.length, skipped, errors };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** "50 questions (Bible)" for the activity log, so one import is one line. */
function logTarget(added: readonly StoredQuestion[]): string {
  const topics = [
    ...new Set(
      added.map((q) => QUIZ_CATEGORIES.find((c) => c.id === q.category)?.name ?? q.category),
    ),
  ];
  return `${added.length} ${added.length === 1 ? "question" : "questions"} (${topics.join(", ")})`;
}
