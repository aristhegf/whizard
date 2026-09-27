import type { AdminAnalytics } from "@whizard/protocol";
import { parseRange, requireAdmin } from "./admin";
import { dayOf } from "./analytics";
import type { RequestContext } from "./http";
import { buildStats, rangeDays } from "./stats";

const DAY_MS = 24 * 60 * 60 * 1000;

/** `GET /api/admin/analytics?range=7|30|90`: the visitor numbers, with the period before. */
export async function getAdminAnalytics(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { env, url } = context;
  const db = env.DB;
  const now = Date.now();
  const range = parseRange(url.searchParams.get("range"));
  const days = rangeDays(range, now);
  const since = days[0]!;
  const prevSince = dayOf(now - (2 * range - 1) * DAY_MS);
  const prevUntil = dayOf(now - range * DAY_MS);

  const [stats, [counts, returning]] = await Promise.all([
    buildStats(db, range, now),
    db.batch<Record<string, unknown>>([
      db
        .prepare(
          `SELECT day, metric, count FROM daily_counts
            WHERE day >= ?
              AND (metric IN ('visitors_new', 'visits', 'accounts_created', 'visit_seconds',
                              'visits_ended')
                   OR metric LIKE 'page:%')`,
        )
        .bind(prevSince),
      db
        .prepare("SELECT COUNT(*) AS n FROM visitor_people WHERE first_day < ?1 AND last_day >= ?1")
        .bind(since),
    ]),
  ]);

  const rows = (counts?.results ?? []) as { day: string; metric: string; count: number }[];
  // A metric ending in ":" sums its whole breakdown, e.g. "page:" for every page view.
  const matches = (metric: string, name: string) =>
    metric.endsWith(":") ? name.startsWith(metric) : name === metric;
  const sum = (metric: string, from: string, to: string) =>
    rows
      .filter((r) => r.day >= from && r.day <= to && matches(metric, r.metric))
      .reduce((total, r) => total + r.count, 0);
  const today = days[days.length - 1]!;
  const compared = (metric: string) => ({
    value: sum(metric, since, today),
    previous: sum(metric, prevSince, prevUntil),
  });
  const average = (from: string, to: string) => {
    const ended = sum("visits_ended", from, to);
    return ended > 0 ? Math.round(sum("visit_seconds", from, to) / ended) : null;
  };
  const newByDay = new Map<string, number>();
  for (const r of rows) if (r.metric === "visitors_new") newByDay.set(r.day, r.count);

  const body: AdminAnalytics = {
    stats,
    newVisitors: compared("visitors_new"),
    returningVisitors: Number((returning?.results?.[0] as { n?: number } | undefined)?.n ?? 0),
    visits: compared("visits"),
    pageViews: compared("page:"),
    accountsCreated: compared("accounts_created"),
    averageVisitSeconds: { value: average(since, today), previous: average(prevSince, prevUntil) },
    newVisitorsPerDay: days.map((day) => ({ day, count: newByDay.get(day) ?? 0 })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
