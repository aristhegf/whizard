import {
  blockedWordIn,
  NAME_ACTIONS,
  type AdminModeration,
  type NameAction,
  type NameKind,
  type RecentName,
} from "@whizard/protocol";
import { z } from "zod";
import { logAdmin, requireAdmin } from "./admin";
import { dayOf } from "./analytics";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { forgetBlockedWords } from "./moderation";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SHOWN = 200;

/** `GET /api/admin/moderation`: the blocked words, and names chosen in the last 7 days. */
export async function getModeration(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  const db = context.env.DB;
  const now = Date.now();
  const [words, names, live, refused, removed] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT word, anywhere, added_at FROM blocked_words ORDER BY word"),
    db
      .prepare(
        "SELECT id, name, kind, detail, at, target FROM recent_names WHERE at >= ? ORDER BY id DESC",
      )
      .bind(now - WEEK_MS),
    db.prepare("SELECT code, nicknames FROM live_rooms"),
    db
      .prepare(
        "SELECT COALESCE(SUM(count), 0) AS n FROM daily_counts WHERE metric = ? AND day >= ?",
      )
      .bind("names_refused", dayOf(now - 6 * 24 * 60 * 60 * 1000)),
    db
      .prepare("SELECT COUNT(*) AS n FROM admin_log WHERE action = 'name:remove' AND at >= ?")
      .bind(now - WEEK_MS),
  ]);
  const wordList = (
    (words?.results ?? []) as { word: string; anywhere: number; added_at: number }[]
  ).map((w) => ({ word: w.word, anywhere: w.anywhere === 1, addedAt: w.added_at }));
  const inRooms = new Map<string, string[]>();
  for (const room of (live?.results ?? []) as { code: string; nicknames: string }[]) {
    inRooms.set(
      room.code,
      (JSON.parse(room.nicknames) as string[]).map((n) => n.toLowerCase()),
    );
  }
  const all: RecentName[] = (
    (names?.results ?? []) as {
      id: number;
      name: string;
      kind: NameKind;
      detail: string;
      at: number;
      target: string;
    }[]
  ).map((n) => ({
    id: n.id,
    name: n.name,
    kind: n.kind,
    detail: n.detail,
    at: n.at,
    // An account is also flagged for its username.
    flagged:
      blockedWordIn(n.name, wordList) ??
      (n.kind === "account" ? blockedWordIn(n.detail, wordList) : null),
    inRoom:
      n.kind === "nickname" && (inRooms.get(n.target)?.includes(n.name.toLowerCase()) ?? false),
  }));
  const number = (r: typeof refused) => Number((r?.results?.[0] as { n?: number })?.n ?? 0);
  const body: AdminModeration = {
    words: wordList,
    // Flagged names first, so they're never cut off.
    names: [...all.filter((n) => n.flagged), ...all.filter((n) => !n.flagged)].slice(0, SHOWN),
    totals: {
      words: wordList.length,
      flagged: all.filter((n) => n.flagged).length,
      refused: number(refused),
      removed: number(removed),
    },
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

const wordSchema = z.object({
  word: z
    .string()
    .trim()
    .min(2, "Words need at least 2 letters.")
    .max(30, "Words can be up to 30 characters.")
    .transform((w) => w.toLowerCase()),
  anywhere: z.boolean(),
});

/** `POST /api/admin/moderation/words` with `{ word, anywhere }`. */
export async function addBlockedWord(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { word, anywhere } = await readJson(context.request, wordSchema);
  if (!/[a-z]/i.test(word.normalize("NFKD"))) {
    throw new HttpError(400, "invalid_word", "Words need letters in them.");
  }
  const db = context.env.DB;
  await db.batch([
    db
      .prepare(
        `INSERT INTO blocked_words (word, anywhere, added_at, added_by) VALUES (?, ?, ?, ?)
         ON CONFLICT (word) DO UPDATE SET anywhere = excluded.anywhere`,
      )
      .bind(word, anywhere ? 1 : 0, Date.now(), user.id),
    logAdmin(db, user.id, "word:add", word),
  ]);
  forgetBlockedWords();
  return Response.json({ ok: true });
}

/** `DELETE /api/admin/moderation/words/:word` */
export async function removeBlockedWord(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const word = decodeURIComponent(context.params[0] ?? "");
  const db = context.env.DB;
  await db.batch([
    db.prepare("DELETE FROM blocked_words WHERE word = ?").bind(word),
    logAdmin(db, user.id, "word:remove", word),
  ]);
  forgetBlockedWords();
  return Response.json({ ok: true });
}

const nameActionSchema = z.object({
  action: z.enum(NAME_ACTIONS as unknown as [NameAction, ...NameAction[]]),
});

/**
 * `POST /api/admin/moderation/names/:id` with `{ action }`. Remove sends a player out of the
 * room they're in; reset gives an account its username as its name, or a group the name
 * "Group".
 */
export async function actOnName(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env, params, request } = context;
  const { action } = await readJson(request, nameActionSchema);
  const entry = await env.DB.prepare("SELECT * FROM recent_names WHERE id = ?")
    .bind(Number(params[0]))
    .first<{ name: string; kind: NameKind; target: string }>();
  if (!entry) throw new HttpError(404, "not_found", "That name is no longer listed.");

  if (action === "remove") {
    if (entry.kind !== "nickname") {
      throw new HttpError(400, "not_in_room", "Only players in rooms can be removed.");
    }
    const removed = await env.ROOMS.getByName(entry.target).removeByAdmin(entry.name);
    if (!removed) throw new HttpError(404, "not_in_room", "They’ve already left that room.");
    await logAdmin(env.DB, user.id, "name:remove", `${entry.target}:${entry.name}`).run();
    return Response.json({ ok: true });
  }

  if (entry.kind === "nickname") {
    throw new HttpError(400, "cannot_reset", "Nicknames can’t be reset; remove the player.");
  }
  const reset =
    entry.kind === "account"
      ? env.DB.prepare("UPDATE users SET display_name = username WHERE id = ?").bind(entry.target)
      : env.DB.prepare("UPDATE friend_groups SET name = 'Group' WHERE id = ?").bind(entry.target);
  await env.DB.batch([reset, logAdmin(env.DB, user.id, `name:reset`, entry.target)]);
  return Response.json({ ok: true });
}
