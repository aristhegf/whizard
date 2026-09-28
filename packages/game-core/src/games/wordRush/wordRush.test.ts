import { describe, expect, it } from "vitest";
import { seededRng } from "../../random";
import { isRejection } from "../types";
import {
  ROUNDS_AUTO_ADVANCE_MS,
  ROUNDS_COUNTDOWN_MS,
  solvePoints,
  type RoundsAction,
} from "../rounds/rounds";
import { DEFAULT_WORD_RUSH_SETTINGS, levelsFor, type WordEntry } from "./settings";
import {
  WORD_POINTS,
  WORD_RUSH_MAX_MISSES,
  wordPuzzle,
  wordRushGame,
  type WordRushSpeedState as WordRushState,
  type WordRushSpeedView as WordRushView,
} from "./wordRush";

const T0 = 1_000_000;
const START = T0 + ROUNDS_COUNTDOWN_MS;
const LIMIT = DEFAULT_WORD_RUSH_SETTINGS.timeLimitSeconds * 1000;

const WORDS: WordEntry[] = [
  { id: "w1", level: "easy", hint: "Animal", word: "LION", also: ["LOIN"], gaps: [3], fits: [] },
  {
    id: "w2",
    level: "medium",
    hint: "Animal",
    word: "PARROT",
    also: ["RAPTOR"],
    gaps: [],
    fits: [],
  },
  { id: "w3", level: "hard", hint: "Animal", word: "ELEPHANT", also: [], gaps: [1, 3], fits: [] },
];

function setup(players = ["ada", "tolu"], seed = 7): WordRushState {
  return wordRushGame.setup({
    settings: DEFAULT_WORD_RUSH_SETTINGS,
    players: players.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: WORDS,
    seed,
    now: T0,
  }) as WordRushState;
}

function act(state: WordRushState, player: string, action: RoundsAction<string>, now: number) {
  const result = wordRushGame.onAction(wordRushGame.tick(state, now), player, action, now);
  if (isRejection(result)) throw new Error(result.rejected);
  return result as WordRushState;
}

function reject(state: WordRushState, player: string, action: RoundsAction<string>, now: number) {
  const result = wordRushGame.onAction(wordRushGame.tick(state, now), player, action, now);
  if (!isRejection(result)) throw new Error("expected a rejection");
  return result.rejected;
}

const guess = (index: number, word: string, clientElapsedMs = 0): RoundsAction<string> => ({
  type: "guess",
  index,
  guess: word,
  clientElapsedMs,
});

const view = (state: WordRushState, player: string) =>
  wordRushGame.viewFor(state, player) as WordRushView;

describe("Word Rush", () => {
  it("ramps from easy words to hard ones on Auto, and keeps to one level otherwise", () => {
    const auto = { ...DEFAULT_WORD_RUSH_SETTINGS, rounds: 5 as const };
    expect(levelsFor(auto)).toEqual(["easy", "easy", "medium", "hard", "hard"]);
    expect(levelsFor({ ...auto, level: "medium" })).toEqual(Array(5).fill("medium"));
    expect(wordRushGame.contentNeeded(DEFAULT_WORD_RUSH_SETTINGS, 2)).toEqual({
      kind: "words",
      levels: levelsFor(DEFAULT_WORD_RUSH_SETTINGS),
    });
    // Elimination: 6 players play four rounds and a final of 5 words each, then 5 hard spares.
    const knockout = levelsFor({ ...auto, mode: "elimination" }, 6);
    expect(knockout).toHaveLength(30);
    expect(knockout.slice(20)).toEqual(Array(10).fill("hard"));
  });

  it("never scrambles a word into one that counts", () => {
    for (let seed = 0; seed < 200; seed++) {
      const puzzle = wordPuzzle({ ...WORDS[0]!, gaps: [] }, seededRng(seed));
      expect(puzzle.type).toBe("unscramble");
      expect(["LION", "LOIN"]).not.toContain(puzzle.letters.join(""));
      expect([...puzzle.letters].sort()).toEqual([..."LION"].sort());
    }
  });

  it("hides the answer until the round is over", () => {
    let s = setup();
    const stage = view(s, "ada").stage;
    expect(stage.kind).toBe("puzzle");
    expect(JSON.stringify(stage)).not.toContain('"LION"');
    s = act(s, "ada", { type: "skip", index: 0 }, START + 1000);
    const result = view(s, "ada").stage;
    expect(result.kind === "result" && result.reveal.word).toBe("LION");
  });

  it("accepts other words from the same letters, any case", () => {
    const s = setup();
    const puzzle = s.puzzles[1]!;
    expect(puzzle.type).toBe("unscramble");
    let t = act(s, "ada", { type: "skip", index: 0 }, START);
    t = act(t, "ada", { type: "next" }, START + 100);
    t = act(t, "ada", guess(1, "raptor"), START + 100);
    const stage = view(t, "ada").stage;
    expect(stage.kind === "result" && stage.outcome).toBe("solved");
  });

  it("scores by speed, less a tenth for each wrong word", () => {
    let s = setup(["ada"]);
    s = { ...s, puzzles: s.puzzles.map((p) => ({ ...p, type: "unscramble" as const })) };
    s = act(s, "ada", guess(0, "NILO"), START + 1000);
    expect(view(s, "ada").stage).toMatchObject({ kind: "puzzle", tried: ["NILO"], triesLeft: 4 });
    s = act(s, "ada", guess(0, "LION", LIMIT / 2), START + LIMIT / 2);
    const expected = Math.round(WORD_POINTS.easy * (0.5 + 0.25 - 0.1));
    expect(solvePoints(WORD_POINTS.easy, LIMIT / 2, LIMIT, 1)).toBe(expected);
    expect(view(s, "ada").me).toEqual({ score: expected, solvedCount: 1 });
  });

  it("turns down guesses that can't be right without counting them", () => {
    let s = setup(["ada"]);
    s = { ...s, puzzles: s.puzzles.map((p) => ({ ...p, type: "unscramble" as const })) };
    expect(reject(s, "ada", guess(0, "LIONS"), START)).toMatch(/4 letters/);
    expect(reject(s, "ada", guess(0, "LOOK"), START)).toMatch(/letters shown/);
    s = act(s, "ada", guess(0, "NILO"), START);
    expect(reject(s, "ada", guess(0, "nilo"), START)).toMatch(/tried/);
    expect(view(s, "ada").stage).toMatchObject({ triesLeft: WORD_RUSH_MAX_MISSES - 1 });
  });

  it("keeps the shown letters in a missing-letters puzzle", () => {
    let s = setup(["ada"]);
    s = {
      ...s,
      puzzles: s.puzzles.map((p, i) =>
        i === 0 ? { ...p, type: "missing" as const, accepted: ["LION"] } : p,
      ),
    };
    expect(view(s, "ada").stage).toMatchObject({ puzzle: { pattern: ["L", "I", "O", null] } });
    expect(reject(s, "ada", guess(0, "LOIN"), START)).toMatch(/shown/);
    s = act(s, "ada", guess(0, "LION"), START);
    expect(view(s, "ada").me?.solvedCount).toBe(1);
  });

  it("ends the round after too many wrong words", () => {
    let s = setup(["ada"]);
    s = { ...s, puzzles: s.puzzles.map((p) => ({ ...p, type: "unscramble" as const })) };
    for (const word of ["NILO", "NOLI", "ILON", "OLIN", "INLO"])
      s = act(s, "ada", guess(0, word), START);
    expect(view(s, "ada").stage).toMatchObject({ kind: "result", outcome: "missed", points: 0 });
  });

  it("times out, moves on by itself, and finishes when everyone is done", () => {
    let s = setup();
    s = wordRushGame.tick(s, START + LIMIT) as WordRushState;
    expect(view(s, "ada").stage).toMatchObject({ kind: "result", outcome: "timeout" });
    expect(wordRushGame.nextWakeAt(s)).toBe(START + LIMIT + ROUNDS_AUTO_ADVANCE_MS);
    s = wordRushGame.tick(s, START + LIMIT + ROUNDS_AUTO_ADVANCE_MS) as WordRushState;
    expect(view(s, "ada").stage).toMatchObject({ kind: "puzzle", index: 1 });

    s = wordRushGame.tick(s, START + 10 * (LIMIT + ROUNDS_AUTO_ADVANCE_MS)) as WordRushState;
    expect(wordRushGame.isFinished(s)).toBe(true);
    const done = view(s, "tolu").stage;
    expect(done.kind === "done" && done.results.map((r) => r.reveal.word)).toEqual([
      "LION",
      "PARROT",
      "ELEPHANT",
    ]);
    expect(wordRushGame.summarize(s)).toMatchObject({ rounds: 3, category: null });
  });

  it("lets a late joiner start from round one", () => {
    let s = setup(["ada"]);
    s = act(s, "ada", { type: "skip", index: 0 }, START);
    s = wordRushGame.onPlayerJoined(
      s,
      { id: "kemi", nickname: "KEMI" },
      START + 5000,
    ) as WordRushState;
    expect(view(s, "kemi").stage).toMatchObject({
      kind: "puzzle",
      index: 0,
      startsAt: START + 5000 + ROUNDS_COUNTDOWN_MS,
    });
    s = wordRushGame.onPlayerLeft(s, "kemi", START + 6000) as WordRushState;
    expect(view(s, "kemi").stage.kind).toBe("watching");
  });
});
