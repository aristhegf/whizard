import { describe, expect, it } from "vitest";
import { QUESTIONS, drawQuestions, questionCounts } from "./index";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

describe("question bank", () => {
  it("has unique ids", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no repeated prompts", () => {
    const prompts = QUESTIONS.map((q) => normalize(q.prompt));
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("gives every question four distinct choices", () => {
    for (const q of QUESTIONS) {
      expect(new Set(q.choices.map(normalize)).size, q.id).toBe(4);
    }
  });

  it("never puts the answer in the question", () => {
    for (const q of QUESTIONS) {
      const answer = normalize(q.choices[0]!);
      expect(` ${normalize(q.prompt)} `.includes(` ${answer} `), q.id).toBe(false);
    }
  });

  it("has enough Bible questions for the longest game at every difficulty", () => {
    const bible = questionCounts().bible!;
    expect(bible.easy).toBeGreaterThanOrEqual(20);
    expect(bible.medium).toBeGreaterThanOrEqual(20);
    expect(bible.hard).toBeGreaterThanOrEqual(20);
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

  it("returns what it has when a category is short", () => {
    expect(drawQuestions("football", "easy", 10, 1)).toEqual([]);
  });
});
