import { QUIZ_CATEGORIES, QUIZ_DIFFICULTIES } from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  QUESTION_FILES,
  drawQuestions,
  findQuestion,
  questionCounts,
  questionVersion,
} from "./index";
import { isDuplicate, problemsWith } from "./quality";

/** Enough for the longest game (20 questions) at every level. */
const MIN_PER_LEVEL = 20;

describe("question bank", () => {
  it("has a file for every category, holding only that category", () => {
    for (const { id } of QUIZ_CATEGORIES) {
      const file = QUESTION_FILES[id] as { category: string; id: string }[];
      expect(file.length, id).toBeGreaterThan(0);
      for (const question of file) {
        expect(question.category, question.id).toBe(id);
        expect(question.id.startsWith(`${id}-`), question.id).toBe(true);
      }
    }
  });

  it("has unique ids", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("passes every quality check", () => {
    const failures = QUESTIONS.flatMap((q) => problemsWith(q).map((p) => `${q.id}: ${p}`));
    expect(failures).toEqual([]);
  });

  it("has no duplicate questions within a category", () => {
    const duplicates: string[] = [];
    QUESTIONS.forEach((a, i) => {
      for (const b of QUESTIONS.slice(i + 1)) {
        if (a.category === b.category && isDuplicate(a, b)) duplicates.push(`${a.id} ~ ${b.id}`);
      }
    });
    expect(duplicates).toEqual([]);
  });

  it("has enough questions for a full game at every level of every category", () => {
    const counts = questionCounts();
    for (const { id } of QUIZ_CATEGORIES) {
      for (const level of QUIZ_DIFFICULTIES) {
        expect(counts[id]?.[level] ?? 0, `${id} ${level}`).toBeGreaterThanOrEqual(MIN_PER_LEVEL);
      }
    }
  });
});

describe("drawQuestions", () => {
  it("draws the requested number from the right pool", () => {
    const drawn = drawQuestions("bible", "medium", 10, 1);
    expect(drawn).toHaveLength(10);
    expect(drawn.every((q) => q.category === "bible" && q.difficulty === "medium")).toBe(true);
    expect(new Set(drawn.map((q) => q.id)).size).toBe(10);
  });

  it("is repeatable for a seed and varies between seeds", () => {
    const ids = (seed: number) => drawQuestions("bible", "easy", 10, seed).map((q) => q.id);
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
  });

  it("returns what it has when a pool is short", () => {
    expect(drawQuestions("bible", "easy", 10, 1, {}, [])).toEqual([]);
  });
});

describe("avoiding repeats", () => {
  const pool = QUESTIONS.filter((q) => q.category === "geography" && q.difficulty === "easy");
  const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

  it("doesn't repeat a room's questions until the pool runs out", () => {
    const first = ids(drawQuestions("geography", "easy", 10, 1));
    const second = ids(drawQuestions("geography", "easy", 10, 2, { recent: first }));
    expect(second.filter((id) => first.includes(id))).toEqual([]);

    // The pool has 20, so a third game has to reuse some: the oldest ones first.
    const third = ids(drawQuestions("geography", "easy", 15, 3, { recent: [...second, ...first] }));
    expect(third.filter((id) => second.includes(id))).toHaveLength(5);
    expect(first.every((id) => third.includes(id))).toBe(true);
  });

  it("prefers questions fewer players have seen, then the ones seen longest ago", () => {
    const seen = new Map(
      pool.map((q, i) => [q.id, { players: i < 10 ? 2 : 1, lastSeenAt: i }] as const),
    );
    const drawn = ids(drawQuestions("geography", "easy", 12, 4, { seen }));
    const once = pool.slice(10).map((q) => q.id);
    expect(once.every((id) => drawn.includes(id))).toBe(true);
    // The two seen by both players are the two seen longest ago.
    expect(drawn.filter((id) => !once.includes(id)).sort()).toEqual(
      [pool[0]!.id, pool[1]!.id].sort(),
    );
  });

  it("leaves out retired questions", () => {
    const retired = new Set(pool.slice(0, 5).map((q) => q.id));
    const drawn = ids(drawQuestions("geography", "easy", 20, 5, { retired }));
    expect(drawn).toHaveLength(15);
    expect(drawn.some((id) => retired.has(id))).toBe(false);
  });
});

describe("question versions", () => {
  it("changes when the wording or answers change, and only then", () => {
    const q = findQuestion("bible-001")!;
    expect(questionVersion(q)).toMatch(/^[0-9a-f]{8}$/);
    expect(questionVersion({ ...q })).toBe(questionVersion(q));
    expect(questionVersion({ ...q, prompt: q.prompt + "?" })).not.toBe(questionVersion(q));
    expect(questionVersion({ ...q, choices: [...q.choices].reverse() })).not.toBe(
      questionVersion(q),
    );
  });
});
