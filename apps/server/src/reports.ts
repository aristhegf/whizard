import { questionVersion } from "@whizard/content";
import { reportRequestSchema } from "@whizard/protocol";
import type { Env } from "./env";
import {
  HttpError,
  jsonError,
  readJson,
  requireSameOrigin,
  withinLimit,
  type RequestContext,
} from "./http";
import { currentSession, hasSessionCookie } from "./sessions";
import { count } from "./analytics";
import { loadBank, type Bank } from "./bank";

/** How many different people have to report a question before it's taken out of play. */
export const RETIRE_AFTER_REPORTS = 3;

/** `POST /api/questions/:id/report` with `{ reason, guestId? }`. */
export async function reportQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { env, request, params } = context;
  if (!(await withinLimit(env.REPORT_LIMIT, request))) {
    return jsonError(429, "too_many_reports", "That’s a lot of reports. Try again in a minute.");
  }
  const question = (await loadBank(env)).find(decodeURIComponent(params[0] ?? ""));
  if (!question) return jsonError(404, "not_found", "That question doesn’t exist.");
  const body = await readJson(request, reportRequestSchema);

  const session = hasSessionCookie(request) ? await currentSession(request, env, Date.now()) : null;
  const reporter = session ? `u:${session.user.id}` : body.guestId ? `g:${body.guestId}` : null;
  if (!reporter) throw new HttpError(400, "bad_request", "Couldn’t tell who sent the report.");

  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO question_reports
       (question_id, version, category, reporter, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      question.id,
      questionVersion(question),
      question.category,
      reporter,
      body.reason,
      Date.now(),
    )
    .run();
  if (result.meta.changes > 0) {
    context.ctx.waitUntil(count(env, { questions_reported: 1 }));
  }
  return Response.json({ ok: true });
}

/** Why a question is out of play: enough reports, or an admin retired it. */
export type OutOfPlay = "reported_out" | "retired";

/**
 * Questions taken out of play, for their current wording: enough different people reported
 * them and nobody checked and kept them, or an admin retired them. With a category, only that
 * category's.
 */
export async function outOfPlay(
  env: Env,
  bank: Bank,
  category?: string,
): Promise<Map<string, OutOfPlay>> {
  const out = new Map<string, OutOfPlay>();
  const current = (id: string, version: string) => {
    const question = bank.find(id);
    return (
      question !== undefined &&
      (category === undefined || question.category === category) &&
      questionVersion(question) === version
    );
  };
  const [reported, byAdmin] = await env.DB.batch<{ question_id: string; version: string }>([
    env.DB.prepare(
      `SELECT r.question_id, r.version FROM question_reports r
        WHERE (?1 IS NULL OR r.category = ?1)
          AND NOT EXISTS (
            SELECT 1 FROM question_kept k
             WHERE k.question_id = r.question_id AND k.version = r.version
          )
        GROUP BY r.question_id, r.version
       HAVING COUNT(*) >= ?2`,
    ).bind(category ?? null, RETIRE_AFTER_REPORTS),
    env.DB.prepare("SELECT question_id, version FROM question_retired"),
  ]);
  for (const row of reported?.results ?? []) {
    if (current(row.question_id, row.version)) out.set(row.question_id, "reported_out");
  }
  // An admin's decision wins over the reports.
  for (const row of byAdmin?.results ?? []) {
    if (current(row.question_id, row.version)) out.set(row.question_id, "retired");
  }
  return out;
}

/** A category's questions out of play. A failure returns none, so games still start. */
export async function retiredQuestions(
  env: Env,
  category: string,
  bank?: Bank,
): Promise<Set<string>> {
  try {
    return new Set((await outOfPlay(env, bank ?? (await loadBank(env)), category)).keys());
  } catch (error) {
    console.error("Couldn’t load reported questions", error);
    return new Set();
  }
}
