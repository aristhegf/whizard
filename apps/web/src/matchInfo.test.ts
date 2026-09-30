import type { MatchRecord } from "@whizard/protocol";
import { describe, expect, it } from "vitest";
import { bestOf, clock, dayLabel, matchTitle, solveTime, withWhom } from "./matchInfo";

const match = (overrides: Partial<MatchRecord>): MatchRecord => ({
  id: "m1",
  game: "quiz",
  category: null,
  difficulty: null,
  mode: null,
  rounds: 10,
  startedAt: 0,
  finishedAt: 60_000,
  myCorrect: null,
  players: [{ nickname: "Ada", avatar: null, username: "ada", placing: 1, score: 0, isMe: true }],
  ...overrides,
});

describe("game titles", () => {
  it("names each game and its level", () => {
    expect(matchTitle({ game: "quiz", category: "bible", difficulty: "medium" })).toBe(
      "Bible Quiz · Medium",
    );
    // Games without a topic are named after the game, not the quiz.
    expect(matchTitle({ game: "spot-it", category: null, difficulty: "auto" })).toBe(
      "Spot It · Auto",
    );
    expect(matchTitle({ game: "word-rush", category: null, difficulty: "hard" })).toBe(
      "Word Rush · Hard",
    );
    expect(matchTitle({ game: "jigsaw", category: "lagos", difficulty: "medium" })).toBe(
      "Jigsaw · Medium",
    );
    expect(matchTitle({ game: "logic", category: null, difficulty: "6x6" })).toBe(
      "Logic · Medium 6×6",
    );
    expect(matchTitle({ game: "connections", category: null, difficulty: "hard" })).toBe(
      "Connections · Hard",
    );
  });

  it("falls back to the picture for older jigsaws", () => {
    expect(matchTitle({ game: "jigsaw", category: "photo", difficulty: "4" })).toBe(
      "Jigsaw · Your photo",
    );
  });
});

describe("history details", () => {
  it("says who else played", () => {
    const player = (nickname: string) => ({
      nickname,
      avatar: null,
      username: null,
      placing: 2,
      score: 0,
      isMe: false,
    });
    expect(withWhom(match({}))).toBe("Solo");
    const me = match({}).players;
    expect(withWhom(match({ players: [...me, player("Tolu")] }))).toBe("with Tolu");
    expect(
      withWhom(
        match({ players: [...me, player("Tolu"), player("Kemi"), player("Bayo"), player("Zee")] }),
      ),
    ).toBe("with Tolu, Kemi +2");
  });

  it("times solo puzzles that were solved", () => {
    const jigsaw = { game: "jigsaw", rounds: 25, startedAt: 1000, finishedAt: 135_000 };
    expect(solveTime(match({ ...jigsaw, myCorrect: 25 }))).toBe(134_000);
    expect(solveTime(match({ ...jigsaw, myCorrect: 20 }))).toBeNull();
    expect(solveTime(match({ game: "quiz", myCorrect: 10 }))).toBeNull();
  });

  it("reads days and times the way people say them", () => {
    const now = new Date(2026, 8, 30, 12).getTime();
    expect(dayLabel(new Date(2026, 8, 30, 1).getTime(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 8, 29, 23).getTime(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 8, 26, 9).getTime(), now)).toMatch(/Sat/);
    expect(dayLabel(new Date(2026, 2, 3).getTime(), now)).toMatch(/3/);
    expect(clock(134_000)).toBe("2:14");
    expect(clock(3_725_000)).toBe("1:02:05");
  });

  it("describes each kind of best", () => {
    expect(bestOf("quiz", { kind: "accuracy", value: 0.81, category: "bible" })).toEqual({
      label: "Best topic",
      value: "Bible 81%",
    });
    expect(bestOf("jigsaw", { kind: "time", value: 134_000, difficulty: "medium" })).toEqual({
      label: "Fastest",
      value: "2:14",
      on: "Medium",
    });
    expect(bestOf("logic", { kind: "time", value: 242_000, difficulty: "6x6" })).toMatchObject({
      on: "6×6",
    });
    expect(bestOf("word-rush", { kind: "score", value: 8420 })).toEqual({
      label: "Best score",
      value: "8,420",
    });
  });
});
