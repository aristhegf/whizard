import { findQuestion, questionVersion } from "@whizard/content";
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

/** How many different people have to report a question before it's taken out of play. */
export const RETIRE_AFTER_REPORTS = 3;

/** `POST /api/questions/:id/report` with `{ reason, guestId? }`. */
export async function reportQuestion(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { env, request, params } = context;
  if (!(await withinLimit(env.REPORT_LIMIT, request))) {
    return jsonError(429, "too_many_reports", "That’s a lot of reports. Try again in a minute.");
  }
  const question = findQuestion(decodeURIComponent(params[0] ?? ""));
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

/**
 * Questions in a category taken out of play: enough different people reported their current
 * wording, and nobody has checked and kept it. A failure returns none, so games still start.
 */
export async function retiredQuestions(env: Env, category: string): Promise<Set<string>> {
  const retired = new Set<string>();
  try {
    const { results } = await env.DB.prepare(
      `SELECT r.question_id, r.version FROM question_reports r
        WHERE r.category = ?
          AND NOT EXISTS (
            SELECT 1 FROM question_kept k
             WHERE k.question_id = r.question_id AND k.version = r.version
          )
        GROUP BY r.question_id, r.version
       HAVING COUNT(*) >= ?`,
    )
      .bind(category, RETIRE_AFTER_REPORTS)
      .all<{ question_id: string; version: string }>();
    for (const row of results) {
      const question = findQuestion(row.question_id);
      if (question && questionVersion(question) === row.version) retired.add(row.question_id);
    }
  } catch (error) {
    console.error("Couldn’t load reported questions", error);
  }
  return retired;
}
