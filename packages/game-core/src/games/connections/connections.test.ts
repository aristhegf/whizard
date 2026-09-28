import { describe, expect, it } from "vitest";
import { isRejection } from "../types";
import {
  CONNECTIONS_COUNTDOWN_MS,
  CONNECTIONS_MAX_MISTAKES,
  connectionsGame,
  type ConnectionsState,
} from "./connections";
import type { ConnectionsPuzzle } from "./settings";

const T0 = 1_000_000;
const START = T0 + CONNECTIONS_COUNTDOWN_MS;

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

function game(nicknames = ["Ada", "Tolu"], minutes: 3 | 5 | 10 = 5): ConnectionsState {
  return connectionsGame.setup({
    settings: { level: "easy", minutes },
    players: nicknames.map((nickname, i) => ({ id: `p${i + 1}`, nickname })),
    content: [PUZZLE],
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

describe("connections", () => {
  it("shows everyone the same sixteen words, and counts down before it starts", () => {
    const state = game();
    const a = connectionsGame.viewFor(state, "p1");
    const b = connectionsGame.viewFor(state, "p2");
    expect(a.words).toHaveLength(16);
    expect(a.words).toEqual(b.words);
    expect(a.startsAt).toBe(START);
    expect(a.answer).toBeNull();
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
});
