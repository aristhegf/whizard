import {
  CHOICE_MAX,
  EXPLANATION_MAX,
  findDuplicate,
  PROMPT_MAX,
  problemsWith,
  questionVersion,
  repeatsAcrossCategories,
  type StoredQuestion,
} from "@whizard/content";
import { QUIZ_CATEGORIES, QUIZ_DIFFICULTIES } from "@whizard/game-core";
import {
  QUESTION_FILTERS,
  QUESTION_SORTS,
  type AdminQuestion,
  type AdminQuestionDetail,
  type AdminQuestionList,
  type AdminQuestionsSummary,
  type QuestionFilter,
  type QuestionInput,
  type QuestionSort,
  type QuestionStats,
} from "@whizard/protocol";
import { z } from "zod";
import { logAdmin, requireAdmin } from "./admin";
import { forgetBank, loadBank, shippedQuestion, type Bank } from "./bank";
import type { Env } from "./env";
import { HttpError, requireSameOrigin, type RequestContext } from "./http";
import { outOfPlay, type OutOfPlay } from "./reports";

/** A question needs this many answers before it's called hard or easy. */
const MIN_ANSWERS = 5;
/** And this many before its level is questioned. */
const LEVEL_CHECK_ANSWERS = 10;
const RANKED = 6;
const PAGE = 50;

interface Everything {
  bank: Bank;
  out: Map<string, OutOfPlay>;
  stats: Map<string, QuestionStats>;
  reports: Map<string, number>;
}

/** The merged bank, with what's out of play, answer numbers and reports for current wordings. */
async function loadEverything(env: Env): Promise<Everything> {
  const bank = await loadBank(env);
  const db = env.DB;
  const [out, [stats, picks, reports]] = await Promise.all([
    outOfPlay(env, bank),
    db.batch<Record<string, string | number>>([
      db.prepare("SELECT * FROM question_stats"),
      db.prepare("SELECT * FROM question_wrong_picks ORDER BY picks DESC"),
      db.prepare(
        "SELECT question_id, version, COUNT(*) AS n FROM question_reports GROUP BY question_id, version",
      ),
    ]),
  ]);
  const versions = new Map<string, string>();
  const versionOf = (id: string) => {
    if (!versions.has(id)) {
      const q = bank.find(id);
      versions.set(id, q ? questionVersion(q) : "");
    }
    return versions.get(id)!;
  };
  const current = (row: Record<string, unknown>) =>
    versionOf(String(row.question_id)) === String(row.version);

  const byId = new Map<string, QuestionStats>();
  for (const row of (stats?.results ?? []).filter(current)) {
    byId.set(String(row.question_id), {
      answered: Number(row.answered),
      correct: Number(row.correct),
      timedOut: Number(row.timed_out),
      wrongPicks: [],
    });
  }
  for (const row of (picks?.results ?? []).filter(current)) {
    const entry = byId.get(String(row.question_id));
    if (entry && entry.wrongPicks.length < 3) {
      entry.wrongPicks.push({ choice: String(row.choice), picks: Number(row.picks) });
    }
  }
  const reportCounts = new Map<string, number>();
  for (const row of (reports?.results ?? []).filter(current)) {
    reportCounts.set(String(row.question_id), Number(row.n));
  }
  return { bank, out, stats: byId, reports: reportCounts };
}

function toAdmin(q: StoredQuestion, all: Everything): AdminQuestion {
  return {
    id: q.id,
    category: q.category,
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    choices: [...q.choices],
    explanation: q.explanation,
    reference: q.reference ?? null,
    origin: all.bank.origin(q.id),
    play: all.out.get(q.id) ?? "in_play",
    reports: all.reports.get(q.id) ?? 0,
    stats: all.stats.get(q.id) ?? null,
  };
}

const rightShare = (q: AdminQuestion) =>
  q.stats && q.stats.answered + q.stats.timedOut > 0
    ? q.stats.correct / (q.stats.answered + q.stats.timedOut)
    : null;
const answers = (q: AdminQuestion) => (q.stats ? q.stats.answered + q.stats.timedOut : 0);

/** A level that fits how often players get it right, if it isn't the one it has. */
export function suggestedLevel(level: string, share: number): string | null {
  if (level === "easy" && share < 0.4) return "medium";
  if (level === "medium" && share > 0.9) return "easy";
  if (level === "medium" && share < 0.25) return "hard";
  if (level === "hard" && share > 0.85) return "medium";
  return null;
}

/** `GET /api/admin/questions/summary`: the bank by topic and level, and how questions play. */
export async function getQuestionsSummary(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const all = await loadEverything(context.env);
  const questions = all.bank.questions.map((q) => toAdmin(q, all));
  const inPlay = questions.filter((q) => q.play === "in_play");
  const ranked = inPlay.filter((q) => answers(q) >= MIN_ANSWERS);
  const byShare = [...ranked].sort(
    (a, b) => rightShare(a)! - rightShare(b)! || answers(b) - answers(a),
  );

  const body: AdminQuestionsSummary = {
    totals: {
      inPlay: inPlay.length,
      added: questions.filter((q) => q.origin === "added").length,
      edited: questions.filter((q) => q.origin === "edited").length,
      outOfPlay: questions.length - inPlay.length,
      answers: questions.reduce((sum, q) => sum + answers(q), 0),
    },
    coverage: QUIZ_CATEGORIES.map((c) => {
      const mine = inPlay.filter((q) => q.category === c.id);
      const n = (level: string) => mine.filter((q) => q.difficulty === level).length;
      return { category: c.id, easy: n("easy"), medium: n("medium"), hard: n("hard") };
    }),
    // Kept apart, so a question with few answers can't be in both lists.
    hardest: byShare.filter((q) => rightShare(q)! < 0.5).slice(0, RANKED),
    easiest: byShare
      .filter((q) => rightShare(q)! >= 0.75)
      .reverse()
      .slice(0, RANKED),
    levelCheck: inPlay
      .filter((q) => answers(q) >= LEVEL_CHECK_ANSWERS)
      .flatMap((q) => {
        const suggested = suggestedLevel(q.difficulty, rightShare(q)!);
        return suggested ? [{ ...q, suggested }] : [];
      })
      .sort((a, b) => answers(b) - answers(a))
      .slice(0, RANKED),
    minAnswers: MIN_ANSWERS,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

const pick = <T extends string>(options: readonly T[], value: string | null, fallback: T): T =>
  (options as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

/** `GET /api/admin/questions?category=&difficulty=&q=&filter=&sort=&offset=` */
export async function listQuestions(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { url } = context;
  const category = url.searchParams.get("category") ?? "";
  const difficulty = url.searchParams.get("difficulty") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const filter = pick<QuestionFilter>(QUESTION_FILTERS, url.searchParams.get("filter"), "all");
  const sort = pick<QuestionSort>(QUESTION_SORTS, url.searchParams.get("sort"), "id");
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const all = await loadEverything(context.env);
  const matching = all.bank.questions
    .map((question) => toAdmin(question, all))
    .filter(
      (x) =>
        (!category || x.category === category) &&
        (!difficulty || x.difficulty === difficulty) &&
        (filter === "all" || (filter === "out" ? x.play !== "in_play" : x.origin === filter)) &&
        (!q ||
          x.id.includes(q) ||
          x.prompt.toLowerCase().includes(q) ||
          x.choices.some((c) => c.toLowerCase().includes(q)) ||
          x.topic.toLowerCase().includes(q)),
    );
  const sorted =
    sort === "played"
      ? matching.sort((a, b) => answers(b) - answers(a))
      : sort === "hardest"
        ? matching.sort((a, b) => (rightShare(a) ?? 2) - (rightShare(b) ?? 2))
        : matching.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

  const body: AdminQuestionList = {
    questions: sorted.slice(offset, offset + PAGE),
    total: sorted.length,
    more: sorted.length > offset + PAGE,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

function inputOf(q: StoredQuestion): QuestionInput {
  return {
    topic: q.topic,
    difficulty: q.difficulty,
    prompt: q.prompt,
    choices: [...q.choices],
    explanation: q.explanation,
    reference: q.reference ?? null,
  };
}

/** `GET /api/admin/questions/:id` */
export async function getQuestion(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const all = await loadEverything(context.env);
  const question = all.bank.find(decodeURIComponent(context.params[0] ?? ""));
  if (!question) throw new HttpError(404, "not_found", "That question doesn’t exist.");
  const shipped = shippedQuestion(question.id);
  const body: AdminQuestionDetail = {
    ...toAdmin(question, all),
    original: all.bank.origin(question.id) === "edited" && shipped ? inputOf(shipped) : null,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} can’t be empty.`)
    .max(max, `${label} can be up to ${max} characters.`);

const inputSchema = z.object({
  topic: text("The sub-topic", 40),
  difficulty: z.enum(QUIZ_DIFFICULTIES, "Pick a level."),
  prompt: text("The question", PROMPT_MAX),
  choices: z.array(text("Each answer", CHOICE_MAX)).length(4, "There must be four answers."),
  explanation: text("The explanation", EXPLANATION_MAX),
  reference: z
    .string()
    .trim()
    .max(60, "The reference can be up to 60 characters.")
    .nullable()
    .transform((v) => (v ? v : null)),
});

const newSchema = inputSchema.extend({
  category: z.enum(QUIZ_CATEGORIES.map((c) => c.id) as [string, ...string[]], "Pick a topic."),
});

async function readInput<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "bad_request", "That wasn’t valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_question", parsed.error.issues[0]?.message ?? "Check it.");
  }
  return parsed.data;
}

/** The checks the schema can't express, with plain messages the forms show. */
export function plainProblems(question: StoredQuestion): string[] {
  return problemsWith(question).map((p) =>
    p === "choices are not all different"
      ? "The four answers must all be different."
      : p === "a choice is empty"
        ? "An answer can’t be empty."
        : p === "the answer appears in the prompt"
          ? "The answer gives itself away in the question."
          : p === "Bible questions need a verse reference"
            ? "Bible questions need a verse reference, e.g. John 3:16."
            : p === "Quran questions need a reference"
              ? "Quran questions need a reference, e.g. Al-Baqarah 2:255."
              : p,
  );
}

/** The checks the shipped bank passes in CI, with plain messages. */
function problems(question: StoredQuestion, bank: Bank): string[] {
  const found = plainProblems(question);
  const others = bank.questions.filter((q) => q.id !== question.id);
  const same = findDuplicate(question, others);
  if (same) found.push(`It asks the same thing as ${same.id}: “${same.prompt}”`);
  const elsewhere = others.find((q) => repeatsAcrossCategories(question, q));
  if (elsewhere) found.push(`Another topic already asks this, in ${elsewhere.id}.`);
  return found;
}

/** A statement that puts an admin's own question in `custom_questions`. */
export function insertQuestion(
  db: D1Database,
  question: StoredQuestion,
  userId: string,
  now: number,
) {
  return db
    .prepare(
      `INSERT INTO custom_questions (id, category, topic, difficulty, prompt, choices,
                                     explanation, reference, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         topic = excluded.topic, difficulty = excluded.difficulty,
         prompt = excluded.prompt, choices = excluded.choices,
         explanation = excluded.explanation, reference = excluded.reference,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(
      question.id,
      question.category,
      question.topic,
      question.difficulty,
      question.prompt,
      JSON.stringify(question.choices),
      question.explanation,
      question.reference ?? null,
      now,
      now,
      userId,
    );
}

/** A question's place in its category's numbering: 511 for `bible-511`, or null if none. */
function sequenceNumber(question: StoredQuestion): number | null {
  const prefix = `${question.category}-`;
  if (!question.id.startsWith(prefix)) return null;
  const tail = question.id.slice(prefix.length);
  return /^\d+$/.test(tail) ? Number(tail) : null;
}

/**
 * Hands out ids that continue the bank's own numbering instead of restarting it: the next id
 * for a category and level is the first free number after the last question of that same
 * category and level, skipping numbers other levels already use — so an import joins the
 * sequence at `bible-511`, `bible-512`, … whatever ids the file carries. Each call takes the
 * next one, so a batch numbers itself in order.
 */
export function idAllocator(
  questions: readonly StoredQuestion[],
): (category: string, difficulty: string) => string {
  const used = new Map<string, Set<number>>();
  const after = new Map<string, number>();
  for (const question of questions) {
    const n = sequenceNumber(question);
    if (n === null) continue;
    const numbers = used.get(question.category) ?? new Set<number>();
    numbers.add(n);
    used.set(question.category, numbers);
    const level = `${question.category}|${question.difficulty}`;
    after.set(level, Math.max(after.get(level) ?? 1, n + 1));
  }
  return (category, difficulty) => {
    const numbers = used.get(category) ?? new Set<number>();
    used.set(category, numbers);
    const level = `${category}|${difficulty}`;
    let n = after.get(level) ?? 1;
    while (numbers.has(n)) n++;
    after.set(level, n + 1);
    numbers.add(n);
    return `${category}-${String(n).padStart(3, "0")}`;
  };
}

async function save(
  context: RequestContext,
  question: StoredQuestion,
  userId: string,
  created: boolean,
): Promise<Response> {
  const { env } = context;
  forgetBank();
  const bank = await loadBank(env);
  const found = problems(question, bank);
  if (found.length > 0) throw new HttpError(400, "invalid_question", found.join(" "));
  const now = Date.now();
  const shipped = shippedQuestion(question.id);
  const db = env.DB;
  // Saving a shipped question back to how it ships just removes the edit.
  const same = shipped && JSON.stringify(inputOf(shipped)) === JSON.stringify(inputOf(question));
  await db.batch([
    same
      ? db.prepare("DELETE FROM custom_questions WHERE id = ?").bind(question.id)
      : insertQuestion(db, question, userId, now),
    logAdmin(db, userId, created ? "question:add" : "question:edit", question.id),
  ]);
  forgetBank();
  return Response.json({ ok: true, id: question.id });
}

/** `PATCH /api/admin/questions/:id`: new wording for a question. Its category stays. */
export async function updateQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const existing = (await loadBank(context.env)).find(decodeURIComponent(context.params[0] ?? ""));
  if (!existing) throw new HttpError(404, "not_found", "That question doesn’t exist.");
  const { reference, ...input } = await readInput(context.request, inputSchema);
  const question: StoredQuestion = {
    ...input,
    id: existing.id,
    category: existing.category,
    ...(reference ? { reference } : {}),
  };
  return save(context, question, user.id, false);
}

/** `POST /api/admin/questions`: a new question. */
export async function addQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const input = await readInput(context.request, newSchema);
  const bank = await loadBank(context.env);
  const id = idAllocator(bank.questions)(input.category, input.difficulty);
  const { reference, category, ...rest } = input;
  const question: StoredQuestion = {
    ...rest,
    id,
    category: category as StoredQuestion["category"],
    ...(reference ? { reference } : {}),
  };
  return save(context, question, user.id, true);
}

/**
 * `DELETE /api/admin/questions/:id`: undoes an edit, putting the shipped wording back, or
 * deletes a question an admin added.
 */
export async function revertQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env, params } = context;
  const id = decodeURIComponent(params[0] ?? "");
  const origin = (await loadBank(env)).origin(id);
  if (origin === "bank")
    throw new HttpError(400, "not_custom", "That question hasn’t been edited.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM custom_questions WHERE id = ?").bind(id),
    logAdmin(env.DB, user.id, origin === "edited" ? "question:revert" : "question:delete", id),
  ]);
  forgetBank();
  return Response.json({ ok: true });
}
