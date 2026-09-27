import { normalizeNickname } from "@whizard/game-core";
import { accountUpdateSchema, type AccountPasskey } from "@whizard/protocol";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { exportSocial } from "./friends";
import { exportMatches } from "./matches";
import {
  clearedSessionCookie,
  currentSession,
  deleteSession,
  toAccountUser,
  type SignedIn,
  type UserRow,
} from "./sessions";

/** The signed-in user, or a 401. */
export async function requireUser(context: RequestContext): Promise<SignedIn> {
  const session = await currentSession(context.request, context.env, Date.now());
  if (!session) throw new HttpError(401, "signed_out", "Sign in to do that.");
  return session;
}

export async function getMe(context: RequestContext): Promise<Response> {
  const session = await currentSession(context.request, context.env, Date.now());
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (session?.refreshCookie) headers.set("Set-Cookie", session.refreshCookie);
  return Response.json({ user: session ? toAccountUser(session.user) : null }, { headers });
}

export async function updateMe(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const update = await readJson(context.request, accountUpdateSchema);

  let displayName = user.display_name;
  if (update.displayName !== undefined) {
    const normalized = normalizeNickname(update.displayName);
    if (!normalized) {
      throw new HttpError(400, "display_name_invalid", "Pick a name between 1 and 20 characters.");
    }
    displayName = normalized;
  }
  const next: UserRow = {
    ...user,
    display_name: displayName,
    avatar: update.avatar === undefined ? user.avatar : update.avatar,
    show_explanations:
      update.showExplanations === undefined
        ? user.show_explanations
        : Number(update.showExplanations),
    pings: update.pings === undefined ? user.pings : Number(update.pings),
    quiet_start:
      update.quietHours === undefined ? user.quiet_start : (update.quietHours?.start ?? null),
    quiet_end: update.quietHours === undefined ? user.quiet_end : (update.quietHours?.end ?? null),
    time_zone: update.timeZone === undefined ? user.time_zone : validTimeZone(update.timeZone),
    public_leaderboard:
      update.publicLeaderboard === undefined
        ? user.public_leaderboard
        : Number(update.publicLeaderboard),
  };

  await context.env.DB.prepare(
    `UPDATE users SET display_name = ?, avatar = ?, show_explanations = ?, pings = ?,
                      quiet_start = ?, quiet_end = ?, time_zone = ?, public_leaderboard = ?
      WHERE id = ?`,
  )
    .bind(
      next.display_name,
      next.avatar,
      next.show_explanations,
      next.pings,
      next.quiet_start,
      next.quiet_end,
      next.time_zone,
      next.public_leaderboard,
      user.id,
    )
    .run();
  return Response.json({ user: toAccountUser(next) });
}

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    throw new HttpError(400, "bad_time_zone", "That time zone isn’t recognised.");
  }
}

export async function signOut(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const session = await currentSession(context.request, context.env, Date.now());
  if (session) await deleteSession(context.env, session.sessionId);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie } });
}

/**
 * Deletes the account and everything tied to it. Games stay in other players' history, but
 * this player's row in them loses its link to the account and its nickname.
 */
export async function deleteMe(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  await deleteAccount(context.env.DB, user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie } });
}

/** Deletes an account, for the player themselves or an admin removing an abusive one. */
export async function deleteAccount(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        "UPDATE match_players SET user_id = NULL, nickname = 'Former player' WHERE user_id = ?",
      )
      .bind(userId),
    db.prepare("DELETE FROM seen_questions WHERE viewer = ?").bind(`u:${userId}`),
    db.prepare("DELETE FROM player_days WHERE viewer = ?").bind(`u:${userId}`),
    // Their reports still count, but no longer point at them.
    db
      .prepare(
        "UPDATE question_reports SET reporter = 'x:' || lower(hex(randomblob(8))) WHERE reporter = ?",
      )
      .bind(`u:${userId}`),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

/** Everything stored about the signed-in user, as a JSON download. */
export async function exportMe(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  const passkeys = await listPasskeys(context, user.id);
  const data = {
    exportedAt: new Date().toISOString(),
    account: toAccountUser(user),
    passkeys,
    matches: await exportMatches(context.env, user.id),
    ...(await exportSocial(context.env, user.id)),
    questionsSeen: (
      await context.env.DB.prepare(
        "SELECT question_id, seen_at FROM seen_questions WHERE viewer = ? ORDER BY seen_at DESC",
      )
        .bind(`u:${user.id}`)
        .all<{ question_id: string; seen_at: number }>()
    ).results.map((r) => ({ question: r.question_id, seenAt: new Date(r.seen_at).toISOString() })),
    daysPlayed: (
      await context.env.DB.prepare("SELECT day FROM player_days WHERE viewer = ? ORDER BY day")
        .bind(`u:${user.id}`)
        .all<{ day: string }>()
    ).results.map((r) => r.day),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="whizard-${user.username}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

async function listPasskeys(context: RequestContext, userId: string): Promise<AccountPasskey[]> {
  const { results } = await context.env.DB.prepare(
    "SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at",
  )
    .bind(userId)
    .all<{ id: string; name: string | null; created_at: number; last_used_at: number | null }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

export async function getPasskeys(context: RequestContext): Promise<Response> {
  const { user } = await requireUser(context);
  return Response.json({ passkeys: await listPasskeys(context, user.id) });
}

export async function deletePasskey(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const id = decodeURIComponent(context.params[0] ?? "");
  const passkeys = await listPasskeys(context, user.id);
  if (!passkeys.some((p) => p.id === id))
    throw new HttpError(404, "not_found", "Passkey not found.");
  if (passkeys.length === 1) {
    throw new HttpError(400, "last_passkey", "That’s your only passkey, so you’d be locked out.");
  }
  await context.env.DB.prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .run();
  return Response.json({ ok: true });
}
