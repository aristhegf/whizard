import { describe, expect, it } from "vitest";
import { knockoutLevelPlan, SPARE_QUESTIONS } from "./knockout/knockout";
import { autoMix, levelPlan, splitCount, type Level } from "./levels";

/** A plan as round-by-round counts, e.g. "E2 M1". */
function stages(levels: Level[], sizes: number[]): string[] {
  let at = 0;
  return sizes.map((size) => {
    const part = levels.slice(at, (at += size));
    const n = (level: Level) => part.filter((l) => l === level).length;
    return (["easy", "medium", "hard"] as const)
      .filter((l) => n(l) > 0)
      .map((l) => `${l[0]!.toUpperCase()}${n(l)}`)
      .join(" ");
  });
}

describe("Auto's blend", () => {
  it("starts all easy, ends all hard, and always adds up", () => {
    expect(autoMix(0)).toEqual([1, 0, 0]);
    expect(autoMix(1)).toEqual([0, 0, 1]);
    expect(autoMix(0.5)).toEqual([0.25, 0.5, 0.25]);
    for (let p = 0; p <= 1; p += 0.05) {
      const [easy, medium, hard] = autoMix(p);
      expect(easy + medium + hard).toBeCloseTo(1);
    }
  });

  it("splits a round into whole questions that add up, ties going harder", () => {
    expect(splitCount(3, autoMix(1 / 6))).toEqual([2, 1, 0]);
    expect(splitCount(2, [0.25, 0.5, 0.25])).toEqual([0, 1, 1]);
    for (let n = 1; n <= 7; n++) {
      for (let p = 0; p <= 1; p += 0.1) {
        expect(splitCount(n, autoMix(p)).reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });
});

describe("level plans", () => {
  it("keeps a fixed level throughout", () => {
    expect(levelPlan("hard", 4)).toEqual(["hard", "hard", "hard", "hard"]);
    expect(knockoutLevelPlan("easy", 8, 10)).toEqual(Array(10 + SPARE_QUESTIONS).fill("easy"));
  });

  it("climbs from easy to hard in five stages when played straight through", () => {
    const plan = levelPlan("auto", 10);
    expect(stages(plan, [2, 2, 2, 2, 2])).toEqual(["E2", "E1 M1", "M1 H1", "M1 H1", "H2"]);
  });

  it("blends each knock-out round, with a hard final and hard spares", () => {
    // 20 players, 20 questions: six rounds (3, 3, 3, 3, 3, 2) and a final of 3.
    const plan = knockoutLevelPlan("auto", 20, 20);
    expect(plan).toHaveLength(20 + SPARE_QUESTIONS);
    expect(stages(plan, [3, 3, 3, 3, 3, 2, 3, SPARE_QUESTIONS])).toEqual([
      "E3",
      "E2 M1",
      "E1 M2",
      "E1 M1 H1",
      "M2 H1",
      "M1 H1",
      "H3",
      `H${SPARE_QUESTIONS}`,
    ]);
    // 5 players, 10 questions: three rounds (3, 2, 2) and the final.
    expect(stages(knockoutLevelPlan("auto", 5, 10), [3, 2, 2, 3])).toEqual([
      "E3",
      "E1 M1",
      "M1 H1",
      "H3",
    ]);
  });
});
