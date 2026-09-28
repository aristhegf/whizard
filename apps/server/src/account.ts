import { normalizeNickname } from "@whizard/game-core";
import {
  USERNAME_PROBLEMS,
  accountUpdateSchema,
  nextUsernameChange,
  normalizeUsername,
  usernameChangeSchema,
  usernameProblem,
  type AccountPasskey,
  type UsernameCheck,
} from "@whizard/protocol";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { exportSocial } from "./friends";
import { exportMatches } from "./matches";
import { recordName, requireAllowedName } from "./moderation";
import { usernameTaken } from "./passkeys";
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
    if (normalized !== user.display_name) {
      await requireAllowedName(context.env, normalized);
      context.ctx.waitUntil(
        recordName(context.env, {
          name: normalized,
          kind: "account",
          target: user.id,
          detail: `@${user.username}`,
        }),
      );
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

/**
 * `GET /api/usernames/:name`: whether a username is free, for the live check while someone picks
 * one. The name rules are checked here too; the blocked word list only when it's saved.
 */
export async function checkUsername(context: RequestContext): Promise<Response> {
  const username = normalizeUsername(decodeURIComponent(context.params[0] ?? ""));
  const problem = usernameProblem(username);
  const body: UsernameCheck = problem
    ? { available: false, reason: USERNAME_PROBLEMS[problem] }
    : (await usernameTaken(context, username))
      ? { available: false, reason: "That username is taken." }
      : { available: true };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

const changeDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** `POST /api/me/username` with `{ username }`: a new username, at most once every 7 days. */
export async function changeUsername(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const body = await readJson(context.request, usernameChangeSchema);
  const username = normalizeUsername(body.username);
  const now = Date.now();

  if (username === user.username) {
    throw new HttpError(400, "username_unchanged", "That’s already your username.");
  }
  const problem = usernameProblem(username);
  if (problem) throw new HttpError(400, "username_invalid", USERNAME_PROBLEMS[problem]);
  const next = nextUsernameChange(user.username_changed_at, now);
  if (next !== null) {
    throw new HttpError(
      429,
      "username_too_soon",
      `You can change your username again on ${changeDate.format(next)}.`,
    );
  }
  await requireAllowedName(context.env, username);
  if (await usernameTaken(context, username)) {
    throw new HttpError(409, "username_taken", "That username is taken.");
  }

  try {
    await context.env.DB.prepare(
      "UPDATE users SET username = ?, username_changed_at = ? WHERE id = ?",
    )
      .bind(username, now, user.id)
      .run();
  } catch {
    // Free a moment ago; someone else just took it.
    throw new HttpError(409, "username_taken", "That username was just taken. Try another.");
  }
  context.ctx.waitUntil(
    recordName(context.env, {
      name: user.display_name,
      kind: "account",
      target: user.id,
      detail: `@${username}`,
    }),
  );
  return Response.json({
    user: toAccountUser({ ...user, username, username_changed_at: now }),
  });
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
    db.prepare("DELETE FROM recent_names WHERE kind = 'account' AND target = ?").bind(userId),
    // Payments stay in the accounts, without who made them.
    db
      .prepare("UPDATE payments SET user_id = NULL, username = 'Former member' WHERE user_id = ?")
      .bind(userId),
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
    pro: await context.env.DB.prepare(
      "SELECT since, until, source FROM pro_memberships WHERE user_id = ?",
    )
      .bind(user.id)
      .first(),
    payments: (
      await context.env.DB.prepare(
        "SELECT amount, currency, months, method, paid_at FROM payments WHERE user_id = ? ORDER BY paid_at",
      )
        .bind(user.id)
        .all()
    ).results,
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
