import {
  USER_ACTIONS,
  USER_SORTS,
  type AdminUser,
  type AdminUsers,
  type UserAction,
  type UserSort,
} from "@whizard/protocol";
import { z } from "zod";
import { deleteAccount } from "./account";
import { logAdmin, requireAdmin } from "./admin";
import { dayOf } from "./analytics";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { asAvatar } from "./sessions";

const PAGE = 50;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ORDER: Record<UserSort, string> = {
  newest: "u.created_at DESC",
  games: "games DESC, u.created_at DESC",
  active: "last_day IS NULL, last_day DESC, u.created_at DESC",
};

interface Row {
  id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  created_at: number;
  is_admin: number;
  suspended_at: number | null;
  games: number;
  wins: number;
  last_day: string | null;
}

/** `GET /api/admin/users?q=&sort=&offset=`: accounts, 50 at a time. */
export async function getAdminUsers(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const { env, url } = context;
  const db = env.DB;
  const now = Date.now();
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 40);
  const sortParam = url.searchParams.get("sort") ?? "";
  const sort: UserSort = (USER_SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as UserSort)
    : "newest";
  const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get("offset")) || 0));

  const [list, totals] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.avatar, u.created_at, u.is_admin,
                u.suspended_at,
                (SELECT COUNT(*) FROM match_players mp WHERE mp.user_id = u.id) AS games,
                (SELECT COUNT(*) FROM match_players mp JOIN matches m ON m.id = mp.match_id
                  WHERE mp.user_id = u.id AND mp.placing = 1 AND m.player_count >= 2) AS wins,
                (SELECT MAX(day) FROM player_days p WHERE p.viewer = 'u:' || u.id) AS last_day
           FROM users u
          WHERE ?1 = '' OR instr(u.username, ?1) > 0 OR instr(lower(u.display_name), ?1) > 0
          ORDER BY ${ORDER[sort]}
          LIMIT ?2 OFFSET ?3`,
      )
      .bind(q, PAGE + 1, offset),
    db
      .prepare(
        `SELECT COUNT(*) AS accounts,
                SUM(created_at >= ?1) AS new_this_week,
                SUM(suspended_at IS NOT NULL) AS suspended,
                (SELECT COUNT(DISTINCT viewer) FROM player_days
                  WHERE viewer LIKE 'u:%' AND day >= ?2) AS active_this_week
           FROM users`,
      )
      .bind(now - WEEK_MS, dayOf(now - 6 * 24 * 60 * 60 * 1000)),
  ]);

  const rows = (list?.results ?? []) as unknown as Row[];
  const t = (totals?.results?.[0] ?? {}) as Record<string, number | null>;
  const users: AdminUser[] = rows.slice(0, PAGE).map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatar: asAvatar(r.avatar),
    createdAt: r.created_at,
    admin: r.is_admin === 1,
    suspended: r.suspended_at !== null,
    games: r.games,
    wins: r.wins,
    lastPlayed: r.last_day,
  }));
  const body: AdminUsers = {
    totals: {
      accounts: Number(t.accounts ?? 0),
      newThisWeek: Number(t.new_this_week ?? 0),
      activeThisWeek: Number(t.active_this_week ?? 0),
      suspended: Number(t.suspended ?? 0),
    },
    users,
    more: rows.length > PAGE,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

const userActionSchema = z.object({
  action: z.enum(USER_ACTIONS as unknown as [UserAction, ...UserAction[]]),
});

/**
 * `POST /api/admin/users/:id` with `{ action }`. Suspending signs the account out everywhere
 * and stops it signing in; deleting is the same as the player deleting it themselves. Admins
 * can't be suspended or deleted here: take their admin role away first.
 */
export async function manageUser(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user: admin } = await requireAdmin(context);
  const { env, params, request } = context;
  const db = env.DB;
  const id = decodeURIComponent(params[0] ?? "");
  const { action } = await readJson(request, userActionSchema);
  const target = await db
    .prepare("SELECT id, is_admin FROM users WHERE id = ?")
    .bind(id)
    .first<{ id: string; is_admin: number }>();
  if (!target) throw new HttpError(404, "not_found", "That account doesn’t exist.");
  if (target.is_admin === 1) {
    throw new HttpError(400, "is_admin", "Admins can’t be suspended or deleted from here.");
  }

  if (action === "delete") {
    await deleteAccount(db, id);
    await logAdmin(db, admin.id, "user:delete", id).run();
  } else {
    await db.batch([
      db
        .prepare("UPDATE users SET suspended_at = ? WHERE id = ?")
        .bind(action === "suspend" ? Date.now() : null, id),
      ...(action === "suspend"
        ? [db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id)]
        : []),
      logAdmin(db, admin.id, `user:${action}`, id),
    ]);
  }
  return Response.json({ ok: true });
}
