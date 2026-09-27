import type { DeviceType, PageName } from "@whizard/protocol";
import type { Env } from "./env";

/** The UTC day, as the `daily_counts` table stores it. */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Two-letter country code from Cloudflare, or null for anything unexpected. */
export function countryCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : null;
}

function addStatement(db: D1Database, day: string, metric: string, amount: number) {
  return db
    .prepare(
      `INSERT INTO daily_counts (day, metric, count) VALUES (?, ?, ?)
       ON CONFLICT (day, metric) DO UPDATE SET count = count + excluded.count`,
    )
    .bind(day, metric, amount);
}

/**
 * Adds to today's totals. Stats must never break the thing being counted, so a failed write is
 * only logged.
 */
export async function count(env: Env, metrics: Record<string, number>, now = Date.now()) {
  const day = dayOf(now);
  const statements = Object.entries(metrics)
    .filter(([, amount]) => amount > 0)
    .map(([metric, amount]) => addStatement(env.DB, day, metric, amount));
  if (statements.length === 0) return;
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Couldn’t save stats", error);
  }
}

/** Raises today's highest "here now" count if `online` beats it. */
export async function recordOnlinePeak(env: Env, online: number, now = Date.now()) {
  try {
    await env.DB.prepare(
      `INSERT INTO daily_counts (day, metric, count) VALUES (?, 'online_peak', ?)
       ON CONFLICT (day, metric) DO UPDATE SET count = MAX(count, excluded.count)`,
    )
      .bind(dayOf(now), online)
      .run();
  } catch (error) {
    console.error("Couldn’t save stats", error);
  }
}

export interface Visit {
  visitor: string;
  page: PageName;
  device: DeviceType;
  source: string | null;
  country: string | null;
  /** False for a reconnect: the visitor is still on the same page load. */
  newVisit: boolean;
}

/**
 * Records a visit. Returns true if this browser has never visited before, so the caller can
 * update its running total.
 */
export async function recordVisit(env: Env, visit: Visit, now = Date.now()): Promise<boolean> {
  const day = dayOf(now);
  try {
    // Inserts a new visitor, or moves a returning one's last day on to today. Either way a
    // row comes back only on their first visit of the day.
    const row = await env.DB.prepare(
      `INSERT INTO visitors (id, first_day, last_day) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET last_day = excluded.last_day
         WHERE last_day <> excluded.last_day
       RETURNING first_day`,
    )
      .bind(visit.visitor, day, day)
      .first<{ first_day: string }>();
    const firstToday = row !== null;
    const isNew = row?.first_day === day;

    const metrics: Record<string, number> = {};
    if (visit.newVisit) {
      metrics.visits = 1;
      metrics[`page:${visit.page}`] = 1;
    }
    if (firstToday) metrics.visitors_active = 1;
    if (isNew) {
      metrics.visitors_new = 1;
      metrics[`device:${visit.device}`] = 1;
      metrics[`country:${visit.country ?? "unknown"}`] = 1;
      metrics[`source:${visit.source ?? "direct"}`] = 1;
    }
    await count(env, metrics, now);
    return isNew;
  } catch (error) {
    console.error("Couldn’t record visit", error);
    return false;
  }
}

/** Everyone who has ever visited. */
export async function visitorTotal(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM visitors").first<{
    total: number;
  }>();
  return row?.total ?? 0;
}
