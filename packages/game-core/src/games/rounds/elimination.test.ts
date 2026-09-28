import { describe, expect, it } from "vitest";
import { CUT_MS, REVEAL_MS, START_COUNTDOWN_MS } from "../knockout/knockout";
import { isRejection } from "../types";
import { DEFAULT_WORD_RUSH_SETTINGS, type WordEntry } from "../wordRush/settings";
import {
  WORD_RUSH_MAX_MISSES,
  wordRushGame,
  type WordRushEliminationState as State,
  type WordRushEliminationView as View,
} from "../wordRush/wordRush";
import type { RoundsAction } from "./rounds";

// Elimination for the rounds games, through Word Rush: the knock-out rules are the quiz's
// (tested in quiz/elimination.test.ts); these check the moves only these games have.

const T0 = 1_000_000;
const START = T0 + START_COUNTDOWN_MS;
const LIMIT = 30_000;

const words: WordEntry[] = Array.from({ length: 15 }, (_, i) => ({
  id: `w${i}`,
  level: "easy",
  hint: "Test",
  // Seven different letters, so every rotation is a different, wrong word.
  word: `BLUNTIQ`.replace("Q", String.fromCharCode(67 + i)),
  also: [],
  gaps: [],
  fits: [],
}));

function setup(players: string[]): State {
  const state = wordRushGame.setup({
    settings: { ...DEFAULT_WORD_RUSH_SETTINGS, mode: "elimination", level: "easy", rounds: 5 },
    players: players.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: words,
    seed: 1,
    now: T0,
  });
  return state as State;
}

const answer = (s: State) => s.items[s.index]!.word;
const wrong = (s: State, n = 0) => {
  const letters = [...answer(s)];
  // A different order of the same letters, never the word itself.
  return [...letters.slice(n + 1), ...letters.slice(0, n + 1)].join("");
};

function act(s: State, id: string, action: RoundsAction<string>, at: number): State {
  const result = wordRushGame.onAction(wordRushGame.tick(s, at), id, action, at);
  if (isRejection(result)) throw new Error(`${id}: ${result.rejected}`);
  return result as State;
}

const guess = (s: State, word: string): RoundsAction<string> => ({
  type: "guess",
  index: s.index,
  guess: word,
  clientElapsedMs: 1000,
});

const view = (s: State, id: string) => wordRushGame.viewFor(s, id) as View;

describe("Word Rush Elimination", () => {
  it("needs three players", () => {
    const settings = { ...DEFAULT_WORD_RUSH_SETTINGS, mode: "elimination" as const };
    expect(wordRushGame.playersNeeded?.(settings)?.min).toBe(3);
    expect(wordRushGame.playersNeeded?.(DEFAULT_WORD_RUSH_SETTINGS)).toBeNull();
  });

  it("puts everyone on the same word, and closes it once everyone is done", () => {
    let s = setup(["ada", "bola", "chidi"]);
    expect(view(s, "ada").stage).toMatchObject({ kind: "question", index: 0, playing: true });

    // A wrong word is a try; Ada still has the rest.
    s = act(s, "ada", guess(s, wrong(s)), START + 1000);
    expect(view(s, "ada").stage).toMatchObject({
      kind: "question",
      tried: [wrong(s)],
      triesLeft: WORD_RUSH_MAX_MISSES - 1,
      myResult: null,
    });
    s = act(s, "ada", guess(s, answer(s)), START + 2000);
    expect(view(s, "ada").stage).toMatchObject({ myResult: { outcome: "solved" } });
    expect(view(s, "bola").stage).toMatchObject({ answeredCount: 1, aliveCount: 3 });
    // Nobody moves on alone.
    const early = wordRushGame.onAction(s, "ada", { type: "next" }, START + 2000);
    expect(isRejection(early)).toBe(true);

    s = act(s, "bola", { type: "skip", index: 0 }, START + 3000);
    for (let n = 0; n < WORD_RUSH_MAX_MISSES; n++) {
      s = act(s, "chidi", guess(s, wrong(s, n)), START + 4000);
    }
    // Everyone is done, so the answer shows without waiting for the clock.
    const reveal = view(s, "chidi").stage;
    expect(reveal).toMatchObject({ kind: "reveal", result: { outcome: "missed", points: 0 } });
    expect(reveal.kind === "reveal" && reveal.reveal.word).toBe(words[0]!.word);
    expect(view(s, "ada").me?.score).toBeGreaterThan(0);
  });

  it("knocks out the lowest score after a round, then plays a final", () => {
    let s = setup(["ada", "bola", "chidi"]);
    // 3 players, 5 rounds: one knock-out round of 2 words, then a final of 3.
    expect(s.roundEnds).toEqual([2]);
    let at = START;
    for (let i = 0; i < 2; i++) {
      s = act(s, "ada", guess(s, answer(s)), at + 500);
      s = act(s, "bola", guess(s, answer(s)), at + 900);
      // Chidi lets the time run out.
      s = wordRushGame.tick(s, at + LIMIT) as State;
      at = s.phaseEndsAt;
      s = wordRushGame.tick(s, at) as State;
      at = s.phase === "question" ? s.startsAt : s.phaseEndsAt;
    }
    expect(view(s, "chidi").stage).toMatchObject({ kind: "cut", out: [{ playerId: "chidi" }] });
    expect(s.phaseEndsAt).toBe(at);
    s = wordRushGame.tick(s, at) as State;
    expect(view(s, "ada").stage.kind).toBe("final");
    expect(view(s, "chidi").me?.status).toBe("out");
    expect(REVEAL_MS + CUT_MS).toBeGreaterThan(0);
  });
});
