import { QUIZ_CATEGORIES } from "@whizard/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AdminTopicInfo } from "./api";
import {
  ensureTopics,
  getTopicsState,
  invalidateTopics,
  subscribeTopics,
  topicName,
  topicStyle,
  type TopicInfo,
} from "./topics";

/** Lets the fetch mock, its handlers and the coalesced publish all run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const row = (id: string, name: string): TopicInfo => ({
  id,
  name,
  tagline: "A topic admins added",
  colors: ["#123456", "#654321"],
  art: `/art/topics/${id}.webp`,
  questions: { easy: 3, medium: 2, hard: 1 },
});

/** One row as `GET /api/admin/topics` serves it: the admin fields, off switch included. */
const adminRow = (id: string, name: string, off: boolean): AdminTopicInfo => ({
  id,
  name,
  tagline: "A topic admins added",
  colors: ["#123456", "#654321"],
  sortOrder: 3,
  art: `/art/topics/${id}.webp`,
  artVersion: 0,
  off,
  questionCount: 7,
});

/** Answers each catalogue fetch from its own endpoint, so one mock serves both modes. */
function servesBoth(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === "/api/admin/topics") {
      return {
        ok: true,
        json: async () => ({
          topics: [adminRow("mars", "Mars Colony", false), adminRow("bible", "Bible", true)],
        }),
      };
    }
    return { ok: true, json: async () => ({ categories: [row("mars", "Mars Colony")] }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Serves the next catalogue fetch with these rows, clearing the store first. */
function serves(rows: TopicInfo[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ categories: rows }) })),
  );
  invalidateTopics();
}

/** Makes the next catalogue fetch fail, clearing the store first. */
function refuses(status = 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status, json: async () => ({}) })),
  );
  invalidateTopics();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the live topic catalogue", () => {
  it("topicName prefers the live catalogue", async () => {
    serves([row("mars", "Mars Colony")]);
    topicName("mars"); // The first read starts the one shared fetch.
    await flush();

    expect(topicName("mars")).toBe("Mars Colony");
    expect(topicName("no-such-topic")).toBe("no-such-topic");
    // A shipped topic the live rows don't list still reads from the shipped constant.
    expect(topicName("bible")).toBe("Bible");

    // A failed fetch falls back to the shipped list alone — live rows are never kept.
    refuses();
    topicName("mars");
    await flush();

    expect(topicName("mars")).toBe("mars");
    expect(topicName("bible")).toBe("Bible");
  });

  it("topicStyle falls back without merging", async () => {
    refuses(503);
    topicStyle("bible"); // The read starts the fetch that fails.
    await flush();

    expect(topicStyle("bible")).toEqual({
      colors: ["#ffb52c", "#5a2014"],
      art: "/art/topics/bible.webp",
    });
    expect(topicStyle("never-heard-of-it")).toEqual({
      colors: ["#6d5bff", "#1a1747"],
      art: "/art/games/quiz.webp",
    });

    // A successful fetch replaces the list outright: no shipped rows are appended.
    serves([row("mars", "Mars Colony")]);
    topicStyle("mars");
    await flush();

    expect(getTopicsState("public").topics.map((topic) => topic.id)).toEqual(["mars"]);
    expect(topicStyle("mars")).toEqual({
      colors: ["#123456", "#654321"],
      art: "/art/topics/mars.webp",
    });
  });

  it("useTopics surfaces loading and error", async () => {
    let answer: ((response: { ok: boolean; status: number }) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
    );
    invalidateTopics();
    const unsubscribe = subscribeTopics("public", () => {});
    await flush();

    expect(getTopicsState("public").loading).toBe(true);
    expect(getTopicsState("public").error).toBeNull();

    answer!({ ok: false, status: 500 });
    await flush();

    const failed = getTopicsState("public");
    expect(failed.loading).toBe(false);
    expect(failed.error).toBe("Could not load categories (500)");
    expect(failed.topics.map((topic) => topic.id)).toEqual(QUIZ_CATEGORIES.map((c) => c.id));

    // `reload()` is `invalidateTopics()`: the cache clears, and the next read refetches.
    serves([row("mars", "Mars Colony")]);
    topicName("mars");
    await flush();

    expect(getTopicsState("public").error).toBeNull();
    expect(topicName("mars")).toBe("Mars Colony");
    unsubscribe();
  });

  it("admin mode fetches the admin catalogue and includes off topics", async () => {
    const fetchMock = servesBoth();
    invalidateTopics();

    topicName("mars"); // Loads the public catalogue first.
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/quiz/categories");
    expect(topicName("mars")).toBe("Mars Colony");

    const unsubscribe = subscribeTopics("admin", () => {});
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/topics");
    const admin = getTopicsState("admin");
    expect(admin.loading).toBe(false);
    expect(admin.error).toBeNull();
    // Off topics are part of the admin list; the public endpoint never includes them.
    expect(admin.topics.map((topic) => topic.off)).toEqual([false, true]);
    // Separate caches: the admin rows never bleed into the public one.
    expect(getTopicsState("public").topics.map((topic) => topic.id)).toEqual(["mars"]);
    unsubscribe();
  });

  it("invalidateTopics forces a refetch in both modes", async () => {
    const fetchMock = servesBoth();
    invalidateTopics();

    ensureTopics("public");
    ensureTopics("admin");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    invalidateTopics();
    ensureTopics("public");
    ensureTopics("admin");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(getTopicsState("public").topics.map((topic) => topic.name)).toEqual(["Mars Colony"]);
    expect(getTopicsState("admin").topics.map((topic) => topic.off)).toEqual([false, true]);
  });
});
