import { randomToken } from "@whizard/game-core";
import { isAvatarValue, type AccountUser, type Avatar } from "@whizard/protocol";
import type { Env } from "./env";

const COOKIE_NAME = "__Host-whizard_session";
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 60 * DAY_MS;
/** Sessions used within this long of expiring are extended, so regular players stay signed in. */
const SESSION_REFRESH_MS = 30 * DAY_MS;

export interface UserRow {
  id: string;
  username: string;
  username_changed_at: number | null;
  display_name: string;
  avatar: string | null;
  show_explanations: number;
  pause_after_answer: number;
  pings: number;
  quiet_start: number | null;
  quiet_end: number | null;
  time_zone: string | null;
  public_leaderboard: number;
  created_at: number;
  is_admin: number;
  suspended_at: number | null;
}

export interface SignedIn {
  user: UserRow;
  sessionId: string;
  expiresAt: number;
}

export function asAvatar(value: string | null | undefined): Avatar | null {
  return isAvatarValue(value) ? value : null;
}

export function toAccountUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    usernameChangedAt: row.username_changed_at,
    avatar: asAvatar(row.avatar),
    showExplanations: row.show_explanations === 1,
    pauseAfterAnswer: row.pause_after_answer === 1,
    pings: row.pings === 1,
    quietHours:
      row.quiet_start === null || row.quiet_end === null
        ? null
        : { start: row.quiet_start, end: row.quiet_end },
    publicLeaderboard: row.public_leaderboard === 1,
    createdAt: row.created_at,
    admin: row.is_admin === 1,
  };
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function hasSessionCookie(request: Request): boolean {
  return readCookie(request, COOKIE_NAME) !== null;
}

function sessionCookie(token: string, maxAgeMs: number): string {
  const maxAge = Math.max(0, Math.floor(maxAgeMs / 1000));
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearedSessionCookie = sessionCookie("", 0);

/** Starts a session and returns the Set-Cookie header value for it. */
export async function createSession(env: Env, userId: string, now: number): Promise<string> {
  const token = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(await hashToken(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return sessionCookie(token, SESSION_TTL_MS);
}

/** The signed-in user for this request, or null. Extends the session when it's getting old. */
export async function currentSession(
  request: Request,
  env: Env,
  now: number,
): Promise<(SignedIn & { refreshCookie: string | null }) | null> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const sessionId = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT u.*, s.expires_at AS session_expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.suspended_at IS NULL`,
  )
    .bind(sessionId, now)
    .first<UserRow & { session_expires_at: number }>();
  if (!row) return null;

  const { session_expires_at: expiresAt, ...user } = row;
  let refreshCookie: string | null = null;
  if (expiresAt - now < SESSION_REFRESH_MS) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
      .bind(now + SESSION_TTL_MS, sessionId)
      .run();
    refreshCookie = sessionCookie(token, SESSION_TTL_MS);
  }
  return { user, sessionId, expiresAt, refreshCookie };
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}
