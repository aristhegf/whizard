import {
  MOST_LIKELY_TO_PACK_IDS,
  mostLikelyToGame,
  type MostLikelyToSettings,
} from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { drawContent, drawMostLikelyToPrompts, MOST_LIKELY_TO_PROMPTS } from "./index";
import { normalize, similarity } from "./quality";

/**
 * Words no prompt may hold: profanity, and anything that would make a prompt crude or adult.
 * The packs are for mixed company, so even the Couples pack stays romantic and light.
 */
const BLOCKED = [
  "damn",
  "hell",
  "crap",
  "suck",
  "sex",
  "sexy",
  "naked",
  "nude",
  "kiss",
  "bed with",
  "drunk",
  "beer",
  "wine",
  "vodka",
  "shots",
  "hangover",
  "ex",
  "cheat on",
  "stupid",
  "idiot",
  "ugly",
  "fat",
  "kill",
  "die",
];

describe("most likely to prompts", () => {
  it("has at least 60 prompts in every pack, with unique ids", () => {
    for (const pack of MOST_LIKELY_TO_PACK_IDS) {
      expect(MOST_LIKELY_TO_PROMPTS.filter((p) => p.pack === pack).length).toBeGreaterThanOrEqual(
        60,
      );
    }
    expect(new Set(MOST_LIKELY_TO_PROMPTS.map((p) => p.id)).size).toBe(
      MOST_LIKELY_TO_PROMPTS.length,
    );
  });

  it("never repeats a prompt, in any pack, even reworded", () => {
    const texts = MOST_LIKELY_TO_PROMPTS.map((p) => p.text);
    expect(new Set(texts.map(normalize)).size).toBe(texts.length);
    const close: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (similarity(texts[i]!, texts[j]!) >= 0.6) close.push(`${texts[i]} ~ ${texts[j]}`);
      }
    }
    expect(close).toEqual([]);
  });

  it("keeps every prompt clean", () => {
    const flagged = MOST_LIKELY_TO_PROMPTS.filter((p) => {
      const words = ` ${normalize(p.text)} `;
      return BLOCKED.some((word) => words.includes(` ${word} `));
    }).map((p) => p.text);
    expect(flagged).toEqual([]);
  });
});

describe("drawMostLikelyToPrompts", () => {
  it("draws the number asked for from one pack, all different, the same for the same seed", () => {
    for (const pack of MOST_LIKELY_TO_PACK_IDS) {
      const drawn = drawMostLikelyToPrompts(pack, 15, 42);
      expect(drawn).toHaveLength(15);
      expect(drawn.every((p) => p.pack === pack)).toBe(true);
      expect(new Set(drawn.map((p) => p.id)).size).toBe(15);
      expect(drawMostLikelyToPrompts(pack, 15, 42)).toEqual(drawn);
    }
    expect(drawMostLikelyToPrompts("classic", 15, 1)).not.toEqual(
      drawMostLikelyToPrompts("classic", 15, 2),
    );
  });

  it("avoids prompts the room used lately and the players have seen", () => {
    const work = MOST_LIKELY_TO_PROMPTS.filter((p) => p.pack === "work");
    const recent = work.slice(0, -5).map((p) => p.id);
    const fresh = drawMostLikelyToPrompts("work", 5, 3, { recent }).map((p) => p.id);
    expect(fresh.sort()).toEqual(
      work
        .slice(-5)
        .map((p) => p.id)
        .sort(),
    );
    const seen = new Map(work.slice(1).map((p) => [p.id, { players: 1, lastSeenAt: 1 }]));
    expect(drawMostLikelyToPrompts("work", 1, 3, { seen })[0]?.id).toBe(work[0]?.id);
  });

  it("is what drawContent returns for the game's own request, and the game plays it", () => {
    const settings: MostLikelyToSettings = {
      ...mostLikelyToGame.defaultSettings,
      pack: "couples",
      rounds: 15,
    };
    const request = mostLikelyToGame.contentNeeded(settings, 3)!;
    const content = drawContent(request, 9);
    expect(content).toEqual(drawMostLikelyToPrompts("couples", 15, 9));
    const state = mostLikelyToGame.setup({
      settings,
      players: ["ada", "bo", "cy"].map((id) => ({ id, nickname: id })),
      content,
      seed: 9,
      now: 0,
    });
    expect(state.prompts).toHaveLength(15);
    expect(state.prompts.every((p) => p.pack === "couples")).toBe(true);
  });
});
