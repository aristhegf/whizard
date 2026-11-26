import {
  foldClue,
  IMPOSTOR_CATEGORY_IDS,
  IMPOSTOR_GUESS_OPTIONS,
  IMPOSTOR_ROUNDS,
} from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { drawContent, drawImpostorWords, IMPOSTOR_WORDS } from "./index";

describe("impostor words", () => {
  it("has at least 40 words in every category, each with its own ID", () => {
    for (const category of IMPOSTOR_CATEGORY_IDS) {
      const count = IMPOSTOR_WORDS.filter((w) => w.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(40);
    }
    expect(new Set(IMPOSTOR_WORDS.map((w) => w.id)).size).toBe(IMPOSTOR_WORDS.length);
    for (const w of IMPOSTOR_WORDS) expect(w.id).toMatch(/^impostor-[a-z]+-[a-z]+(-[a-z]+)*$/);
  });

  it("never has the same word twice, in any category", () => {
    const folded = IMPOSTOR_WORDS.map((w) => foldClue(w.word));
    expect(new Set(folded).size).toBe(folded.length);
  });

  it("keeps every word short enough to show on a phone", () => {
    for (const w of IMPOSTOR_WORDS) {
      expect(w.word.length, w.word).toBeLessThanOrEqual(20);
      expect(w.word.split(/[ -]/).length, w.word).toBeLessThanOrEqual(2);
    }
  });
});

describe("drawImpostorWords", () => {
  it("draws one different word per round from the pack, the same for the same seed", () => {
    for (const pack of IMPOSTOR_CATEGORY_IDS) {
      for (const count of IMPOSTOR_ROUNDS) {
        const words = drawImpostorWords(pack, count, 11);
        expect(words).toHaveLength(count);
        expect(new Set(words.map((w) => w.id)).size).toBe(count);
        expect(words.every((w) => w.category === pack)).toBe(true);
        expect(drawImpostorWords(pack, count, 11)).toEqual(words);
      }
    }
    expect(drawImpostorWords("food", 5, 11)).not.toEqual(drawImpostorWords("food", 5, 12));
  });

  it("takes Mixed's categories in turn", () => {
    const six = drawImpostorWords("mixed", 6, 3);
    expect(new Set(six.map((w) => w.category)).size).toBe(6);
    const eight = drawImpostorWords("mixed", 8, 3);
    // A longer game starts with the same words (their decoys avoid the extra rounds' words).
    expect(eight.slice(0, 6).map((w) => w.id)).toEqual(six.map((w) => w.id));
    for (let i = 1; i < eight.length; i++) {
      expect(eight[i]!.category).not.toBe(eight[i - 1]!.category);
    }
    expect(new Set(eight.map((w) => w.id)).size).toBe(8);
  });

  it("gives each word seven others from its category for the last chance", () => {
    const words = drawImpostorWords("mixed", 8, 5);
    const drawn = new Set(words.map((w) => w.word));
    for (const w of words) {
      expect(w.decoys).toHaveLength(IMPOSTOR_GUESS_OPTIONS - 1);
      expect(new Set(w.decoys).size).toBe(w.decoys.length);
      for (const decoy of w.decoys) {
        // From the same category, and never this or another round's word.
        expect(
          IMPOSTOR_WORDS.some((x) => x.word === decoy && x.category === w.category),
          decoy,
        ).toBe(true);
        expect(drawn.has(decoy), decoy).toBe(false);
      }
    }
  });

  it("puts words the room used lately and the players have seen last", () => {
    const sports = IMPOSTOR_WORDS.filter((w) => w.category === "sports");
    const recent = sports.slice(3).map((w) => w.id);
    const fresh = drawImpostorWords("sports", 3, 9, { recent }).map((w) => w.id);
    expect(fresh.sort()).toEqual(
      sports
        .slice(0, 3)
        .map((w) => w.id)
        .sort(),
    );
    const seen = new Map(sports.slice(1).map((w) => [w.id, { players: 2, lastSeenAt: 5 }]));
    expect(drawImpostorWords("sports", 1, 9, { seen })[0]?.id).toBe(sports[0]?.id);
  });

  it("is what drawContent returns for an impostor request", () => {
    expect(drawContent({ kind: "impostor-words", pack: "mixed", count: 5 }, 21)).toEqual(
      drawImpostorWords("mixed", 5, 21),
    );
  });
});
