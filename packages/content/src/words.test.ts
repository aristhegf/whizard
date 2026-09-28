import { levelPlan, WORD_LEVELS } from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { drawWords, WORDS } from "./index";

/** Three of the longest games' worth of hard words, and more of the easier ones. */
const MIN_PER_LEVEL = { easy: 60, medium: 60, hard: 45 };

const pattern = (word: string, gaps: readonly number[]) =>
  [...word].map((letter, i) => (gaps.includes(i) ? "_" : letter)).join("");
const sorted = (word: string) => [...word].sort().join("");

describe("word bank", () => {
  it("has unique ids and words", () => {
    expect(new Set(WORDS.map((w) => w.id)).size).toBe(WORDS.length);
    expect(new Set(WORDS.map((w) => w.word)).size).toBe(WORDS.length);
  });

  it("has enough words at every level", () => {
    for (const level of WORD_LEVELS) {
      const count = WORDS.filter((w) => w.level === level).length;
      expect(count, level).toBeGreaterThanOrEqual(MIN_PER_LEVEL[level]);
    }
  });

  it("only lists real anagrams as alternatives", () => {
    for (const w of WORDS) {
      for (const other of w.also) {
        expect(sorted(other), `${w.word} ~ ${other}`).toBe(sorted(w.word));
        expect(other).not.toBe(w.word);
      }
    }
  });

  it("hides some letters but never the first, and lists every other word that fits", () => {
    for (const w of WORDS) {
      expect(w.gaps.length, w.word).toBeGreaterThan(0);
      expect(w.gaps.length, w.word).toBeLessThanOrEqual(w.word.length / 2);
      expect(new Set(w.gaps).size).toBe(w.gaps.length);
      expect(w.gaps.every((g) => g > 0 && g < w.word.length)).toBe(true);
      for (const other of w.fits)
        expect(pattern(other, w.gaps), other).toBe(pattern(w.word, w.gaps));
      // Other bank words that fit must be listed too.
      for (const other of WORDS) {
        if (other !== w && other.word.length === w.word.length) {
          const fits = pattern(other.word, w.gaps) === pattern(w.word, w.gaps);
          if (fits) expect(w.fits, `${w.word} ~ ${other.word}`).toContain(other.word);
        }
      }
    }
  });

  it("hides more letters in harder words", () => {
    const average = (level: string) => {
      const words = WORDS.filter((w) => w.level === level);
      return words.reduce((sum, w) => sum + w.gaps.length, 0) / words.length;
    };
    expect(average("easy")).toBeLessThan(average("medium"));
    expect(average("medium")).toBeLessThan(average("hard"));
  });
});

describe("drawWords", () => {
  it("draws one word per round at that round's level, without repeats", () => {
    const levels = levelPlan("auto", 15);
    const drawn = drawWords(levels, 1);
    expect(drawn.map((w) => w.level)).toEqual(levels);
    expect(new Set(drawn.map((w) => w.id)).size).toBe(15);
  });

  it("is repeatable for a seed and skips words the room used", () => {
    const first = drawWords(levelPlan("auto", 10), 4).map((w) => w.id);
    expect(drawWords(levelPlan("auto", 10), 4).map((w) => w.id)).toEqual(first);
    const second = drawWords(levelPlan("auto", 10), 5, { recent: first }).map((w) => w.id);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it("borrows from another level when one runs short, and returns what it has", () => {
    const easy = WORDS.filter((w) => w.level === "easy").slice(0, 2);
    const medium = WORDS.filter((w) => w.level === "medium").slice(0, 1);
    const drawn = drawWords(["easy", "easy", "easy", "easy"], 1, {}, [...easy, ...medium]);
    expect(drawn.map((w) => w.level)).toEqual(["easy", "easy", "medium"]);
  });
});
