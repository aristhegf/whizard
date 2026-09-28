import { randomToken } from "@whizard/game-core";
import {
  normalizeUsername,
  PAYMENT_METHODS,
  PRO_DURATIONS,
  type AdminPayments,
  type PaymentMethod,
  type PaymentRecord,
  type ProMember,
} from "@whizard/protocol";
import { z } from "zod";
import { logAdmin, requireAdmin } from "./admin";
import type { Env } from "./env";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { asAvatar } from "./sessions";

const DAY_MS = 24 * 60 * 60 * 1000;
const SHOWN_PAYMENTS = 100;

/** A month later, on the same day where it exists (31 January goes to 28 or 29 February). */
export function addMonths(at: number, months: number): number {
  const date = new Date(at);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}

/** `GET /api/admin/payments` */
export async function getAdminPayments(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const db = context.env.DB;
  const now = Date.now();
  const [members, payments, sums] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT m.*, u.username, u.display_name, u.avatar FROM pro_memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.until IS NULL OR m.until > ?
          ORDER BY m.until IS NULL, m.until`,
      )
      .bind(now),
    db.prepare(
      `SELECT p.*, a.username AS recorder FROM payments p
           LEFT JOIN users a ON a.id = p.recorded_by
          ORDER BY p.paid_at DESC LIMIT ${SHOWN_PAYMENTS}`,
    ),
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total, COALESCE(SUM(CASE WHEN paid_at >= ? THEN amount END), 0) AS recent FROM payments",
      )
      .bind(now - 30 * DAY_MS),
  ]);
  const memberList: ProMember[] = (
    (members?.results ?? []) as {
      user_id: string;
      username: string;
      display_name: string;
      avatar: string | null;
      since: number;
      until: number | null;
      source: string;
    }[]
  ).map((m) => ({
    userId: m.user_id,
    username: m.username,
    displayName: m.display_name,
    avatar: asAvatar(m.avatar),
    since: m.since,
    until: m.until,
    source: m.source === "paid" ? "paid" : "free",
  }));
  const sum = (sums?.results?.[0] ?? {}) as { total?: number; recent?: number };
  const body: AdminPayments = {
    totals: {
      members: memberList.length,
      endingSoon: memberList.filter((m) => m.until !== null && m.until < now + 7 * DAY_MS).length,
      last30: Number(sum.recent ?? 0),
      allTime: Number(sum.total ?? 0),
    },
    members: memberList,
    payments: (
      (payments?.results ?? []) as {
        id: string;
        username: string;
        amount: number;
        currency: string;
        months: number;
        method: string;
        note: string | null;
        paid_at: number;
        recorder: string | null;
      }[]
    ).map((p): PaymentRecord => ({
      id: p.id,
      username: p.username,
      amount: p.amount,
      currency: p.currency,
      months: p.months,
      method: (PAYMENT_METHODS as readonly string[]).includes(p.method)
        ? (p.method as PaymentMethod)
        : "other",
      note: p.note,
      paidAt: p.paid_at,
      recordedBy: p.recorder,
    })),
    provider: null,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

async function findAccount(env: Env, username: string) {
  const user = await env.DB.prepare("SELECT id, username FROM users WHERE username = ?")
    .bind(normalizeUsername(username))
    .first<{ id: string; username: string }>();
  if (!user) throw new HttpError(404, "user_not_found", "Nobody has that username.");
  return user;
}

/** Makes someone Pro for `months` more (0: without an end), from when their current Pro ends. */
function extend(
  db: D1Database,
  userId: string,
  months: number,
  source: "paid" | "free",
  now: number,
  current: { until: number | null } | null,
) {
  const from = current && (current.until === null || current.until > now) ? current.until : now;
  const until = months === 0 || from === null ? null : addMonths(from, months);
  return db
    .prepare(
      `INSERT INTO pro_memberships (user_id, since, until, source, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?2)
       ON CONFLICT (user_id) DO UPDATE SET
         since = CASE WHEN pro_memberships.until IS NOT NULL AND pro_memberships.until <= ?2
                      THEN ?2 ELSE pro_memberships.since END,
         until = ?3, source = ?4, updated_at = ?2`,
    )
    .bind(userId, now, until, source);
}

const duration = z
  .number()
  .int()
  .refine((m) => (PRO_DURATIONS as readonly number[]).includes(m), "Pick how long.");

const paymentSchema = z.object({
  username: z.string().min(1, "Whose payment is it?"),
  amount: z.number().int().min(1, "Enter the amount paid.").max(10_000_000),
  months: duration.refine((m) => m > 0, "A payment is for a number of months."),
  method: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(120).nullable().optional(),
});

/** `POST /api/admin/payments`: a payment made directly, which gives or extends Pro. */
export async function recordPayment(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user: admin } = await requireAdmin(context);
  const { env } = context;
  const input = await readJson(context.request, paymentSchema);
  const user = await findAccount(env, input.username);
  const db = env.DB;
  const now = Date.now();
  const current = await db
    .prepare("SELECT until FROM pro_memberships WHERE user_id = ?")
    .bind(user.id)
    .first<{ until: number | null }>();
  const id = randomToken(9);
  await db.batch([
    db
      .prepare(
        `INSERT INTO payments (id, user_id, username, amount, currency, months, method, note,
                               paid_at, recorded_by)
         VALUES (?, ?, ?, ?, 'NGN', ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.id,
        user.username,
        input.amount,
        input.months,
        input.method,
        input.note || null,
        now,
        admin.id,
      ),
    extend(db, user.id, input.months, "paid", now, current),
    logAdmin(db, admin.id, "pro:payment", user.id),
  ]);
  return Response.json({ ok: true, id });
}

const grantSchema = z.object({ username: z.string().min(1), months: duration });

/** `POST /api/admin/pro` with `{ username, months }`: Pro for free, e.g. for a tester. */
export async function giveProFree(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user: admin } = await requireAdmin(context);
  const { env } = context;
  const input = await readJson(context.request, grantSchema);
  const user = await findAccount(env, input.username);
  const db = env.DB;
  const now = Date.now();
  const current = await db
    .prepare("SELECT until FROM pro_memberships WHERE user_id = ?")
    .bind(user.id)
    .first<{ until: number | null }>();
  await db.batch([
    extend(db, user.id, input.months, "free", now, current),
    logAdmin(db, admin.id, "pro:give", user.id),
  ]);
  return Response.json({ ok: true });
}

/** `DELETE /api/admin/pro/:userId`: ends someone's Pro now. Recorded payments stay. */
export async function endPro(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user: admin } = await requireAdmin(context);
  const id = decodeURIComponent(context.params[0] ?? "");
  const db = context.env.DB;
  await db.batch([
    db
      .prepare("UPDATE pro_memberships SET until = ?1, updated_at = ?1 WHERE user_id = ?2")
      .bind(Date.now(), id),
    logAdmin(db, admin.id, "pro:end", id),
  ]);
  return Response.json({ ok: true });
}
