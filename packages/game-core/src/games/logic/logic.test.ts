import { describe, expect, it } from "vitest";
import { seededRng } from "../../random";
import { isRejection } from "../types";
import { countSolutions, logicPuzzle } from "./grid";
import { LOGIC_COUNTDOWN_MS, LOGIC_MAX_MISTAKES, logicGame, type LogicState } from "./logic";
import { LOGIC_SIZES, type LogicSize } from "./settings";

const T0 = 1_000_000;
const START = T0 + LOGIC_COUNTDOWN_MS;

/** Whether every row, column and box holds each number once. */
function valid(grid: number[], size: number, boxRows: number, boxCols: number) {
  const full = (cells: number[]) =>
    [...cells].sort((a, b) => a - b).join() ===
    Array.from({ length: size }, (_, i) => i + 1).join();
  for (let i = 0; i < size; i++) {
    if (!full(grid.slice(i * size, i * size + size))) return false;
    if (!full(Array.from({ length: size }, (_, r) => grid[r * size + i]!))) return false;
    const top = Math.floor(i / (size / boxCols)) * boxRows;
    const left = (i % (size / boxCols)) * boxCols;
    const box: number[] = [];
    for (let r = top; r < top + boxRows; r++) {
      for (let c = left; c < left + boxCols; c++) box.push(grid[r * size + c]!);
    }
    if (!full(box)) return false;
  }
  return true;
}

function game(nicknames = ["Ada", "Tolu"], size: LogicSize = 4, minutes: 5 | 10 | 15 = 5) {
  return logicGame.setup({
    settings: { size, minutes },
    players: nicknames.map((nickname, i) => ({ id: `p${i + 1}`, nickname })),
    content: null,
    seed: 42,
    now: T0,
  });
}

function act(state: LogicState, playerId: string, cell: number, value: number, now = START + 500) {
  const next = logicGame.onAction(state, playerId, { type: "place", cell, value }, now);
  if (isRejection(next)) throw new Error(next.rejected);
  return next;
}

/** Fills every empty cell correctly for one player. */
function solve(state: LogicState, playerId: string, now = START + 500): LogicState {
  let s = state;
  s.puzzle.givens.forEach((n, cell) => {
    if (n === 0) s = act(s, playerId, cell, s.puzzle.solution[cell]!, now);
  });
  return s;
}

describe("logic grids", () => {
  it("are valid, keep their clues, and have exactly one solution", () => {
    for (const { size, boxRows, boxCols } of LOGIC_SIZES) {
      for (let seed = 0; seed < (size === 9 ? 5 : 30); seed++) {
        const puzzle = logicPuzzle(size, seededRng(seed));
        expect(valid(puzzle.solution, size, boxRows, boxCols)).toBe(true);
        puzzle.givens.forEach((n, cell) => {
          if (n !== 0) expect(n).toBe(puzzle.solution[cell]);
        });
        expect(countSolutions(puzzle.givens, size, boxRows, boxCols)).toBe(1);
        expect(puzzle.givens.some((n) => n === 0)).toBe(true);
      }
    }
  });

  it("are the same for the same seed", () => {
    expect(logicPuzzle(6, seededRng(9))).toEqual(logicPuzzle(6, seededRng(9)));
  });
});

describe("logic", () => {
  it("gives everyone the same grid and counts down before it starts", () => {
    const state = game();
    const a = logicGame.viewFor(state, "p1");
    expect(a.grid).toEqual(state.puzzle.givens);
    expect(logicGame.viewFor(state, "p2").grid).toEqual(a.grid);
    expect(a.solution).toBeNull();
    const cell = state.puzzle.givens.indexOf(0);
    const early = logicGame.onAction(
      state,
      "p1",
      { type: "place", cell, value: state.puzzle.solution[cell]! },
      T0,
    );
    expect(isRejection(early) && early.rejected).toBe("The puzzle hasn't started.");
  });

  it("locks in a right number and counts a wrong one", () => {
    let state = game();
    const [first, second] = state.puzzle.givens.flatMap((n, cell) => (n === 0 ? [cell] : []));
    state = act(state, "p1", first!, state.puzzle.solution[first!]!);
    expect(logicGame.viewFor(state, "p1").grid![first!]).toBe(state.puzzle.solution[first!]);
    const again = logicGame.onAction(state, "p1", { type: "place", cell: first!, value: 1 }, START);
    expect(isRejection(again) && again.rejected).toBe("That cell is already filled.");

    const wrong = (state.puzzle.solution[second!]! % 4) + 1;
    state = act(state, "p1", second!, wrong);
    const view = logicGame.viewFor(state, "p1");
    expect(view.grid![second!]).toBe(0);
    expect(view.mistakesLeft).toBe(LOGIC_MAX_MISTAKES - 1);
    expect(view.lastWrong).toMatchObject({ cell: second, value: wrong });
    expect(view.standings.find((s) => s.playerId === "p1")?.filled).toBe(1);
  });

  it("turns down clues, numbers too big and cells off the grid", () => {
    const state = game();
    const clue = state.puzzle.givens.findIndex((n) => n !== 0);
    const on = logicGame.onAction(state, "p1", { type: "place", cell: clue, value: 1 }, START);
    expect(isRejection(on) && on.rejected).toBe("That cell is already filled.");
    const big = logicGame.onAction(state, "p1", { type: "place", cell: 0, value: 5 }, START);
    expect(isRejection(big) && big.rejected).toBe("That isn't on the grid.");
    const off = logicGame.onAction(state, "p1", { type: "place", cell: 16, value: 1 }, START);
    expect(isRejection(off) && off.rejected).toBe("That isn't on the grid.");
  });

  it("ends your puzzle after three mistakes and shows you the solution", () => {
    let state = game();
    const cell = state.puzzle.givens.indexOf(0);
    const right = state.puzzle.solution[cell]!;
    for (const value of [1, 2, 3, 4].filter((n) => n !== right))
      state = act(state, "p1", cell, value);
    const view = logicGame.viewFor(state, "p1");
    expect(view.mistakesLeft).toBe(0);
    expect(view.solution).toEqual(state.puzzle.solution);
    expect(view.me?.done).toBe(true);
    expect(logicGame.viewFor(state, "p2").solution).toBeNull();
  });

  it("ranks the fastest solver first and ends when everyone is done or out of time", () => {
    let state = game(["Ada", "Tolu", "Kemi"]);
    state = solve(state, "p2", START + 4000);
    state = solve(state, "p1", START + 9000);
    const cell = state.puzzle.givens.indexOf(0);
    state = act(state, "p3", cell, state.puzzle.solution[cell]!);
    expect(logicGame.isFinished(state)).toBe(false);
    expect(logicGame.viewFor(state, "p1").standings.map((s) => s.nickname)).toEqual([
      "Tolu",
      "Ada",
      "Kemi",
    ]);
    expect(logicGame.nextWakeAt(state)).toBe(START + 5 * 60_000);
    state = logicGame.tick(state, START + 5 * 60_000);
    expect(logicGame.isFinished(state)).toBe(true);
    const total = state.puzzle.givens.filter((n) => n === 0).length;
    expect(logicGame.summarize(state)).toMatchObject({
      rounds: total,
      players: [
        { playerId: "p2", placing: 1, correct: total },
        { playerId: "p1", placing: 2, correct: total },
        { playerId: "p3", placing: 3, correct: 1 },
      ],
    });
  });

  it("gives a late joiner the same grid with their own clock", () => {
    let state = game(["Ada"], 6);
    state = logicGame.onPlayerJoined(state, { id: "p2", nickname: "Tolu" }, START + 10_000);
    const view = logicGame.viewFor(state, "p2");
    expect(view.grid).toEqual(state.puzzle.givens);
    expect(view.startsAt).toBe(START + 10_000 + LOGIC_COUNTDOWN_MS);
  });
});
