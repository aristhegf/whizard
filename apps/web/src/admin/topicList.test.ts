import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminTopicInfo } from "../api";
import { changeSet, removeTopic, topicRows } from "./topicList";

/** One row of `GET /api/admin/topics`, with everything the list shows. */
const row = (over: Partial<AdminTopicInfo> = {}): AdminTopicInfo => ({
  id: "mars",
  name: "Mars Colony",
  tagline: "Everything about Mars",
  colors: ["#123456", "#654321"],
  sortOrder: 1,
  art: "/art/topics/mars.webp",
  artVersion: 0,
  off: false,
  questionCount: 0,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the admin topic list", () => {
  it("spells out every topic's question count", () => {
    const rows = topicRows([
      row(),
      row({ id: "venus", questionCount: 1 }),
      row({ id: "jupiter", questionCount: 4200 }),
    ]);

    expect(rows.map((r) => r.countLabel)).toEqual([
      "No questions",
      "1 question",
      "4,200 questions",
    ]);
  });

  it("offers delete only on a topic with no questions, and says why not when there are", () => {
    const [empty, withQuestions] = topicRows([row(), row({ id: "venus", questionCount: 3 })]);

    expect(empty!.canDelete).toBe(true);
    expect(empty!.deleteNote).toBeNull();
    expect(withQuestions!.canDelete).toBe(false);
    expect(withQuestions!.deleteNote).toBe("Has questions");
  });

  it("carries the off switch through so the row can badge it", () => {
    expect(topicRows([row({ off: true })])[0]!.topic.off).toBe(true);
    expect(topicRows([row()])[0]!.topic.off).toBe(false);
  });
});

describe("deleting a topic", () => {
  it("has nothing to report when the delete went through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 204, text: async () => "", json: async () => ({}) })),
    );

    await expect(removeTopic("mars")).resolves.toBeNull();
  });

  it("keeps the server's refusal message for the row to show inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: { message: "That topic has questions — delete them first." } }),
      })),
    );

    await expect(removeTopic("mars")).resolves.toBe(
      "That topic has questions — delete them first.",
    );
  });
});

describe("editing a topic", () => {
  const draft = (
    over: Partial<{ name: string; tagline: string; colors: [string, string] }> = {},
  ) => ({
    name: "Mars Colony",
    tagline: "Everything about Mars",
    colors: ["#123456", "#654321"] as [string, string],
    ...over,
  });

  it("sends only the fields that moved, and never the id", () => {
    const before = row();

    expect(changeSet(before, draft({ name: "Mars" }))).toEqual({ name: "Mars" });
    expect(changeSet(before, draft({ tagline: "Red dust, everywhere" }))).toEqual({
      tagline: "Red dust, everywhere",
    });
    expect(changeSet(before, draft({ colors: ["#000000", "#ffffff"] }))).toEqual({
      colors: ["#000000", "#ffffff"],
    });

    // The id is not something an edit can carry, whatever the draft says.
    expect("id" in changeSet(before, draft({ name: "Mars" }))).toBe(false);
  });

  it("has nothing to send when nothing changed", () => {
    const before = row();

    expect(
      changeSet(before, { name: before.name, tagline: before.tagline, colors: before.colors }),
    ).toEqual({});
  });
});
