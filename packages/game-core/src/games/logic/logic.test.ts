import { describe, expect, it } from "vitest";
import { seededRng } from "../../random";
import { isRejection } from "../types";
import { countSolutions, logicPuzzle } from "./grid";
import {
  LOGIC_CLASSIC_LIMIT_MS,
  LOGIC_COUNTDOWN_MS,
  LOGIC_CUT_MS,
  LOGIC_MAX_MISTAKES,
  logicGame,
  type LogicState,
} from "./logic";
import { LOGIC_SIZES, logicSettingsSchema, type LogicMode, type LogicSize } from "./settings";

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

function game(
  nicknames = ["Ada", "Tolu"],
  size: LogicSize = 4,
  minutes: 5 | 10 | 15 = 5,
  mode: LogicMode = "speed",
) {
  return logicGame.setup({
    settings: { mode, size, minutes },
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
  s.puzzles[s.round]!.givens.forEach((n, cell) => {
    if (n === 0) s = act(s, playerId, cell, s.puzzles[s.round]!.solution[cell]!, now);
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
    expect(a.grid).toEqual(state.puzzles[0]!.givens);
    expect(logicGame.viewFor(state, "p2").grid).toEqual(a.grid);
    expect(a.solution).toBeNull();
    const cell = state.puzzles[0]!.givens.indexOf(0);
    const early = logicGame.onAction(
      state,
      "p1",
      { type: "place", cell, value: state.puzzles[0]!.solution[cell]! },
      T0,
    );
    expect(isRejection(early) && early.rejected).toBe("The puzzle hasn't started.");
  });

  it("locks in a right number and counts a wrong one", () => {
    let state = game();
    const [first, second] = state.puzzles[0]!.givens.flatMap((n, cell) => (n === 0 ? [cell] : []));
    state = act(state, "p1", first!, state.puzzles[0]!.solution[first!]!);
    expect(logicGame.viewFor(state, "p1").grid![first!]).toBe(state.puzzles[0]!.solution[first!]);
    const again = logicGame.onAction(state, "p1", { type: "place", cell: first!, value: 1 }, START);
    expect(isRejection(again) && again.rejected).toBe("That cell is already filled.");

    const wrong = (state.puzzles[0]!.solution[second!]! % 4) + 1;
    state = act(state, "p1", second!, wrong);
    const view = logicGame.viewFor(state, "p1");
    expect(view.grid![second!]).toBe(0);
    expect(view.mistakesLeft).toBe(LOGIC_MAX_MISTAKES - 1);
    expect(view.lastWrong).toMatchObject({ cell: second, value: wrong });
    expect(view.standings.find((s) => s.playerId === "p1")?.filled).toBe(1);
  });

  it("turns down clues, numbers too big and cells off the grid", () => {
    const state = game();
    const clue = state.puzzles[0]!.givens.findIndex((n) => n !== 0);
    const on = logicGame.onAction(state, "p1", { type: "place", cell: clue, value: 1 }, START);
    expect(isRejection(on) && on.rejected).toBe("That cell is already filled.");
    const big = logicGame.onAction(state, "p1", { type: "place", cell: 0, value: 5 }, START);
    expect(isRejection(big) && big.rejected).toBe("That isn't on the grid.");
    const off = logicGame.onAction(state, "p1", { type: "place", cell: 16, value: 1 }, START);
    expect(isRejection(off) && off.rejected).toBe("That isn't on the grid.");
  });

  it("ends your puzzle after three mistakes and shows you the solution", () => {
    let state = game();
    const cell = state.puzzles[0]!.givens.indexOf(0);
    const right = state.puzzles[0]!.solution[cell]!;
    for (const value of [1, 2, 3, 4].filter((n) => n !== right))
      state = act(state, "p1", cell, value);
    const view = logicGame.viewFor(state, "p1");
    expect(view.mistakesLeft).toBe(0);
    expect(view.solution).toEqual(state.puzzles[0]!.solution);
    expect(view.me?.done).toBe(true);
    expect(logicGame.viewFor(state, "p2").solution).toBeNull();
  });

  it("ranks the fastest solver first and ends when everyone is done or out of time", () => {
    let state = game(["Ada", "Tolu", "Kemi"]);
    state = solve(state, "p2", START + 4000);
    state = solve(state, "p1", START + 9000);
    const cell = state.puzzles[0]!.givens.indexOf(0);
    state = act(state, "p3", cell, state.puzzles[0]!.solution[cell]!);
    expect(logicGame.isFinished(state)).toBe(false);
    expect(logicGame.viewFor(state, "p1").standings.map((s) => s.nickname)).toEqual([
      "Tolu",
      "Ada",
      "Kemi",
    ]);
    expect(logicGame.nextWakeAt(state)).toBe(START + 5 * 60_000);
    state = logicGame.tick(state, START + 5 * 60_000);
    expect(logicGame.isFinished(state)).toBe(true);
    const total = state.puzzles[0]!.givens.filter((n) => n === 0).length;
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
    expect(view.grid).toEqual(state.puzzles[0]!.givens);
    expect(view.startsAt).toBe(START + 10_000 + LOGIC_COUNTDOWN_MS);
  });
});

describe("logic modes", () => {
  it("reads rooms saved before modes as Speed, and starts new ones on Speed", () => {
    expect(logicSettingsSchema.parse({ size: 9, minutes: 15 })).toEqual({
      mode: "speed",
      size: 9,
      minutes: 15,
    });
    expect(logicGame.defaultSettings.mode).toBe("speed");
  });

  it("Speed counts down from the minutes chosen, as it always has", () => {
    const state = game(["Ada", "Tolu"], 4, 10);
    const view = logicGame.viewFor(state, "p1");
    expect([view.mode, view.round, view.cut]).toEqual(["speed", null, null]);
    expect(view.deadline).toBe(START + 10 * 60_000);
    // The same grid a race on this seed always got.
    expect(state.puzzles).toEqual([logicPuzzle(4, seededRng(42))]);
  });

  it("Classic shows no clock, and only stops a player after an hour", () => {
    let state = game(["Ada", "Tolu"], 4, 5, "classic");
    expect(logicGame.viewFor(state, "p1").deadline).toBeNull();
    expect(logicGame.nextWakeAt(state)).toBe(START + LOGIC_CLASSIC_LIMIT_MS);
    state = logicGame.tick(state, START + 30 * 60_000);
    state = solve(state, "p1", START + 30 * 60_000);
    expect(logicGame.isFinished(state)).toBe(false);
    state = logicGame.tick(state, START + LOGIC_CLASSIC_LIMIT_MS);
    expect(logicGame.isFinished(state)).toBe(true);
    expect(logicGame.summarize(state).mode).toBe("classic");
  });

  it("carries on a game saved before modes, as a Speed race", () => {
    const fresh = game(["Ada", "Tolu"]);
    const legacy = {
      settings: { size: 4, minutes: 5 },
      puzzle: fresh.puzzles[0],
      players: fresh.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        left: p.left,
        entries: p.entries,
        mistakes: p.mistakes,
        lastWrong: p.lastWrong,
        startsAt: p.startsAt,
        finishedAt: null,
        outOf: null,
      })),
      finishedAt: null,
    } as unknown as LogicState;
    const view = logicGame.viewFor(legacy, "p1");
    expect([view.mode, view.round, view.deadline]).toEqual(["speed", null, START + 5 * 60_000]);
    expect(view.grid).toEqual(fresh.puzzles[0]!.givens);
    const { givens, solution } = fresh.puzzles[0]!;
    let state = legacy;
    givens.forEach((n, cell) => {
      if (n === 0) state = act(state, "p1", cell, solution[cell]!, START + 4000);
    });
    expect(logicGame.viewFor(state, "p1").me?.solved).toBe(true);
    state = logicGame.tick(state, START + 5 * 60_000);
    expect(logicGame.isFinished(state)).toBe(true);
    expect(logicGame.summarize(state).mode).toBe("speed");
  });
});

describe("logic elimination", () => {
  const FIVE_MINUTES = 5 * 60_000;
  const five = ["Ada", "Bola", "Chidi", "Dayo", "Efe"];
  const elim = (names = five) => game(names, 4, 5, "elimination");
  /** Fills `count` more cells correctly for one player in the round being played. */
  function fill(state: LogicState, playerId: string, now: number, count: number) {
    const { givens, solution } = state.puzzles[state.round]!;
    const entries = state.players.find((p) => p.id === playerId)!.entries;
    const empty = givens.flatMap((n, cell) => (n === 0 && entries[cell] === 0 ? [cell] : []));
    return empty
      .slice(0, count)
      .reduce((s, cell) => act(s, playerId, cell, solution[cell]!, now), state);
  }
  /** Wrong numbers in an empty cell until out of mistakes. */
  function runOut(state: LogicState, playerId: string) {
    const { givens, solution } = state.puzzles[state.round]!;
    const entries = state.players.find((p) => p.id === playerId)!.entries;
    const cell = givens.findIndex((n, c) => n === 0 && entries[c] === 0);
    return [1, 2, 3, 4]
      .filter((n) => n !== solution[cell])
      .reduce((s, value) => act(s, playerId, cell, value), state);
  }

  it("needs three players, and plans knock-out rounds and a final, each a new grid", () => {
    expect(logicGame.playersNeeded!({ mode: "elimination", size: 4, minutes: 5 })?.min).toBe(3);
    expect(logicGame.playersNeeded!({ mode: "classic", size: 4, minutes: 5 })).toBeNull();
    const state = elim();
    // Five players: three knock-out rounds and the final, the first the race's grid.
    expect(state.puzzles).toHaveLength(4);
    expect(state.puzzles[0]).toEqual(logicPuzzle(4, seededRng(42)));
    expect(new Set(state.puzzles.map((p) => p.givens.join())).size).toBe(4);
    const view = logicGame.viewFor(state, "p1");
    expect(view.round).toEqual({ index: 0, total: 4, final: false });
    expect(view.deadline).toBe(START + FIVE_MINUTES);
  });

  it("keeps solvers safe, knocks out the fewest cells filled when time runs out, then moves on", () => {
    let state = elim();
    state = solve(state, "p1", START + 10_000);
    state = fill(state, "p2", START + 12_000, 6);
    state = fill(state, "p3", START + 12_000, 4);
    state = fill(state, "p4", START + 13_000, 4);
    state = fill(state, "p5", START + 14_000, 1);
    expect(logicGame.nextWakeAt(state)).toBe(START + FIVE_MINUTES);
    state = logicGame.tick(state, START + FIVE_MINUTES);

    // Five players, three knock-out rounds: one goes out each round, the fewest cells filled.
    const view = logicGame.viewFor(state, "p5");
    expect(view.cut?.out.map((o) => o.nickname)).toEqual(["Efe"]);
    expect(view.me?.out).toBe(true);
    expect(view.grid).toBeNull();
    const early = logicGame.onAction(
      state,
      "p1",
      { type: "place", cell: 0, value: 1 },
      START + FIVE_MINUTES + 10,
    );
    expect(isRejection(early) && early.rejected).toBe("The next round hasn't started.");

    // After the cut shows, the next round starts on its own, with a new grid.
    const nextAt = START + FIVE_MINUTES + LOGIC_CUT_MS;
    expect(logicGame.nextWakeAt(state)).toBe(nextAt);
    state = logicGame.tick(state, nextAt);
    const next = logicGame.viewFor(state, "p1");
    expect(next.round?.index).toBe(1);
    expect(next.startsAt).toBe(nextAt + LOGIC_COUNTDOWN_MS);
    expect(next.me?.filled).toBe(0);
    expect(next.grid).toEqual(state.puzzles[1]!.givens);
    expect(next.solution).toBeNull();
    // The knocked out watch the others' progress.
    const watching = logicGame.viewFor(state, "p5");
    expect(watching.grid).toBeNull();
    expect(watching.startsAt).toBe(nextAt + LOGIC_COUNTDOWN_MS);
  });

  it("breaks a tie on cells filled against whoever got there later", () => {
    let state = elim(["Ada", "Bola", "Chidi", "Dayo"]);
    // Four players, two knock-out rounds: one goes out now.
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000);
    state = fill(state, "p3", START + 20_000, 3);
    state = fill(state, "p4", START + 10_000, 3);
    state = logicGame.tick(state, START + FIVE_MINUTES);
    expect(state.lastCut?.out).toEqual(["p3"]);
  });

  it("counts running out of mistakes as done but not solved", () => {
    let state = elim(["Ada", "Bola", "Chidi"]);
    // Three players, one knock-out round: two stay in.
    state = solve(state, "p1", START + 5000);
    state = fill(state, "p2", START + 6000, 3);
    state = runOut(state, "p2");
    expect(state.phase).toBe("play");
    state = fill(state, "p3", START + 7000, 1);
    state = runOut(state, "p3");
    // Everyone still in is done, so the round ends without waiting for the clock.
    expect(state.phase).toBe("cut");
    expect(state.lastCut?.out).toEqual(["p3"]);
  });

  it("ends a round early once enough have solved it that the rest are out anyway", () => {
    let state = elim();
    // Four of five stay in: once four have solved it, the fifth is out.
    for (const [i, id] of ["p1", "p2", "p3"].entries()) {
      state = solve(state, id, START + 5000 + i * 1000);
    }
    expect(state.phase).toBe("play");
    state = solve(state, "p4", START + 9000);
    expect(state.phase).toBe("cut");
    expect(state.lastCut?.out).toEqual(["p5"]);
  });

  it("plays the final between two, and the first to solve it wins", () => {
    let state = elim(["Ada", "Bola", "Chidi"]);
    expect(state.puzzles).toHaveLength(2);
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000);
    expect(state.lastCut?.out).toEqual(["p3"]);
    state = logicGame.tick(state, START + 6000 + LOGIC_CUT_MS);
    expect(logicGame.viewFor(state, "p1").round?.final).toBe(true);
    const finalStart = START + 6000 + LOGIC_CUT_MS + LOGIC_COUNTDOWN_MS;
    state = fill(state, "p1", finalStart + 2000, 2);
    state = solve(state, "p2", finalStart + 3000);
    expect(logicGame.isFinished(state)).toBe(true);
    const view = logicGame.viewFor(state, "p1");
    expect(view.standings.map((s) => s.nickname)).toEqual(["Bola", "Ada", "Chidi"]);
    expect(view.winnerId).toBe("p2");
    expect(logicGame.summarize(state).mode).toBe("elimination");
  });

  it("gives the final to the most cells filled when time runs out", () => {
    let state = elim(["Ada", "Bola", "Chidi"]);
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000);
    const nextAt = START + 6000 + LOGIC_CUT_MS;
    state = logicGame.tick(state, nextAt);
    const finalStart = nextAt + LOGIC_COUNTDOWN_MS;
    state = fill(state, "p1", finalStart + 2000, 1);
    state = fill(state, "p2", finalStart + 3000, 2);
    state = logicGame.tick(state, finalStart + FIVE_MINUTES);
    expect(logicGame.isFinished(state)).toBe(true);
    expect(state.winnerId).toBe("p2");
  });

  it("a late joiner watches, and someone back after a cut they missed watches too", () => {
    let state = elim();
    state = logicGame.onPlayerJoined(state, { id: "p9", nickname: "Kemi" }, START + 1000);
    expect(logicGame.viewFor(state, "p9").grid).toBeNull();
    state = logicGame.onPlayerLeft(state, "p5", START + 1000);
    // Back in the same round: carries on.
    const back = logicGame.onPlayerJoined(state, { id: "p5", nickname: "Efe" }, START + 2000);
    expect(logicGame.viewFor(back, "p5").grid).not.toBeNull();
    // Back after a cut: watches.
    state = logicGame.tick(state, START + FIVE_MINUTES);
    state = logicGame.onPlayerJoined(
      state,
      { id: "p5", nickname: "Efe" },
      START + FIVE_MINUTES + 1,
    );
    state = logicGame.tick(state, START + FIVE_MINUTES + LOGIC_CUT_MS);
    expect(logicGame.viewFor(state, "p5").grid).toBeNull();
  });
});
