import { DEFAULT_TOPIC_COLORS, QUIZ_CATEGORIES, type QuizDifficulty } from "@whizard/game-core";
import { useEffect, useSyncExternalStore } from "react";
import { type AdminTopicInfo, fetchAdminTopics, fetchQuizCategories } from "./api";
import { errorText } from "./ui/common";

/** One topic as the catalogue serves it: what it's called, what it looks like, how many questions. */
export interface TopicInfo {
  id: string;
  name: string;
  tagline: string;
  /** Top and bottom of the tile's colour wash. */
  colors: [string, string];
  /** Already a URL: uploaded artwork behind a version, shipped art, or the generic picture. */
  art: string;
  questions: Record<QuizDifficulty, number>;
}

/** What readers of the catalogue see: the rows, whether a fetch is on, and why the last one failed. */
export interface TopicsState<T = TopicInfo> {
  topics: T[];
  loading: boolean;
  error: string | null;
}

/** A screen's end of the catalogue: the state, plus the way to force a refetch. */
export interface TopicsView<T = TopicInfo> extends TopicsState<T> {
  reload: () => void;
}

/**
 * The two catalogues of the same topics: `public` is `GET /api/quiz/categories` — live
 * topics only, what players pick from; `admin` is `GET /api/admin/topics` — every topic
 * with the switches the admin owns, off ones included.
 */
export type CatalogueMode = "public" | "admin";

/** Where a topic's picture goes when it has none of its own. */
const GENERIC_ART = "/art/games/quiz.webp";

const counts = (): Record<QuizDifficulty, number> => ({ easy: 0, medium: 0, hard: 0 });

/** Copies one shipped row into a full topic; the shipped bank doesn't track question counts. */
function shippedInfo(id: string): TopicInfo | undefined {
  const topic = QUIZ_CATEGORIES.find((category) => category.id === id);
  if (!topic) return undefined;
  return {
    id: topic.id,
    name: topic.name,
    tagline: topic.tagline,
    colors: [topic.colors[0], topic.colors[1]],
    art: topic.art,
    questions: counts(),
  };
}

/**
 * The twelve topics that ship with the game — the whole catalogue until a fetch lands, and
 * the fallback when it can't.
 */
const shippedRows = (): TopicInfo[] => QUIZ_CATEGORIES.map((topic) => shippedInfo(topic.id)!);

/** The shipped twelve as the admin list serves them: never off, no questions counted yet. */
const shippedAdminRows = (): AdminTopicInfo[] =>
  QUIZ_CATEGORIES.map((topic, index) => ({
    id: topic.id,
    name: topic.name,
    tagline: topic.tagline,
    colors: [topic.colors[0], topic.colors[1]],
    sortOrder: index,
    art: topic.art,
    artVersion: 0,
    off: false,
    questionCount: 0,
  }));

/** One mode's catalogue in memory: its rows, its fetch status, and who is waiting on it. */
interface Cache<T> {
  topics: T[];
  loading: boolean;
  error: string | null;
  /** A fetch has run to completion (any outcome); only `invalidateTopics` starts the next one. */
  settled: boolean;
  fetching: boolean;
  /** Bumped when the cache clears, so a fetch still in flight can't answer for the new one. */
  generation: number;
  snapshot: TopicsState<T>;
  listeners: Set<() => void>;
  queued: boolean;
}

function makeCache<T>(fallback: () => T[]): Cache<T> {
  const topics = fallback();
  return {
    topics,
    loading: false,
    error: null,
    settled: false,
    fetching: false,
    generation: 0,
    snapshot: { topics, loading: false, error: null },
    listeners: new Set(),
    queued: false,
  };
}

/** The two catalogues, kept apart: separate rows, separate fetches, separate subscribers. */
const caches = {
  public: makeCache(shippedRows),
  admin: makeCache(shippedAdminRows),
};

/**
 * Rebuilds the snapshot and wakes every subscriber. Coalesced to the next microtask because a
 * label read can happen halfway through a render, and components must not update mid-render.
 */
function publish<T>(cache: Cache<T>): void {
  if (cache.queued) return;
  cache.queued = true;
  queueMicrotask(() => {
    cache.queued = false;
    cache.snapshot = { topics: cache.topics, loading: cache.loading, error: cache.error };
    for (const listener of [...cache.listeners]) listener();
  });
}

/** Starts one mode's shared fetch when its cache is stale and nothing is already fetching. */
function ensureLoaded<T>(
  cache: Cache<T>,
  fetchRows: () => Promise<T[]>,
  fallback: () => T[],
): void {
  if (cache.settled || cache.fetching) return;
  const mine = ++cache.generation;
  cache.fetching = true;
  cache.loading = true;
  publish(cache);
  fetchRows().then(
    (rows) => {
      if (mine !== cache.generation) return;
      cache.topics = rows;
      cache.loading = false;
      cache.fetching = false;
      cache.settled = true;
      cache.error = null;
      publish(cache);
    },
    (cause: unknown) => {
      if (mine !== cache.generation) return;
      // Failure mode keeps the shipped rows only — live rows are never half-applied.
      cache.topics = fallback();
      cache.loading = false;
      cache.fetching = false;
      cache.settled = true;
      cache.error = errorText(cause);
      publish(cache);
    },
  );
}

/** Drops one mode's cached catalogue so its next read fetches it again. */
function invalidate<T>(cache: Cache<T>, fallback: () => T[]): void {
  cache.generation++;
  cache.topics = fallback();
  cache.loading = false;
  cache.error = null;
  cache.settled = false;
  cache.fetching = false;
  publish(cache);
}

const ensurePublic = (): void => ensureLoaded(caches.public, fetchQuizCategories, shippedRows);
const ensureAdmin = (): void => ensureLoaded(caches.admin, fetchAdminTopics, shippedAdminRows);

/**
 * Loads (or reuses) one mode's catalogue without subscribing — the read path's kick, and
 * what a test calls to drive a refetch after `invalidateTopics()`.
 */
export function ensureTopics(mode: CatalogueMode): void {
  if (mode === "admin") ensureAdmin();
  else ensurePublic();
}

/**
 * Drops both cached catalogues so the next read fetches them again — call this after
 * editing topics. `useTopics().reload()` is this; the public and admin lists move together.
 */
export function invalidateTopics(): void {
  invalidate(caches.public, shippedRows);
  invalidate(caches.admin, shippedAdminRows);
}

/** A topic in the live public catalogue, else the shipped constant, else nothing at all. */
export function topicInfo(id: string): TopicInfo | undefined {
  ensurePublic();
  return caches.public.topics.find((topic) => topic.id === id) ?? shippedInfo(id);
}

/** What a topic is called: live name, shipped name, then the id itself (never throws). */
export function topicName(id: string): string {
  return topicInfo(id)?.name ?? id;
}

/** A topic's colours and picture: live, shipped, then the generic defaults. */
export function topicStyle(id: string): { colors: [string, string]; art: string } {
  const info = topicInfo(id);
  if (info) return { colors: info.colors, art: info.art };
  const [top, bottom] = DEFAULT_TOPIC_COLORS;
  return { colors: [top, bottom], art: GENERIC_ART };
}

/** A topic's picture URL, already resolved by the catalogue. */
export const artSrc = (info: Pick<TopicInfo, "art">): string => info.art;

/** Where a component subscribes to a catalogue; the first subscriber starts its fetch. */
export function subscribeTopics(mode: CatalogueMode, listener: () => void): () => void {
  const cache = caches[mode];
  cache.listeners.add(listener);
  ensureTopics(mode);
  return () => {
    cache.listeners.delete(listener);
  };
}

/** One mode's snapshot, stable between changes — the `getSnapshot` half of `useSyncExternalStore`. */
export function getTopicsState(mode: "public"): TopicsState<TopicInfo>;
export function getTopicsState(mode: "admin"): TopicsState<AdminTopicInfo>;
export function getTopicsState(
  mode: CatalogueMode,
): TopicsState<TopicInfo> | TopicsState<AdminTopicInfo> {
  return caches[mode].snapshot;
}

/** Stable per-mode seams, so `useSyncExternalStore` sees the same functions each render. */
const SUBSCRIBERS: Record<CatalogueMode, (listener: () => void) => () => void> = {
  public: (listener) => subscribeTopics("public", listener),
  admin: (listener) => subscribeTopics("admin", listener),
};

const SNAPSHOTS: Record<CatalogueMode, () => TopicsState<TopicInfo | AdminTopicInfo>> = {
  public: () => getTopicsState("public"),
  admin: () => getTopicsState("admin"),
};

/**
 * The catalogue for a screen: `useTopics()` (or `useTopics("public")`) is the public list
 * players pick from, `useTopics("admin")` is the admin list — every topic, off ones
 * included. Each is fetched once for the whole app, refetched after `invalidateTopics()`,
 * and falls back to the shipped topics when its fetch fails.
 */
export function useTopics(mode?: "public"): TopicsView<TopicInfo>;
export function useTopics(mode: "admin"): TopicsView<AdminTopicInfo>;
export function useTopics(mode: CatalogueMode = "public"): TopicsView<TopicInfo | AdminTopicInfo> {
  const state = useSyncExternalStore(SUBSCRIBERS[mode], SNAPSHOTS[mode], SNAPSHOTS[mode]);
  // A render after `invalidateTopics` is where a stale cache gets refilled.
  useEffect(() => {
    ensureTopics(mode);
  });
  return { ...state, reload: invalidateTopics };
}
