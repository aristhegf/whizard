import {
  ANNOUNCEMENT_MAX,
  normalizeUsername,
  type AdminLogEntry,
  type AdminSettings,
} from "@whizard/protocol";
import { z } from "zod";
import { logAdmin, requireAdmin } from "./admin";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { asAvatar } from "./sessions";
import { forgetSettings, siteSettings } from "./settings";

const LOG_SIZE = 50;

/** `GET /api/admin/settings`: the site switches, the admins and what admins did lately. */
export async function getAdminSettings(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { env } = context;
  forgetSettings();
  const db = env.DB;
  const [admins, log] = await db.batch<Record<string, unknown>>([
    db.prepare(
      "SELECT id, username, display_name, avatar FROM users WHERE is_admin = 1 ORDER BY username",
    ),
    db.prepare(
      `SELECT l.at, l.action, l.target, a.username AS admin, t.username AS target_name
         FROM admin_log l
         LEFT JOIN users a ON a.id = l.user_id
         LEFT JOIN users t ON t.id = l.target
        ORDER BY l.id DESC LIMIT ${LOG_SIZE}`,
    ),
  ]);
  const body: AdminSettings = {
    settings: await siteSettings(env),
    admins: (
      (admins?.results ?? []) as {
        id: string;
        username: string;
        display_name: string;
        avatar: string | null;
      }[]
    ).map((a) => ({
      id: a.id,
      username: a.username,
      displayName: a.display_name,
      avatar: asAvatar(a.avatar),
    })),
    log: (
      (log?.results ?? []) as {
        at: number;
        action: string;
        target: string;
        admin: string | null;
        target_name: string | null;
      }[]
    ).map((l): AdminLogEntry => ({
      at: l.at,
      admin: l.admin,
      action: l.action,
      target: l.target,
      targetName: l.target_name,
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

const settingsSchema = z.object({
  announcement: z
    .string()
    .trim()
    .max(ANNOUNCEMENT_MAX, `Announcements can be up to ${ANNOUNCEMENT_MAX} characters.`)
    .nullable()
    .optional(),
  roomsPaused: z.boolean().optional(),
  signupsPaused: z.boolean().optional(),
});

/** `PATCH /api/admin/settings` with any of `{ announcement, roomsPaused, signupsPaused }`. */
export async function updateSettings(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const update = await readJson(context.request, settingsSchema);
  const db = context.env.DB;
  const now = Date.now();
  const values: [string, string][] = [];
  if (update.announcement !== undefined) values.push(["announcement", update.announcement ?? ""]);
  if (update.roomsPaused !== undefined)
    values.push(["rooms_paused", update.roomsPaused ? "1" : "0"]);
  if (update.signupsPaused !== undefined) {
    values.push(["signups_paused", update.signupsPaused ? "1" : "0"]);
  }
  if (values.length === 0) return Response.json({ ok: true });
  await db.batch(
    values.flatMap(([key, value]) => [
      db
        .prepare(
          `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value,
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .bind(key, value, now, user.id),
      logAdmin(db, user.id, `setting:${key}`, key === "announcement" ? value.slice(0, 60) : value),
    ]),
  );
  forgetSettings();
  return Response.json({ ok: true });
}

/** `POST /api/admin/admins` with `{ username }`: makes an account an admin. */
export async function grantAdmin(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { username } = await readJson(context.request, z.object({ username: z.string() }));
  const db = context.env.DB;
  const target = await db
    .prepare("SELECT id, is_admin, suspended_at FROM users WHERE username = ?")
    .bind(normalizeUsername(username))
    .first<{ id: string; is_admin: number; suspended_at: number | null }>();
  if (!target) throw new HttpError(404, "user_not_found", "Nobody has that username.");
  if (target.suspended_at !== null) {
    throw new HttpError(400, "suspended", "That account is suspended. Let it back in first.");
  }
  if (target.is_admin === 1) throw new HttpError(400, "already_admin", "They’re already an admin.");
  await db.batch([
    db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").bind(target.id),
    logAdmin(db, user.id, "admin:grant", target.id),
  ]);
  return Response.json({ ok: true });
}

/** `DELETE /api/admin/admins/:id`: takes an admin's role away. Not your own, and never the last. */
export async function revokeAdmin(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const id = decodeURIComponent(context.params[0] ?? "");
  if (id === user.id) {
    throw new HttpError(400, "self", "You can’t take away your own admin role here.");
  }
  const db = context.env.DB;
  await db.batch([
    db.prepare("UPDATE users SET is_admin = 0 WHERE id = ?").bind(id),
    logAdmin(db, user.id, "admin:revoke", id),
  ]);
  return Response.json({ ok: true });
}
