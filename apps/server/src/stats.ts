import { STATS_RANGES, type SiteStats, type StatsEntry, type StatsRange } from "@whizard/protocol";
import { dayOf } from "./analytics";
import type { RequestContext } from "./http";

/** The stats are the same for everyone, so they're worked out at most this often. */
const CACHE_SECONDS = 120;
const TOP = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseRange(value: string | null): StatsRange {
  const n = Number(value);
  return (STATS_RANGES as readonly number[]).includes(n) ? (n as StatsRange) : 30;
}

/** The days of the range, oldest first, ending today (UTC). */
export function rangeDays(range: StatsRange, now: number): string[] {
  return Array.from({ length: range }, (_, i) => dayOf(now - (range - 1 - i) * DAY_MS));
}

/** Splits `prefix:name` rows into the top entries for each prefix. */
export function groupBreakdown(rows: { metric: string; total: number }[]) {
  const groups = new Map<string, StatsEntry[]>();
  for (const { metric, total } of rows) {
    const at = metric.indexOf(":");
    if (at < 0) continue;
    const prefix = metric.slice(0, at);
    const list = groups.get(prefix) ?? [];
    list.push({ name: metric.slice(at + 1), count: total });
    groups.set(prefix, list);
  }
  const top = (prefix: string) =>
    (groups.get(prefix) ?? []).sort((a, b) => b.count - a.count).slice(0, TOP);
  return { top, all: (prefix: string) => groups.get(prefix) ?? [] };
}

export async function buildStats(
  db: D1Database,
  range: StatsRange,
  now: number,
): Promise<SiteStats> {
  const days = rangeDays(range, now);
  const since = days[0]!;
  const [visitors, daily, breakdown] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT COUNT(*) AS n FROM visitor_people WHERE last_day >= ?").bind(since),
    db
      .prepare(
        `SELECT day, metric, count FROM daily_counts
          WHERE day >= ? AND instr(metric, ':') = 0`,
      )
      .bind(since),
    db
      .prepare(
        `SELECT metric, SUM(count) AS total FROM daily_counts
          WHERE day >= ? AND instr(metric, ':') > 0 GROUP BY metric`,
      )
      .bind(since),
  ]);

  const byDay = new Map<string, Record<string, number>>();
  const sums: Record<string, number> = {};
  for (const row of (daily?.results ?? []) as { day: string; metric: string; count: number }[]) {
    const entry = byDay.get(row.day) ?? {};
    entry[row.metric] = row.count;
    byDay.set(row.day, entry);
    sums[row.metric] = (sums[row.metric] ?? 0) + row.count;
  }
  const groups = groupBreakdown((breakdown?.results ?? []) as { metric: string; total: number }[]);
  const sum = (metric: string) => sums[metric] ?? 0;

  return {
    range,
    totals: {
      visitors: Number((visitors?.results?.[0] as { n?: number } | undefined)?.n ?? 0),
      visits: sum("visits"),
      pageViews: groups.all("page").reduce((total, p) => total + p.count, 0),
      roomsCreated: sum("rooms_created"),
      gamesPlayed: sum("games_started"),
      players: sum("game_players"),
      averageVisitSeconds:
        sum("visits_ended") > 0 ? Math.round(sum("visit_seconds") / sum("visits_ended")) : null,
    },
    days: days.map((day) => ({
      day,
      visitors: byDay.get(day)?.visitors_active ?? 0,
      games: byDay.get(day)?.games_started ?? 0,
    })),
    pages: groups.top("page"),
    sources: groups.top("source"),
    countries: groups.top("country"),
    devices: groups.top("device"),
    topics: groups.top("topic"),
    modes: groups.top("mode"),
  };
}

/** `GET /api/stats?range=7|30|90`: the public stats page's numbers. */
export async function getSiteStats({ env, url, ctx }: RequestContext): Promise<Response> {
  const range = parseRange(url.searchParams.get("range"));
  const cacheKey = new Request(`${url.origin}/api/stats?range=${range}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const stats = await buildStats(env.DB, range, Date.now());
  const response = Response.json(stats, {
    headers: { "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
