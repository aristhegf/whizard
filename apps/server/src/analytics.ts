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
  /** The one-way network code (see `networkKey`), or null when there isn't a usable address. */
  network: string | null;
  page: PageName;
  device: DeviceType;
  source: string | null;
  country: string | null;
  /** False for a reconnect: the visitor is still on the same page load. */
  newVisit: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Addresses get handed to someone else, so a network code only matches for this long. */
export const NETWORK_MATCH_DAYS = 30;

/**
 * Records a visit. The visitor is recognised by their browser ID, or else by their network
 * code; only when neither is known is it a new person. Returns who it was, and whether they're
 * new, so the caller can update its running total. Null if the database couldn't be reached.
 */
export async function recordVisit(
  env: Env,
  visit: Visit,
  now = Date.now(),
): Promise<{ person: string; isNew: boolean } | null> {
  const day = dayOf(now);
  const db = env.DB;
  try {
    const [byBrowser, byNetwork] = await db.batch<{ person_id: string }>([
      db.prepare("SELECT person_id FROM visitor_browsers WHERE id = ?").bind(visit.visitor),
      db
        .prepare("SELECT person_id FROM visitor_networks WHERE key = ? AND last_day >= ?")
        .bind(visit.network ?? "", dayOf(now - NETWORK_MATCH_DAYS * DAY_MS)),
    ]);
    const known = byBrowser?.results[0]?.person_id ?? byNetwork?.results[0]?.person_id ?? null;
    const person = known ?? visit.visitor;

    const statements = [
      // Adds a new person, or moves a known one's last day on to today. Either way a row comes
      // back only on their first visit of the day.
      db
        .prepare(
          `INSERT INTO visitor_people (id, first_day, last_day) VALUES (?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET last_day = excluded.last_day
             WHERE last_day <> excluded.last_day
           RETURNING first_day`,
        )
        .bind(person, day, day),
      db
        .prepare("INSERT OR IGNORE INTO visitor_browsers (id, person_id) VALUES (?, ?)")
        .bind(visit.visitor, person),
    ];
    if (visit.network) {
      statements.push(
        db
          .prepare(
            `INSERT INTO visitor_networks (key, person_id, last_day) VALUES (?, ?, ?)
             ON CONFLICT (key) DO UPDATE
               SET person_id = excluded.person_id, last_day = excluded.last_day`,
          )
          .bind(visit.network, person, day),
      );
    }
    const [people] = await db.batch<{ first_day: string }>(statements);
    const firstToday = (people?.results.length ?? 0) > 0;
    const isNew = known === null && firstToday;

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
    return { person, isNew };
  } catch (error) {
    console.error("Couldn’t record visit", error);
    return null;
  }
}

/** Everyone who has ever visited. */
export async function visitorTotal(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM visitor_people").first<{
    total: number;
  }>();
  return row?.total ?? 0;
}

// Networks ------------------------------------------------------------------------------------

/**
 * The part of an address that stays put for one household or phone: all of an IPv4 address, or
 * the first half of an IPv6 one (the rest often changes by the hour). Null for addresses that
 * never come from the internet, such as local development.
 */
export function networkPrefix(ip: string | null): string | null {
  if (!ip) return null;
  const address = ip.trim().toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(address);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const local =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
    return local ? null : address;
  }
  if (!address.includes(":")) return null;
  const [head = "", tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = address.includes("::")
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const first = parseInt(groups[0]!, 16);
  // Loopback, link-local and private (fc00::/7) addresses.
  if (address === "::1" || (first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00) return null;
  return groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":");
}

/** Crawlers and automated browsers that run JavaScript. They're never counted as visitors. */
export function isBot(userAgent: string | null): boolean {
  return !userAgent || /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime/i.test(userAgent);
}

const NETWORK_SECRET_NAME = "visitor_network";

/** The secret that keys network codes, made on first use and kept in the database. */
export async function networkSecret(env: Env): Promise<string> {
  const read = () =>
    env.DB.prepare("SELECT value FROM server_keys WHERE name = ?")
      .bind(NETWORK_SECRET_NAME)
      .first<{ value: string }>();
  const saved = await read();
  if (saved) return saved.value;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = btoa(String.fromCharCode(...bytes));
  await env.DB.prepare(
    "INSERT OR IGNORE INTO server_keys (name, value, created_at) VALUES (?, ?, ?)",
  )
    .bind(NETWORK_SECRET_NAME, value, Date.now())
    .run();
  return (await read())?.value ?? value;
}

/** A one-way code for a network and browser. Without the secret it can't be traced back. */
export async function networkKey(secret: string, prefix: string, userAgent: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${prefix}\n${userAgent.slice(0, 512)}`),
  );
  return [...new Uint8Array(mac).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
