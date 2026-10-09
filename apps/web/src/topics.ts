import { DEFAULT_TOPIC_COLORS, QUIZ_CATEGORIES, type QuizDifficulty } from "@whizard/game-core";
import { useEffect, useSyncExternalStore } from "react";
import { fetchQuizCategories } from "./api";
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
export interface TopicsState {
  topics: TopicInfo[];
  loading: boolean;
  error: string | null;
}

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

let topics = shippedRows();
let loading = false;
let error: string | null = null;
/** A fetch has run to completion (any outcome); only `invalidateTopics` starts the next one. */
let settled = false;
let fetching = false;
/** Bumped when the cache clears, so a fetch still in flight can't answer for the new one. */
let generation = 0;
let snapshot: TopicsState = { topics, loading, error };
const listeners = new Set<() => void>();
let queued = false;

/**
 * Rebuilds the snapshot and wakes every subscriber. Coalesced to the next microtask because a
 * label read can happen halfway through a render, and components must not update mid-render.
 */
function publish(): void {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    snapshot = { topics, loading, error };
    for (const listener of [...listeners]) listener();
  });
}

/** Starts the one shared fetch when the cache is stale and nothing is already fetching. */
function ensureLoaded(): void {
  if (settled || fetching) return;
  const mine = ++generation;
  fetching = true;
  loading = true;
  publish();
  fetchQuizCategories().then(
    (rows) => {
      if (mine !== generation) return;
      topics = rows;
      loading = false;
      fetching = false;
      settled = true;
      error = null;
      publish();
    },
    (cause: unknown) => {
      if (mine !== generation) return;
      // Failure mode keeps the shipped rows only — live rows are never half-applied.
      topics = shippedRows();
      loading = false;
      fetching = false;
      settled = true;
      error = errorText(cause);
      publish();
    },
  );
}

/**
 * Drops the cached catalogue so the next read fetches it again — call this after editing
 * topics. `useTopics().reload()` is this.
 */
export function invalidateTopics(): void {
  generation++;
  topics = shippedRows();
  loading = false;
  error = null;
  settled = false;
  fetching = false;
  publish();
}

/** A topic in the live catalogue, else the shipped constant, else nothing at all. */
export function topicInfo(id: string): TopicInfo | undefined {
  ensureLoaded();
  return topics.find((topic) => topic.id === id) ?? shippedInfo(id);
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

/** Where a component subscribes to the catalogue; the first subscriber starts the fetch. */
export function subscribeTopics(listener: () => void): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

/** The snapshot, stable between changes — the `getSnapshot` half of `useSyncExternalStore`. */
export function getTopicsState(): TopicsState {
  return snapshot;
}

/**
 * The catalogue for a screen: fetched once for the whole app, refetched after
 * `invalidateTopics()`, falling back to the shipped topics when the fetch fails.
 */
export function useTopics(): {
  topics: TopicInfo[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const state = useSyncExternalStore(subscribeTopics, getTopicsState, getTopicsState);
  // A render after `invalidateTopics` is where a stale cache gets refilled.
  useEffect(() => {
    ensureLoaded();
  });
  return { ...state, reload: invalidateTopics };
}
