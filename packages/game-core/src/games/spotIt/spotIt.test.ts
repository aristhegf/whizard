import { describe, expect, it } from "vitest";
import { seededRng } from "../../random";
import { isRejection } from "../types";
import { ROUNDS_COUNTDOWN_MS, type RoundsAction } from "../rounds/rounds";
import { DEFAULT_SPOT_IT_SETTINGS } from "./settings";
import {
  SPOT_IT_KINDS,
  SPOT_IT_MAX_MISSES,
  SPOT_IT_MAX_SIZE,
  SPOT_IT_MIN_SIZE,
  spotItGame,
  spotItPuzzles,
  type SpotItState,
  type SpotItView,
} from "./spotIt";

const T0 = 1_000_000;
const START = T0 + ROUNDS_COUNTDOWN_MS;

function setup(rounds: 5 | 10 | 15 = 10, seed = 3): SpotItState {
  return spotItGame.setup({
    settings: { ...DEFAULT_SPOT_IT_SETTINGS, rounds },
    players: [{ id: "ada", nickname: "ADA" }],
    content: [],
    seed,
    now: T0,
  });
}

function act(state: SpotItState, action: RoundsAction<number>, now: number) {
  const result = spotItGame.onAction(spotItGame.tick(state, now), "ada", action, now);
  if (isRejection(result)) throw new Error(result.rejected);
  return result;
}

const tap = (index: number, cell: number): RoundsAction<number> => ({
  type: "guess",
  index,
  guess: cell,
  clientElapsedMs: 0,
});

describe("Spot It", () => {
  it("needs nothing from the content bank", () => {
    expect(spotItGame.contentNeeded(DEFAULT_SPOT_IT_SETTINGS)).toBeNull();
  });

  it("has exactly one odd cell in every grid", () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const puzzle of spotItPuzzles(15, seededRng(seed))) {
        const cells: unknown[] = puzzle.view.cells;
        expect(cells).toHaveLength(puzzle.view.size ** 2);
        const odd = cells[puzzle.odd];
        expect(cells.filter((c) => c === odd)).toHaveLength(1);
        expect(new Set(cells).size).toBe(2);
      }
    }
  });

  it("grows the grid, makes it subtler and takes turns with the kinds", () => {
    const puzzles = spotItPuzzles(10, seededRng(1));
    const sizes = puzzles.map((p) => p.view.size);
    expect(sizes[0]).toBe(SPOT_IT_MIN_SIZE);
    expect(sizes.at(-1)).toBe(SPOT_IT_MAX_SIZE);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(puzzles[0]!.tier).toBe(0);
    expect(puzzles.at(-1)!.tier).toBe(2);
    expect(new Set(puzzles.slice(0, 4).map((p) => p.view.kind))).toEqual(new Set(SPOT_IT_KINDS));
  });

  it("makes the same grids from the same seed", () => {
    expect(setup(5, 9).puzzles).toEqual(setup(5, 9).puzzles);
    expect(setup(5, 9).puzzles).not.toEqual(setup(5, 10).puzzles);
  });

  it("scores a tap on the odd one and counts wrong taps", () => {
    let s = setup();
    const odd = s.puzzles[0]!.odd;
    const wrong = (odd + 1) % s.puzzles[0]!.view.cells.length;
    s = act(s, tap(0, wrong), START + 500);
    const puzzle = spotItGame.viewFor(s, "ada").stage;
    expect(puzzle).toMatchObject({ kind: "puzzle", tried: [wrong] });
    s = act(s, tap(0, odd), START + 1000);
    const result = spotItGame.viewFor(s, "ada").stage;
    expect(result).toMatchObject({ kind: "result", outcome: "solved", misses: 1, reveal: { odd } });
  });

  it("loses the round after too many wrong taps", () => {
    let s = setup();
    const odd = s.puzzles[0]!.odd;
    for (let i = 1; i <= SPOT_IT_MAX_MISSES; i++) s = act(s, tap(0, (odd + i) % 16), START);
    expect((spotItGame.viewFor(s, "ada") as SpotItView).stage).toMatchObject({
      kind: "result",
      outcome: "missed",
    });
  });

  it("turns down taps off the grid", () => {
    const s = spotItGame.tick(setup(), START);
    const result = spotItGame.onAction(s, "ada", tap(0, 16), START);
    expect(isRejection(result) && result.rejected).toMatch(/grid/);
  });
});
