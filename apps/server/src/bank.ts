import {
  QUESTIONS,
  questionVersion,
  storedQuestionSchema,
  type StoredQuestion,
} from "@whizard/content";
import type { ItemResult } from "@whizard/game-core";
import type { Env } from "./env";

/** Where a question comes from: the bank that ships, an admin's edit of one, or an admin's own. */
export type QuestionOrigin = "bank" | "edited" | "added";

export interface Bank {
  questions: readonly StoredQuestion[];
  find(id: string): StoredQuestion | undefined;
  origin(id: string): QuestionOrigin;
}

const SHIPPED = new Map(QUESTIONS.map((q) => [q.id, q]));

export function shippedQuestion(id: string): StoredQuestion | undefined {
  return SHIPPED.get(id);
}

/** How long a Worker reuses the admin edits it loaded. Changes reach new games within this. */
const CACHE_MS = 15_000;
let cached: { at: number; rows: StoredQuestion[] } | null = null;

export function forgetBank() {
  cached = null;
}

interface CustomRow {
  id: string;
  category: string;
  topic: string;
  difficulty: string;
  prompt: string;
  choices: string;
  explanation: string;
  reference: string | null;
}

export function fromRow(row: CustomRow): StoredQuestion | null {
  const parsed = storedQuestionSchema.safeParse({
    id: row.id,
    category: row.category,
    topic: row.topic,
    difficulty: row.difficulty,
    prompt: row.prompt,
    choices: JSON.parse(row.choices) as unknown,
    explanation: row.explanation,
    ...(row.reference ? { reference: row.reference } : {}),
  });
  return parsed.success ? parsed.data : null;
}

async function customQuestions(env: Env, now: number): Promise<StoredQuestion[]> {
  if (cached && now - cached.at < CACHE_MS) return cached.rows;
  const { results } = await env.DB.prepare("SELECT * FROM custom_questions").all<CustomRow>();
  const rows = results.flatMap((r) => fromRow(r) ?? []);
  cached = { at: now, rows };
  return rows;
}

/**
 * The questions games draw from: the shipped bank with admins' edits and additions applied. If
 * the database can't be reached, games still get the shipped bank.
 */
export async function loadBank(env: Env, now = Date.now()): Promise<Bank> {
  let custom: StoredQuestion[] = [];
  try {
    custom = await customQuestions(env, now);
  } catch (error) {
    console.error("Couldn’t load edited questions", error);
  }
  if (custom.length === 0) {
    return { questions: QUESTIONS, find: (id) => SHIPPED.get(id), origin: () => "bank" };
  }
  const byId = new Map(SHIPPED);
  for (const q of custom) byId.set(q.id, q);
  const customIds = new Set(custom.map((q) => q.id));
  return {
    questions: [...byId.values()],
    find: (id) => byId.get(id),
    origin: (id) => (!customIds.has(id) ? "bank" : SHIPPED.has(id) ? "edited" : "added"),
  };
}

/**
 * Adds a finished game's answers to each question's numbers, for its current wording. A failure
 * is logged and never breaks the game.
 */
export async function recordQuestionStats(env: Env, items: readonly ItemResult[]) {
  if (items.length === 0) return;
  try {
    const bank = await loadBank(env);
    const db = env.DB;
    const statements = items.flatMap((item) => {
      const question = bank.find(item.id);
      if (!question || item.answered + item.timedOut === 0) return [];
      const version = questionVersion(question);
      return [
        db
          .prepare(
            `INSERT INTO question_stats (question_id, version, answered, correct, timed_out)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (question_id, version) DO UPDATE SET
               answered = answered + excluded.answered,
               correct = correct + excluded.correct,
               timed_out = timed_out + excluded.timed_out`,
          )
          .bind(item.id, version, item.answered, item.correct, item.timedOut),
        ...Object.entries(item.wrongPicks).map(([choice, picks]) =>
          db
            .prepare(
              `INSERT INTO question_wrong_picks (question_id, version, choice, picks)
               VALUES (?, ?, ?, ?)
               ON CONFLICT (question_id, version, choice) DO UPDATE SET
                 picks = picks + excluded.picks`,
            )
            .bind(item.id, version, choice.slice(0, 80), picks),
        ),
      ];
    });
    if (statements.length > 0) await db.batch(statements);
  } catch (error) {
    console.error("Couldn’t record question stats", error);
  }
}
