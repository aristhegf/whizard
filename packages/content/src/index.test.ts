import { QUIZ_CATEGORIES, QUIZ_DIFFICULTIES } from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { QUESTIONS, QUESTION_FILES, drawQuestions, questionCounts } from "./index";
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
    expect(drawQuestions("bible", "easy", 10, 1, [])).toEqual([]);
  });
});
