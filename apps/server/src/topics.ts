import { questionCounts, type QuestionCounts } from "@whizard/content";
import { QUIZ_CATEGORIES, type QuizDifficulty } from "@whizard/game-core";
import type { Bank } from "./bank";
import type { Env } from "./env";
import { outOfPlay } from "./reports";
import { siteSettings } from "./settings";

/** A topic as every caller sees it: a row of the table, or its shipped fallback twin. */
export interface TopicRow {
  id: string;
  name: string;
  tagline: string;
  colors: readonly [string, string];
  sortOrder: number;
  hasArt: boolean;
  artVersion: number;
}

/** How long a Worker keeps the catalogue. Mutations cut it short with `forgetTopics`. */
const CACHE_MS = 15_000;
let cached: { at: number; rows: TopicRow[] } | null = null;

/** Drops the cached catalogue, so the next read sees an admin's changes. */
export function forgetTopics(): void {
  cached = null;
}

interface TopicDbRow {
  id: string;
  name: string;
  tagline: string;
  colors: string;
  sort_order: number;
  has_art: number | boolean;
  art_version: number;
}

const CATALOGUE_QUERY = `SELECT id, name, tagline, colors, sort_order, art IS NOT NULL AS has_art, art_version
  FROM topics ORDER BY sort_order`;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const isColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR.test(value);

/** A row's colours as the pair they must be, or null when they aren't one. */
function colorsOf(value: string): readonly [string, string] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2 || !parsed.every(isColor)) return null;
  // Narrowed above: an array of exactly two `#rrggbb` strings.
  return parsed as unknown as readonly [string, string];
}

/** A usable row, or null when its colours can't be trusted — such rows are dropped, not fixed. */
function fromRow(row: TopicDbRow): TopicRow | null {
  const colors = colorsOf(row.colors);
  if (!colors) return null;
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    colors,
    sortOrder: row.sort_order,
    hasArt: Boolean(row.has_art),
    artVersion: row.art_version,
  };
}

/** The shipped twelve in their shipped order: all of it, or none of it. */
function fallbackTopics(): TopicRow[] {
  return QUIZ_CATEGORIES.map((category, index) => ({
    id: category.id,
    name: category.name,
    tagline: category.tagline,
    colors: category.colors,
    sortOrder: index + 1,
    hasArt: false,
    artVersion: 0,
  }));
}

/**
 * The live topic catalogue, ordered by `sort_order`. All or nothing: when the table can't be
 * read, or holds no row whose colours parse, games get the whole shipped twelve instead of a
 * mix the two sources never agreed on. The fallback isn't cached — a database that comes back
 * serves real rows on the next read.
 */
export async function getTopics(env: Env): Promise<TopicRow[]> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.rows;
  let rows: TopicRow[];
  try {
    const { results } = await env.DB.prepare(CATALOGUE_QUERY).all<TopicDbRow>();
    rows = results.flatMap((row) => fromRow(row) ?? []);
  } catch (error) {
    console.error("Couldn’t read the topic catalogue", error);
    return fallbackTopics();
  }
  if (rows.length === 0) {
    console.error("The topics table held no usable rows");
    return fallbackTopics();
  }
  cached = { at: now, rows };
  return rows;
}

/** Whether `id` names one of the given topics. Membership is a catalogue check, not a shape one. */
export function isKnown(topics: readonly { id: string }[], id: string): boolean {
  return topics.some((topic) => topic.id === id);
}

/** A name as its id: lowercase, hyphenated, ≤ 40 characters, or `topic` when nothing's left. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "topic";
}

/** The first id nobody has taken for this name: `biology`, then `biology-2`, `biology-3`, … */
export async function nextSlug(env: Env, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = suffix ? `${base.slice(0, 40 - suffix.length)}${suffix}` : base;
    const row = await env.DB.prepare(`SELECT EXISTS(SELECT 1 FROM topics WHERE id = ?) AS "exists"`)
      .bind(candidate)
      .first<{ exists: number }>();
    if (!row?.exists) return candidate;
  }
}

/**
 * Whether either source holds a question for `id`: the shipped bank with the admin's edits, or
 * a row of `custom_questions`. Both count, so a topic never looks deletable while content
 * remains anywhere — even content the schema would drop from the bank.
 */
export async function hasQuestions(env: Env, bank: Bank, id: string): Promise<boolean> {
  if (bank.questions.some((question) => question.category === id)) return true;
  const row = await env.DB.prepare(
    `SELECT EXISTS(SELECT 1 FROM custom_questions WHERE category = ?) AS "exists"`,
  )
    .bind(id)
    .first<{ exists: number }>();
  return Boolean(row?.exists);
}

/** What a topic still plays, per level: the bank minus the questions taken out of play. */
export function playableCounts(bank: Bank, out: ReadonlySet<string>): QuestionCounts {
  return questionCounts(bank.questions.filter((question) => !out.has(question.id)));
}

/** A catalogue entry as the public endpoint serves it: exactly the six fields clients need. */
export interface PublicTopic {
  id: string;
  name: string;
  tagline: string;
  colors: readonly [string, string];
  art: string;
  questions: Record<QuizDifficulty, number>;
}

/**
 * Where a topic's picture comes from: its uploaded bytes behind a versioned URL (a replace
 * bumps `art_version`, so no client keeps a stale tile), the artwork that ships with the
 * site, or the generic image for a topic with neither.
 */
export function artUrl(topic: TopicRow): string {
  if (topic.hasArt) return `/api/topics/${topic.id}/art?v=${topic.artVersion}`;
  return (
    QUIZ_CATEGORIES.find((category) => category.id === topic.id)?.art ?? "/art/games/quiz.webp"
  );
}

/**
 * `GET /api/quiz/categories`: the live catalogue in `sort_order`, minus the topics an admin
 * turned off, each with its artwork URL and how many questions it can still play. One pass
 * per request reads settings and out-of-play questions alongside the (cached) catalogue.
 */
export async function categoriesPayload(
  env: Env,
  bank: Bank,
): Promise<{ categories: PublicTopic[] }> {
  const [topics, settings, out] = await Promise.all([
    getTopics(env),
    siteSettings(env),
    outOfPlay(env, bank),
  ]);
  const counts = playableCounts(bank, new Set(out.keys()));
  const categories = topics
    .filter((topic) => !settings.topicsOff.includes(topic.id))
    .map((topic) => ({
      id: topic.id,
      name: topic.name,
      tagline: topic.tagline,
      colors: topic.colors,
      art: artUrl(topic),
      questions: counts[topic.id] ?? { easy: 0, medium: 0, hard: 0 },
    }));
  return { categories };
}

/** How many questions admins have filed under each topic — the admin list's custom counts. */
export async function customCounts(env: Env): Promise<Map<string, number>> {
  const { results } = await env.DB.prepare(
    "SELECT category, COUNT(*) AS count FROM custom_questions GROUP BY category",
  ).all<{ category: string; count: number }>();
  return new Map(results.map((row) => [row.category, row.count]));
}

/** What serving a topic's art comes to: its bytes, a redirect to static art, or no such topic. */
export type TopicArt =
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "redirect"; location: string }
  | { kind: "unknown" };

/** A stored blob as bytes a Response body wants, or null when it isn't bytes at all. */
function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

/**
 * `GET /api/topics/:id/art`: the uploaded WebP when there is one, a redirect to the artwork
 * that ships when there isn't, and `unknown` only for an id in neither the catalogue nor the
 * table — a topic that exists but has no art still redirects, so client images never 404.
 */
export async function topicArt(env: Env, id: string): Promise<TopicArt> {
  if (!isKnown(await getTopics(env), id)) return { kind: "unknown" };
  let stored: unknown = null;
  try {
    const row = await env.DB.prepare("SELECT art FROM topics WHERE id = ?").bind(id).first();
    stored = row?.art ?? null;
  } catch (error) {
    console.error("Couldn't read the topic's artwork", error);
  }
  const bytes = asBytes(stored);
  if (bytes) return { kind: "bytes", bytes };
  const shipped = QUIZ_CATEGORIES.find((category) => category.id === id)?.art;
  return { kind: "redirect", location: shipped ?? "/art/games/quiz.webp" };
}
