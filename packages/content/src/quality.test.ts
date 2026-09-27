import { describe, expect, it } from "vitest";
import { findDuplicate, isDuplicate, normalize, problemsWith, similarity } from "./quality";
import type { StoredQuestion } from "./schema";

const q = (
  prompt: string,
  choices: string[],
  extra: Partial<StoredQuestion> = {},
): StoredQuestion => ({
  id: "x",
  category: "geography",
  topic: "Test",
  difficulty: "easy",
  prompt,
  choices,
  explanation: "Because.",
  ...extra,
});

describe("normalize", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalize("  King Sunny Adé! ")).toBe("king sunny ade");
  });
});

describe("similarity", () => {
  it("is 1 for identical text and low for unrelated text", () => {
    expect(similarity("Which river flows through Cairo?", "which river flows through cairo")).toBe(
      1,
    );
    expect(
      similarity("Which river flows through Cairo?", "Who painted the Mona Lisa?"),
    ).toBeLessThan(0.2);
  });
});

describe("isDuplicate", () => {
  it("catches a reworded question with the same answer", () => {
    const a = q("Which river flows through Cairo?", ["The Nile", "b", "c", "d"]);
    const b = q("Which river flows through the city of Cairo?", ["The Nile", "e", "f", "g"]);
    expect(isDuplicate(a, b)).toBe(true);
  });

  it("keeps similar questions with different answers", () => {
    const a = q("Which river flows through Cairo?", ["The Nile", "b", "c", "d"]);
    const b = q("Which river flows through Baghdad?", ["The Tigris", "b", "c", "d"]);
    expect(isDuplicate(a, b)).toBe(false);
  });

  it("only compares within a category", () => {
    const a = q("Which river flows through Cairo?", ["The Nile", "b", "c", "d"]);
    const b = { ...a, category: "history" as const };
    expect(findDuplicate(a, [b])).toBeUndefined();
    expect(findDuplicate(a, [{ ...a, id: "y" }])).toBeDefined();
  });
});

describe("problemsWith", () => {
  it("accepts a good question", () => {
    expect(
      problemsWith(q("Which river flows through Cairo?", ["The Nile", "Congo", "Niger", "Volta"])),
    ).toEqual([]);
  });

  it("rejects repeated choices", () => {
    expect(problemsWith(q("Pick one", ["Nile", "nile!", "Congo", "Volta"]))).toContain(
      "choices are not all different",
    );
  });

  it("rejects an answer that's given away in the prompt", () => {
    expect(
      problemsWith(q("Is the Nile the river through Cairo?", ["Nile", "Congo", "Niger", "Volta"])),
    ).toContain("the answer appears in the prompt");
  });

  it("requires a verse reference for Bible questions", () => {
    const bible = q("Who built the ark?", ["Noah", "Moses", "Abraham", "Jonah"], {
      category: "bible",
    });
    expect(problemsWith(bible)).toContain("Bible questions need a verse reference");
    expect(problemsWith({ ...bible, reference: "Genesis 6:14" })).toEqual([]);
  });
});
