import { describe, expect, it } from "vitest";
import { isRejection } from "../types";
import {
  CONNECTIONS_CLASSIC_LIMIT_MS,
  CONNECTIONS_COUNTDOWN_MS,
  CONNECTIONS_CUT_MS,
  CONNECTIONS_MAX_MISTAKES,
  connectionsGame,
  type ConnectionsState,
} from "./connections";
import {
  connectionsSettingsSchema,
  type ConnectionsMode,
  type ConnectionsPuzzle,
} from "./settings";

const T0 = 1_000_000;
const START = T0 + CONNECTIONS_COUNTDOWN_MS;
const FIVE_MINUTES = 5 * 60_000;

const PUZZLE: ConnectionsPuzzle = {
  id: "connections-test",
  level: "easy",
  groups: [
    { name: "Fruits", words: ["MANGO", "PAWPAW", "GUAVA", "PINEAPPLE"] },
    { name: "Colours", words: ["RED", "BLUE", "GREEN", "YELLOW"] },
    { name: "Animals", words: ["LION", "GOAT", "ZEBRA", "CAMEL"] },
    { name: "Joints", words: ["KNEE", "ELBOW", "ANKLE", "WRIST"] },
  ],
};
const group = (i: number) => PUZZLE.groups[i]!.words;

/** Another puzzle, for Elimination's later rounds: the same groups with the words numbered. */
const puzzleNo = (n: number): ConnectionsPuzzle =>
  n === 0
    ? PUZZLE
    : {
        id: `connections-test-${n}`,
        level: "easy",
        groups: PUZZLE.groups.map((g) => ({ ...g, words: g.words.map((w) => `${w}${n}`) })),
      };

function game(
  nicknames = ["Ada", "Tolu"],
  minutes: 3 | 5 | 10 = 5,
  mode: ConnectionsMode = "speed",
  content = [PUZZLE],
): ConnectionsState {
  return connectionsGame.setup({
    settings: { mode, level: "easy", minutes },
    players: nicknames.map((nickname, i) => ({ id: `p${i + 1}`, nickname })),
    content,
    seed: 42,
    now: T0,
  });
}

function guess(state: ConnectionsState, playerId: string, words: string[], now = START + 1000) {
  return connectionsGame.onAction(state, playerId, { type: "guess", words }, now);
}

function act(state: ConnectionsState, playerId: string, words: string[], now = START + 1000) {
  const next = guess(state, playerId, words, now);
  if (isRejection(next)) throw new Error(next.rejected);
  return next;
}

/** A wrong guess: one word from each group. */
const wrong = (n: number) => [group(0)[n]!, group(1)[n]!, group(2)[n]!, group(3)[n]!];

describe("connections settings", () => {
  it("reads rooms saved before modes as Speed, and starts new ones on Speed", () => {
    expect(connectionsSettingsSchema.parse({ level: "hard", minutes: 3 })).toEqual({
      mode: "speed",
      level: "hard",
      minutes: 3,
    });
    expect(connectionsGame.defaultSettings.mode).toBe("speed");
    expect(
      connectionsSettingsSchema.safeParse({ mode: "relay", level: "hard", minutes: 3 }).success,
    ).toBe(false);
  });

  it("asks for one puzzle for a race, and one per round for Elimination", () => {
    const settings = { level: "medium", minutes: 5 } as const;
    expect(connectionsGame.contentNeeded({ ...settings, mode: "speed" }, 5)).toEqual({
      kind: "connections-puzzle",
      level: "medium",
    });
    // Five players: three knock-out rounds and the final.
    expect(connectionsGame.contentNeeded({ ...settings, mode: "elimination" }, 5)).toEqual({
      kind: "connections-puzzle",
      level: "medium",
      count: 4,
    });
  });
});

describe("connections", () => {
  it("shows everyone the same sixteen words, and counts down before it starts", () => {
    const state = game();
    const a = connectionsGame.viewFor(state, "p1");
    const b = connectionsGame.viewFor(state, "p2");
    expect(a.words).toHaveLength(16);
    expect(a.words).toEqual(b.words);
    expect(a.startsAt).toBe(START);
    expect(a.deadline).toBe(START + FIVE_MINUTES);
    expect(a.answer).toBeNull();
    expect([a.mode, a.round, a.cut]).toEqual(["speed", null, null]);
    const early = guess(state, "p1", group(0), T0);
    expect(isRejection(early) && early.rejected).toBe("The puzzle hasn't started.");
  });

  it("locks in a group, in any case and any order, and takes its words off the board", () => {
    let state = game();
    state = act(state, "p1", ["yellow", "Red", "GREEN", "blue"]);
    const view = connectionsGame.viewFor(state, "p1");
    expect(view.found).toEqual([{ ...PUZZLE.groups[1], colour: 1 }]);
    expect(view.words).toHaveLength(12);
    expect(view.words).not.toContain("RED");
    // Only your own board changes.
    expect(connectionsGame.viewFor(state, "p2").words).toHaveLength(16);
    expect(view.standings.find((s) => s.playerId === "p1")?.found).toBe(1);
  });

  it("counts a wrong guess, says when it was one away, and won't take it twice", () => {
    let state = game();
    state = act(state, "p1", [...group(0).slice(0, 3), group(1)[0]!]);
    let view = connectionsGame.viewFor(state, "p1");
    expect(view.mistakesLeft).toBe(CONNECTIONS_MAX_MISTAKES - 1);
    expect(view.oneAway).toBe(true);
    const again = guess(state, "p1", [group(1)[0]!, ...group(0).slice(0, 3)]);
    expect(isRejection(again) && again.rejected).toBe("You've tried those four.");
    state = act(state, "p1", wrong(0));
    view = connectionsGame.viewFor(state, "p1");
    expect(view.oneAway).toBe(false);
    expect(view.tried).toHaveLength(2);
  });

  it("turns down guesses that aren't four different words on the board", () => {
    let state = game();
    const twice = guess(state, "p1", ["MANGO", "MANGO", "GUAVA", "PAWPAW"]);
    expect(isRejection(twice) && twice.rejected).toBe("Pick four different words.");
    const missing = guess(state, "p1", ["MANGO", "PAWPAW", "GUAVA", "APPLE"]);
    expect(isRejection(missing) && missing.rejected).toBe("Pick words from the board.");
    state = act(state, "p1", group(0));
    const placed = guess(state, "p1", ["MANGO", "RED", "LION", "KNEE"]);
    expect(isRejection(placed) && placed.rejected).toBe("Pick words from the board.");
  });

  it("ends your puzzle after four mistakes and shows you the answer", () => {
    let state = game();
    for (let i = 0; i < CONNECTIONS_MAX_MISTAKES; i++) state = act(state, "p1", wrong(i));
    const view = connectionsGame.viewFor(state, "p1");
    expect(view.mistakesLeft).toBe(0);
    expect(view.answer).toHaveLength(4);
    expect(view.me?.done).toBe(true);
    expect(view.me?.solved).toBe(false);
    const more = guess(state, "p1", group(0));
    expect(isRejection(more) && more.rejected).toBe("You're out of mistakes.");
    // The other player's puzzle is still secret.
    expect(connectionsGame.viewFor(state, "p2").answer).toBeNull();
  });

  it("ranks the fastest solver first, then most groups, then fewest mistakes", () => {
    let state = game(["Ada", "Tolu", "Kemi"]);
    for (const i of [0, 1, 2, 3]) state = act(state, "p2", group(i), START + 5000);
    for (const i of [0, 1, 2, 3]) state = act(state, "p1", group(i), START + 9000);
    state = act(state, "p3", wrong(0));
    state = act(state, "p3", group(0));
    expect(connectionsGame.isFinished(state)).toBe(false);
    const view = connectionsGame.viewFor(state, "p1");
    expect(view.standings.map((s) => s.nickname)).toEqual(["Tolu", "Ada", "Kemi"]);
    expect(view.standings[0]?.timeMs).toBe(5000);
  });

  it("ends when everyone is done or out of time, and scores the groups found", () => {
    let state = game(["Ada", "Tolu"], 3);
    for (const i of [0, 1, 2, 3]) state = act(state, "p1", group(i));
    state = act(state, "p2", group(3));
    expect(connectionsGame.nextWakeAt(state)).toBe(START + 3 * 60_000);
    state = connectionsGame.tick(state, START + 3 * 60_000);
    expect(connectionsGame.isFinished(state)).toBe(true);
    const summary = connectionsGame.summarize(state);
    expect(summary.rounds).toBe(4);
    expect(summary.mode).toBe("speed");
    expect(summary.players).toEqual([
      { playerId: "p1", placing: 1, score: 700, correct: 4 },
      { playerId: "p2", placing: 2, score: 250, correct: 1 },
    ]);
    expect(connectionsGame.viewFor(state, "p2").answer).toHaveLength(4);
  });

  it("gives a late joiner the same words with their own clock", () => {
    let state = game(["Ada"]);
    state = act(state, "p1", group(0));
    state = connectionsGame.onPlayerJoined(state, { id: "p2", nickname: "Tolu" }, START + 20_000);
    const view = connectionsGame.viewFor(state, "p2");
    expect(view.words).toHaveLength(16);
    expect(view.startsAt).toBe(START + 20_000 + CONNECTIONS_COUNTDOWN_MS);
  });

  it("Classic shows no clock, and only stops a player after an hour", () => {
    let state = game(["Ada", "Tolu"], 5, "classic");
    const view = connectionsGame.viewFor(state, "p1");
    expect(view.deadline).toBeNull();
    expect(view.mode).toBe("classic");
    expect(connectionsGame.nextWakeAt(state)).toBe(START + CONNECTIONS_CLASSIC_LIMIT_MS);
    // Well past the minutes setting, still playing.
    state = connectionsGame.tick(state, START + 20 * 60_000);
    state = act(state, "p1", group(0), START + 20 * 60_000);
    for (const i of [1, 2, 3]) state = act(state, "p1", group(i), START + 21 * 60_000);
    expect(connectionsGame.isFinished(state)).toBe(false);
    state = connectionsGame.tick(state, START + CONNECTIONS_CLASSIC_LIMIT_MS);
    expect(connectionsGame.isFinished(state)).toBe(true);
    expect(connectionsGame.summarize(state).mode).toBe("classic");
    expect(state.players.map((p) => p.outOf)).toEqual([null, "time"]);
  });

  it("carries on a game saved before modes, as a Speed race", () => {
    const fresh = game(["Ada", "Tolu"], 3);
    const legacy = {
      settings: { level: "easy", minutes: 3 },
      puzzle: PUZZLE,
      order: fresh.orders[0],
      players: fresh.players.map(({ id, nickname, left, found, tried, oneAway, startsAt }) => ({
        id,
        nickname,
        left,
        found,
        tried,
        oneAway,
        startsAt,
        finishedAt: null,
        outOf: null,
      })),
      finishedAt: null,
    } as unknown as ConnectionsState;
    const view = connectionsGame.viewFor(legacy, "p1");
    expect([view.mode, view.round, view.deadline]).toEqual(["speed", null, START + 3 * 60_000]);
    expect(view.words).toEqual(fresh.orders[0]);
    let state = legacy;
    for (const i of [0, 1, 2, 3]) state = act(state, "p1", group(i));
    expect(connectionsGame.viewFor(state, "p1").me?.solved).toBe(true);
    state = connectionsGame.tick(state, START + 3 * 60_000);
    expect(connectionsGame.isFinished(state)).toBe(true);
    expect(connectionsGame.summarize(state).mode).toBe("speed");
  });
});

describe("connections elimination", () => {
  const five = ["Ada", "Bola", "Chidi", "Dayo", "Efe"];
  const elim = (names = five) => game(names, 5, "elimination", [0, 1, 2, 3, 4, 5].map(puzzleNo));
  /** The groups of the puzzle being played now. */
  const groupsNow = (state: ConnectionsState) =>
    state.puzzles[state.round]!.groups.map((g) => g.words);
  /** Finds `count` groups (all four by default) for one player in the round being played. */
  const solve = (state: ConnectionsState, playerId: string, now: number, count = 4) =>
    groupsNow(state)
      .slice(0, count)
      .reduce((s, words) => act(s, playerId, words, now), state);

  /** Wrong guesses, from the words still on the board, until out of mistakes. */
  const runOut = (state: ConnectionsState, playerId: string, found: number) => {
    const [a, b] = groupsNow(state).slice(found);
    let s = state;
    for (let i = 0; i < CONNECTIONS_MAX_MISTAKES; i++) {
      const j = (i + 1) % 4;
      s = act(s, playerId, [a![i]!, a![j]!, b![i]!, b![j]!]);
    }
    return s;
  };

  it("needs three players, and plans knock-out rounds and a final, each a new puzzle", () => {
    expect(
      connectionsGame.playersNeeded!({ mode: "elimination", level: "easy", minutes: 5 })?.min,
    ).toBe(3);
    expect(connectionsGame.playersNeeded!({ mode: "speed", level: "easy", minutes: 5 })).toBeNull();
    const state = elim();
    expect(state.puzzles.map((p) => p.id)).toEqual([0, 1, 2, 3].map((n) => puzzleNo(n).id));
    const view = connectionsGame.viewFor(state, "p1");
    expect(view.round).toEqual({ index: 0, total: 4, final: false });
    expect(view.deadline).toBe(START + FIVE_MINUTES);
    // Fewer puzzles than rounds: they come round again rather than the game stopping short.
    expect(game(five, 5, "elimination").puzzles).toHaveLength(4);
  });

  it("keeps solvers safe, knocks out the fewest groups when time runs out, then moves on", () => {
    let state = elim();
    state = solve(state, "p1", START + 10_000);
    state = solve(state, "p2", START + 12_000, 3);
    state = solve(state, "p3", START + 12_000, 2);
    state = solve(state, "p4", START + 13_000, 2);
    state = solve(state, "p5", START + 14_000, 1);
    expect(connectionsGame.nextWakeAt(state)).toBe(START + FIVE_MINUTES);
    state = connectionsGame.tick(state, START + FIVE_MINUTES);

    // Five players, three knock-out rounds: one goes out each round, the fewest groups.
    const view = connectionsGame.viewFor(state, "p5");
    expect(view.cut?.out.map((o) => o.nickname)).toEqual(["Efe"]);
    expect(view.cut?.nextAt).toBe(START + FIVE_MINUTES + CONNECTIONS_CUT_MS);
    expect(view.me?.out).toBe(true);
    expect(view.me?.outRound).toBe(0);
    expect(view.words).toBeNull();
    const early = guess(state, "p1", group(0), START + FIVE_MINUTES + 10);
    expect(isRejection(early) && early.rejected).toBe("The next round hasn't started.");

    // After the cut shows, the next round starts on its own, with a new puzzle.
    const nextAt = START + FIVE_MINUTES + CONNECTIONS_CUT_MS;
    expect(connectionsGame.nextWakeAt(state)).toBe(nextAt);
    state = connectionsGame.tick(state, nextAt);
    const next = connectionsGame.viewFor(state, "p1");
    expect(next.round?.index).toBe(1);
    expect(next.startsAt).toBe(nextAt + CONNECTIONS_COUNTDOWN_MS);
    expect(next.deadline).toBe(nextAt + CONNECTIONS_COUNTDOWN_MS + FIVE_MINUTES);
    expect(next.me?.found).toBe(0);
    expect(next.words).toContain("MANGO1");
    expect(next.answer).toBeNull();
    // The knocked out watch the others' progress.
    const watching = connectionsGame.viewFor(state, "p5");
    expect(watching.words).toBeNull();
    expect(watching.startsAt).toBe(nextAt + CONNECTIONS_COUNTDOWN_MS);
    expect(watching.standings.map((s) => s.nickname).at(-1)).toBe("Efe");
    const out = guess(state, "p5", ["MANGO1", "PAWPAW1", "GUAVA1", "PINEAPPLE1"], nextAt + 4000);
    expect(isRejection(out) && out.rejected).toBe("You're watching this game.");
  });

  it("breaks a tie on groups found against whoever got there later", () => {
    let state = elim(["Ada", "Bola", "Chidi", "Dayo"]);
    // Four players, two knock-out rounds: one goes out now.
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000);
    state = solve(state, "p3", START + 20_000, 2);
    state = solve(state, "p4", START + 10_000, 2);
    state = connectionsGame.tick(state, START + FIVE_MINUTES);
    expect(state.lastCut?.out).toEqual(["p3"]);
  });

  it("counts running out of mistakes as done but not solved", () => {
    let state = elim(["Ada", "Bola", "Chidi"]);
    // Three players, one knock-out round: two stay in.
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000, 2);
    state = runOut(state, "p2", 2);
    expect(state.phase).toBe("play");
    state = solve(state, "p3", START + 7000, 1);
    state = runOut(state, "p3", 1);
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
    state = connectionsGame.tick(state, START + 6000 + CONNECTIONS_CUT_MS);
    expect(connectionsGame.viewFor(state, "p1").round?.final).toBe(true);
    const finalStart = START + 6000 + CONNECTIONS_CUT_MS + CONNECTIONS_COUNTDOWN_MS;
    state = solve(state, "p1", finalStart + 2000, 3);
    state = solve(state, "p2", finalStart + 3000);
    expect(connectionsGame.isFinished(state)).toBe(true);
    const view = connectionsGame.viewFor(state, "p1");
    expect(view.standings.map((s) => s.nickname)).toEqual(["Bola", "Ada", "Chidi"]);
    expect(view.winnerId).toBe("p2");
    const summary = connectionsGame.summarize(state);
    expect(summary.mode).toBe("elimination");
    expect(summary.players.map((p) => p.playerId)).toEqual(["p2", "p1", "p3"]);
  });

  it("gives the final to the most groups found when time runs out", () => {
    let state = elim(["Ada", "Bola", "Chidi"]);
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000);
    const nextAt = START + 6000 + CONNECTIONS_CUT_MS;
    state = connectionsGame.tick(state, nextAt);
    const finalStart = nextAt + CONNECTIONS_COUNTDOWN_MS;
    state = solve(state, "p1", finalStart + 2000, 1);
    state = solve(state, "p2", finalStart + 3000, 2);
    state = connectionsGame.tick(state, finalStart + FIVE_MINUTES);
    expect(connectionsGame.isFinished(state)).toBe(true);
    expect(state.winnerId).toBe("p2");
  });

  it("goes straight to the final when leavers leave only two", () => {
    let state = elim();
    state = connectionsGame.onPlayerLeft(state, "p4", START + 1000);
    state = connectionsGame.onPlayerLeft(state, "p5", START + 1000);
    state = connectionsGame.onPlayerLeft(state, "p3", START + 1000);
    state = connectionsGame.tick(state, START + FIVE_MINUTES);
    expect(state.phase).toBe("play");
    expect(connectionsGame.viewFor(state, "p1").round?.final).toBe(true);
    // And ends with a winner when only one is left.
    state = connectionsGame.onPlayerLeft(state, "p2", START + FIVE_MINUTES + 1000);
    expect(state.winnerId).toBe("p1");
    expect(connectionsGame.isFinished(state)).toBe(true);
  });

  it("a late joiner watches, and someone back after a cut they missed watches too", () => {
    let state = elim();
    state = connectionsGame.onPlayerJoined(state, { id: "p9", nickname: "Kemi" }, START + 1000);
    expect(connectionsGame.viewFor(state, "p9").words).toBeNull();
    expect(connectionsGame.viewFor(state, "p9").standings).toHaveLength(6);
    state = connectionsGame.onPlayerLeft(state, "p5", START + 1000);
    // Back in the same round: carries on.
    const back = connectionsGame.onPlayerJoined(state, { id: "p5", nickname: "Efe" }, START + 2000);
    expect(connectionsGame.viewFor(back, "p5").words).toHaveLength(16);
    // Back after a cut: watches.
    state = connectionsGame.tick(state, START + FIVE_MINUTES);
    state = connectionsGame.onPlayerJoined(
      state,
      { id: "p5", nickname: "Efe" },
      START + FIVE_MINUTES + 1,
    );
    state = connectionsGame.tick(state, START + FIVE_MINUTES + CONNECTIONS_CUT_MS);
    expect(connectionsGame.viewFor(state, "p5").words).toBeNull();
  });
});
