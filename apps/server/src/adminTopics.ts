import { DEFAULT_QUIZ_SETTINGS, DEFAULT_TOPIC_COLORS } from "@whizard/game-core";
import { z } from "zod";
import { logAdmin, requireAdmin } from "./admin";
import { loadBank, type Bank } from "./bank";
import type { Env } from "./env";
import { HttpError, requireSameOrigin, type RequestContext } from "./http";
import { forgetSettings, siteSettings } from "./settings";
import { artUrl, forgetTopics, getTopics, hasQuestions, nextSlug, webpDimensions } from "./topics";

/** One row of the admin topic list, exactly the fields the admin page shows. */
interface AdminTopic {
  id: string;
  name: string;
  tagline: string;
  colors: readonly [string, string];
  sortOrder: number;
  art: string;
  artVersion: number;
  off: boolean;
  questionCount: number;
}

const NO_STORE = { "Cache-Control": "no-store" };

/** A replacement picture has to be a parsable WebP inside these limits (spec §8). */
const ART_MAX_BYTES = 400_000;
const ART_MIN_EDGE = 32;
const ART_MAX_EDGE = 2048;

/**
 * Parses a JSON body and says what didn't fit, unlike `readJson`, which answers every
 * validation problem with a bare "not understood" — the admin forms show these messages.
 */
async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "bad_request", "That wasn’t valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_topic", parsed.error.issues[0]?.message ?? "Check it.");
  }
  return parsed.data;
}

const colorsSchema = z
  .array(z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colours look like #6d5bff."))
  .length(2, "There must be two colours.")
  .transform((values) => [values[0]!, values[1]!] as [string, string]);

const nameSchema = z.string().trim().min(1, "Pick a topic.").max(40, "Pick a topic.");
const taglineSchema = z.string().trim().max(80, "The tagline can be up to 80 characters.");

const createSchema = z.object({
  name: nameSchema,
  tagline: taglineSchema.optional(),
  colors: colorsSchema.optional(),
});

const patchSchema = z.object({
  name: nameSchema.optional(),
  tagline: taglineSchema.optional(),
  colors: colorsSchema.optional(),
});

/** Whether some *other* topic already answers to this name, ignoring case. */
async function nameTaken(env: Env, name: string, ownId: string | null): Promise<boolean> {
  const wanted = name.trim().toLowerCase();
  return (await getTopics(env)).some(
    (topic) => topic.id !== ownId && topic.name.trim().toLowerCase() === wanted,
  );
}

/** How many questions point at each topic, from either source, each question counted once. */
async function questionTally(env: Env, bank: Bank): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare("SELECT category, id FROM custom_questions").all<{
    category: string;
    id: string;
  }>();
  const ids = new Map<string, Set<string>>();
  const add = (category: string, id: string) => {
    const seen = ids.get(category) ?? new Set<string>();
    seen.add(id);
    ids.set(category, seen);
  };
  for (const row of results) add(row.category, row.id);
  for (const question of bank.questions) add(question.category, question.id);
  return new Map([...ids].map(([category, seen]) => [category, seen.size]));
}

/** The whole catalogue as the admin list serves it: off topics and question counts included. */
async function listing(env: Env): Promise<AdminTopic[]> {
  const [topics, settings, bank] = await Promise.all([
    getTopics(env),
    siteSettings(env),
    loadBank(env),
  ]);
  const counts = await questionTally(env, bank);
  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    tagline: topic.tagline,
    colors: topic.colors,
    sortOrder: topic.sortOrder,
    art: artUrl(topic),
    artVersion: topic.artVersion,
    off: settings.topicsOff.includes(topic.id),
    questionCount: counts.get(topic.id) ?? 0,
  }));
}

/** One topic as the admin list serves it, or null when it isn't in the catalogue. */
async function listed(env: Env, id: string): Promise<AdminTopic | null> {
  return (await listing(env)).find((topic) => topic.id === id) ?? null;
}

/** `GET /api/admin/topics`: every topic, the ones turned off included. */
export async function listTopics(context: RequestContext): Promise<Response> {
  await requireAdmin(context);
  return Response.json({ topics: await listing(context.env) }, { headers: NO_STORE });
}

/**
 * `POST /api/admin/topics` with `{ name, tagline?, colors? }`: a new topic whose id the
 * server picks from the name, sorted after everything that already exists.
 */
export async function createTopic(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env } = context;
  const input = await readBody(context.request, createSchema);
  if (await nameTaken(env, input.name, null)) {
    throw new HttpError(409, "topic_exists", "A topic with that name already exists.");
  }
  const id = await nextSlug(env, input.name);
  const db = env.DB;
  const colors = JSON.stringify(input.colors ?? DEFAULT_TOPIC_COLORS);
  const { next } = (await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM topics")
    .first<{ next: number }>())!;
  await db.batch([
    db
      .prepare("INSERT INTO topics (id, name, tagline, colors, sort_order) VALUES (?, ?, ?, ?, ?)")
      .bind(id, input.name, input.tagline ?? "", colors, next),
    logAdmin(db, user.id, "topic:create", id),
  ]);
  forgetTopics();
  return Response.json({ topic: await listed(env, id) }, { status: 201, headers: NO_STORE });
}

/** `PATCH /api/admin/topics/:id`: rename, re-tagline or recolour. The id never changes. */
export async function updateTopic(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env } = context;
  const id = decodeURIComponent(context.params[0] ?? "");
  const input = await readBody(context.request, patchSchema);
  const known = (await getTopics(env)).some((topic) => topic.id === id);
  if (!known) throw new HttpError(404, "not_found", "That topic doesn’t exist.");
  if (input.name !== undefined && (await nameTaken(env, input.name, id))) {
    throw new HttpError(409, "topic_exists", "A topic with that name already exists.");
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    sets.push("name = ?");
    values.push(input.name);
  }
  if (input.tagline !== undefined) {
    sets.push("tagline = ?");
    values.push(input.tagline);
  }
  if (input.colors !== undefined) {
    sets.push("colors = ?");
    values.push(JSON.stringify(input.colors));
  }
  if (sets.length > 0) {
    const db = env.DB;
    await db.batch([
      db.prepare(`UPDATE topics SET ${sets.join(", ")} WHERE id = ?`).bind(...values, id),
      logAdmin(db, user.id, "topic:edit", id),
    ]);
    forgetTopics();
  }
  return Response.json({ topic: await listed(env, id) }, { headers: NO_STORE });
}

/** Writes one site switch, so a delete can tidy the settings that pointed at the topic. */
function setting(db: D1Database, key: string, value: string, userId: string, now: number) {
  return db
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(key, value, now, userId);
}

/**
 * `DELETE /api/admin/topics/:id`: only a topic with no questions in the bank or in
 * `custom_questions`. Nothing cascades — the settings that pointed at it are tidied so a
 * future topic reusing the id doesn't inherit them.
 */
export async function deleteTopic(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env } = context;
  const id = decodeURIComponent(context.params[0] ?? "");
  if (!(await getTopics(env)).some((topic) => topic.id === id)) {
    throw new HttpError(404, "not_found", "That topic doesn’t exist.");
  }
  if (await hasQuestions(env, await loadBank(env), id)) {
    throw new HttpError(
      409,
      "topic_has_questions",
      "That topic has questions — delete them first.",
    );
  }
  const settings = await siteSettings(env);
  const db = env.DB;
  const now = Date.now();
  const writes: D1PreparedStatement[] = [db.prepare("DELETE FROM topics WHERE id = ?").bind(id)];
  const off = settings.topicsOff.filter((topicId) => topicId !== id);
  if (off.length !== settings.topicsOff.length) {
    writes.push(setting(db, "topics_off", JSON.stringify(off), user.id, now));
  }
  if (settings.quizDefaults.category === id) {
    writes.push(
      setting(
        db,
        "quiz_defaults",
        JSON.stringify({ ...settings.quizDefaults, category: DEFAULT_QUIZ_SETTINGS.category }),
        user.id,
        now,
      ),
    );
  }
  writes.push(logAdmin(db, user.id, "topic:delete", id));
  await db.batch(writes);
  forgetTopics();
  forgetSettings();
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** `PUT /api/admin/topics/:id/art`: a raw WebP body that replaces the topic's picture. */
export async function uploadTopicArt(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireAdmin(context);
  const { env } = context;
  const id = decodeURIComponent(context.params[0] ?? "");
  const current = (await getTopics(env)).find((topic) => topic.id === id);
  if (!current) throw new HttpError(404, "not_found", "That topic doesn’t exist.");
  // §8: size first (declared and actual → 413), then signature (→ 415), then
  // header parse and dimension range (→ 415). An oversize non-WebP is 413.
  const declared = Number(context.request.headers.get("Content-Length") ?? 0);
  if (declared > ART_MAX_BYTES) {
    throw new HttpError(413, "art_too_large", "That image is too big. Keep it under 400 KB.");
  }
  const bytes = new Uint8Array(await context.request.arrayBuffer());
  if (bytes.byteLength > ART_MAX_BYTES) {
    throw new HttpError(413, "art_too_large", "That image is too big. Keep it under 400 KB.");
  }
  const chunk = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length < 12 || chunk(0, 4) !== "RIFF" || chunk(8, 12) !== "WEBP") {
    throw new HttpError(415, "bad_art", "That isn’t a WebP image we can use.");
  }
  const size = webpDimensions(bytes);
  if (!size) throw new HttpError(415, "bad_art", "That WebP image’s header can’t be read.");
  if (
    size.width < ART_MIN_EDGE ||
    size.height < ART_MIN_EDGE ||
    size.width > ART_MAX_EDGE ||
    size.height > ART_MAX_EDGE
  ) {
    throw new HttpError(
      415,
      "art_too_big",
      "Images must be between 32 and 2048 pixels on each side.",
    );
  }
  const version = current.artVersion + 1;
  const db = env.DB;
  await db.batch([
    db
      .prepare("UPDATE topics SET art = ?, art_type = 'image/webp', art_version = ? WHERE id = ?")
      .bind(bytes, version, id),
    logAdmin(db, user.id, "topic:art", id),
  ]);
  forgetTopics();
  return Response.json({ version }, { headers: NO_STORE });
}
