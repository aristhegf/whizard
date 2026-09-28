import { findQuestion, questionVersion } from "@whizard/content";
import {
  REPORT_ACTIONS,
  STATS_RANGES,
  type ActivityItem,
  type AdminOverview,
  type ReportAction,
  type ReportedQuestion,
  type StatsEntry,
  type StatsRange,
} from "@whizard/protocol";
import { z } from "zod";
import { requireUser } from "./account";
import { dayOf } from "./analytics";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { RETIRE_AFTER_REPORTS } from "./reports";
import type { SignedIn } from "./sessions";
import { groupBreakdown, rangeDays } from "./stats";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 5;

/**
 * Only accounts marked as admin (by the "Admins" workflow in GitHub Actions) get past this.
 * Every admin endpoint calls it, so hiding the page is never what keeps the data safe.
 */
export async function requireAdmin(context: RequestContext): Promise<SignedIn> {
  const session = await requireUser(context);
  if (session.user.is_admin !== 1) throw new HttpError(403, "not_admin", "Admins only.");
  return session;
}

/** An admin's action, for the record. */
export function logAdmin(db: D1Database, userId: string, action: string, target: string) {
  return db
    .prepare("INSERT INTO admin_log (at, user_id, action, target) VALUES (?, ?, ?, ?)")
    .bind(Date.now(), userId, action, target);
}

export function parseRange(value: string | null): StatsRange {
  const n = Number(value);
  return (STATS_RANGES as readonly number[]).includes(n) ? (n as StatsRange) : 30;
}

export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);
/** A share that can't pass 100%, e.g. while one count started being recorded before another. */
const share = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : null);

function totals(rows: { day: string; metric: string; count: number }[], from: string, to: string) {
  const sums: Record<string, number> = {};
  for (const row of rows) {
    if (row.day < from || row.day > to) continue;
    sums[row.metric] = (sums[row.metric] ?? 0) + row.count;
  }
  return (metric: string) => sums[metric] ?? 0;
}

// Overview ------------------------------------------------------------------------------------

/** `GET /api/admin/overview?range=7|30|90`: everything on the dashboard. */
export async function getAdminOverview(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { env, url } = context;
  const db = env.DB;
  const now = Date.now();
  const range = parseRange(url.searchParams.get("range"));
  const days = rangeDays(range, now);
  const since = days[0]!;
  const today = days[days.length - 1]!;
  const prevSince = dayOf(now - (2 * range - 1) * DAY_MS);
  const prevUntil = dayOf(now - range * DAY_MS);

  const firstDays = `SELECT viewer, MIN(day) AS first FROM player_days GROUP BY viewer`;
  const retention = (n: number) =>
    db
      .prepare(
        `SELECT COUNT(*) AS cohort,
                SUM(EXISTS (SELECT 1 FROM player_days q
                             WHERE q.viewer = c.viewer AND q.day > c.first
                               AND q.day <= date(c.first, '+${n} day'))) AS kept
           FROM (${firstDays}) c
          WHERE c.first >= ? AND c.first <= date(?, '-${n} day')`,
      )
      .bind(since, today);

  const [metrics, players, prevPlayers, newPlayers, returning, prevReturning, d1, d7, d30] =
    await db.batch<Record<string, number | string | null>>([
      db.prepare("SELECT day, metric, count FROM daily_counts WHERE day >= ?").bind(prevSince),
      db.prepare("SELECT COUNT(DISTINCT viewer) AS n FROM player_days WHERE day >= ?").bind(since),
      db
        .prepare("SELECT COUNT(DISTINCT viewer) AS n FROM player_days WHERE day >= ? AND day <= ?")
        .bind(prevSince, prevUntil),
      db
        .prepare(
          `SELECT SUM(first >= ?1) AS now, SUM(first >= ?2 AND first <= ?3) AS before
             FROM (${firstDays})`,
        )
        .bind(since, prevSince, prevUntil),
      db
        .prepare(
          `SELECT COUNT(DISTINCT p.viewer) AS n FROM player_days p
            WHERE p.day >= ?1
              AND EXISTS (SELECT 1 FROM player_days q WHERE q.viewer = p.viewer AND q.day < p.day)`,
        )
        .bind(since),
      db
        .prepare(
          `SELECT COUNT(DISTINCT p.viewer) AS n FROM player_days p
            WHERE p.day >= ?1 AND p.day <= ?2
              AND EXISTS (SELECT 1 FROM player_days q WHERE q.viewer = p.viewer AND q.day < p.day)`,
        )
        .bind(prevSince, prevUntil),
      retention(1),
      retention(7),
      retention(30),
    ]);

  const rows = (metrics?.results ?? []) as { day: string; metric: string; count: number }[];
  const cur = totals(rows, since, today);
  const prev = totals(rows, prevSince, prevUntil);
  const n = (result: typeof players, key = "n") =>
    Number((result?.results?.[0] as Record<string, unknown> | undefined)?.[key] ?? 0);
  const rate = (result: typeof d1) => {
    const row = result?.results?.[0] as { cohort?: number; kept?: number } | undefined;
    return ratio(Number(row?.kept ?? 0), Number(row?.cohort ?? 0));
  };

  const inRange = rows.filter((r) => r.day >= since && r.metric.includes(":"));
  const summed = new Map<string, number>();
  for (const r of inRange) summed.set(r.metric, (summed.get(r.metric) ?? 0) + r.count);
  const groups = groupBreakdown([...summed].map(([metric, total]) => ({ metric, total })));
  const top = (prefix: string) => groups.top(prefix).slice(0, TOP);

  const countries = groups.all("country").sort((a, b) => b.count - a.count);
  const shownCountries = countries.slice(0, 4);
  const otherCountries = countries.slice(4).reduce((sum, c) => sum + c.count, 0);

  const sizes = ["2", "3-5", "6-10", "11+"];
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (r.metric === "games_finished") byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.count);
  }

  const overview: AdminOverview = {
    range,
    kpis: {
      gamesPlayed: { value: cur("games_finished"), previous: prev("games_finished") },
      uniquePlayers: { value: n(players), previous: n(prevPlayers) },
      roomsCreated: { value: cur("rooms_created"), previous: prev("rooms_created") },
      completionRate: {
        value: share(cur("games_finished"), cur("games_started")),
        previous: share(prev("games_finished"), prev("games_started")),
      },
      avgPlayersPerRoom: {
        value: ratio(cur("room_joins"), cur("rooms_created")),
        previous: ratio(prev("room_joins"), prev("rooms_created")),
      },
    },
    gamesPerDay: days.map((day) => ({ day, count: byDay.get(day) ?? 0 })),
    games: top("game"),
    topics: top("topic"),
    playersPerGame: sizes.map((size) => ({
      name: size,
      count: summed.get(`game_size:${size}`) ?? 0,
    })),
    retention: {
      newPlayers: { value: n(newPlayers, "now"), previous: n(newPlayers, "before") },
      returningPlayers: { value: n(returning), previous: n(prevReturning) },
      day1: rate(d1),
      day7: rate(d7),
      day30: rate(d30),
    },
    countries: [
      ...shownCountries,
      ...(otherCountries > 0 ? [{ name: "other", count: otherCountries }] : []),
    ] satisfies StatsEntry[],
    rooms: {
      invitesPerRoom: ratio(cur("invites"), cur("rooms_created")),
      joinRate: share(cur("rooms_shared"), cur("rooms_created")),
      rematchRate: share(cur("rematches"), cur("games_finished")),
      soloRate:
        cur("rooms_created") > 0
          ? Math.max(0, 1 - cur("rooms_shared") / cur("rooms_created"))
          : null,
    },
    openReports: (await reportedQuestions(env.DB)).filter(
      (q) => q.status === "open" || q.status === "out",
    ).length,
  };
  return Response.json(overview, { headers: { "Cache-Control": "no-store" } });
}

// Activity ------------------------------------------------------------------------------------

/** `GET /api/admin/activity`: the latest things that happened, newest first. */
export async function getAdminActivity(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { results } = await context.env.DB.prepare(
    "SELECT at, kind, detail FROM activity ORDER BY id DESC LIMIT 20",
  ).all<{ at: number; kind: ActivityItem["kind"]; detail: string }>();
  const items: ActivityItem[] = results.map((r) => ({
    at: r.at,
    kind: r.kind,
    detail: JSON.parse(r.detail) as ActivityItem["detail"],
  }));
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

// Reports -------------------------------------------------------------------------------------

/** Every reported question's current wording, with its reports and where it stands. */
export async function reportedQuestions(db: D1Database): Promise<ReportedQuestion[]> {
  const [reports, kept, retired] = await db.batch<Record<string, string | number>>([
    db.prepare(
      `SELECT question_id, version, reason, COUNT(*) AS n, MAX(created_at) AS last
         FROM question_reports GROUP BY question_id, version, reason`,
    ),
    db.prepare("SELECT question_id, version FROM question_kept"),
    db.prepare("SELECT question_id, version FROM question_retired"),
  ]);
  const key = (r: Record<string, unknown>) => `${String(r.question_id)}@${String(r.version)}`;
  const keptSet = new Set((kept?.results ?? []).map(key));
  const retiredSet = new Set((retired?.results ?? []).map(key));

  const byQuestion = new Map<string, ReportedQuestion>();
  for (const row of (reports?.results ?? []) as {
    question_id: string;
    version: string;
    reason: string;
    n: number;
    last: number;
  }[]) {
    const question = findQuestion(row.question_id);
    // Reports on older wording stopped counting when the question was edited.
    if (!question || questionVersion(question) !== row.version) continue;
    const item = byQuestion.get(row.question_id) ?? {
      questionId: question.id,
      category: question.category,
      difficulty: question.difficulty,
      prompt: question.prompt,
      answer: question.choices[0]!,
      reports: 0,
      reasons: {},
      lastReportedAt: 0,
      status: "open" as const,
    };
    item.reports += row.n;
    item.reasons[row.reason] = (item.reasons[row.reason] ?? 0) + row.n;
    item.lastReportedAt = Math.max(item.lastReportedAt, row.last);
    byQuestion.set(row.question_id, item);
  }
  for (const item of byQuestion.values()) {
    const k = `${item.questionId}@${questionVersion(findQuestion(item.questionId)!)}`;
    item.status = retiredSet.has(k)
      ? "retired"
      : keptSet.has(k)
        ? "kept"
        : item.reports >= RETIRE_AFTER_REPORTS
          ? "out"
          : "open";
  }
  return [...byQuestion.values()].sort(
    (a, b) => b.reports - a.reports || b.lastReportedAt - a.lastReportedAt,
  );
}

/** `GET /api/admin/reports` */
export async function getAdminReports(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  return Response.json(
    { questions: await reportedQuestions(context.env.DB) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const reportActionSchema = z.object({
  action: z.enum(REPORT_ACTIONS as unknown as [ReportAction, ...ReportAction[]]),
});

/**
 * `POST /api/admin/reports/:id` with `{ action }`: keep the question as it is, retire it, or
 * reopen it (undo either). Applies to its current wording, and is logged.
 */
export async function decideReport(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env, params, request } = context;
  const question = findQuestion(decodeURIComponent(params[0] ?? ""));
  if (!question) throw new HttpError(404, "not_found", "That question doesn’t exist.");
  const { action } = await readJson(request, reportActionSchema);
  const version = questionVersion(question);
  const now = Date.now();
  const db = env.DB;
  const clear = [
    db
      .prepare("DELETE FROM question_kept WHERE question_id = ? AND version = ?")
      .bind(question.id, version),
    db
      .prepare("DELETE FROM question_retired WHERE question_id = ? AND version = ?")
      .bind(question.id, version),
  ];
  const decide =
    action === "keep"
      ? [
          db
            .prepare("INSERT INTO question_kept (question_id, version, kept_at) VALUES (?, ?, ?)")
            .bind(question.id, version, now),
        ]
      : action === "retire"
        ? [
            db
              .prepare(
                "INSERT INTO question_retired (question_id, version, retired_at) VALUES (?, ?, ?)",
              )
              .bind(question.id, version, now),
          ]
        : [];
  await db.batch([...clear, ...decide, logAdmin(db, user.id, `report:${action}`, question.id)]);
  return Response.json({ ok: true });
}
