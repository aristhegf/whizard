import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import { localDay, playerStats, streakOf } from "./matches";
import { addGame, addUser, testDb } from "./testDb";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 8, 30, 12);
/** Midnight UTC, this many days before today. */
const daysAgo = (n: number) => Date.UTC(2026, 8, 30) - n * DAY;

describe("streaks", () => {
  it("counts the run that reaches today or yesterday, and the longest", () => {
    expect(streakOf([], 100)).toEqual({ current: 0, best: 0 });
    expect(streakOf([90, 91, 92, 93, 98, 99, 100], 100)).toEqual({ current: 3, best: 4 });
    expect(streakOf([97, 98, 99], 100)).toEqual({ current: 3, best: 3 });
    // Nothing yesterday or today: the run is over.
    expect(streakOf([96, 97, 98], 100)).toEqual({ current: 0, best: 3 });
  });

  it("reads the day in the player's own time zone", () => {
    const late = Date.UTC(2026, 8, 29, 23, 30);
    expect(localDay(late, 0)).toBe(localDay(Date.UTC(2026, 8, 29), 0));
    expect(localDay(late, 60)).toBe(localDay(Date.UTC(2026, 8, 30), 0));
    expect(localDay(late, -5 * 60)).toBe(localDay(Date.UTC(2026, 8, 29), 0));
  });
});

describe("a player's stats", () => {
  async function seed() {
    const db = await testDb();
    await addUser(db, "ada");
    await addUser(db, "tolu");
    // An older run of four days of quizzes.
    for (let n = 10; n >= 7; n--) {
      await addGame(db, {
        category: "general-knowledge",
        finishedAt: daysAgo(n) + 10 * HOUR,
        players: [["ada", 500, 5]],
      });
    }
    await addGame(db, {
      category: "bible",
      finishedAt: daysAgo(2) + 10 * HOUR,
      players: [["ada", 900, 8]],
    });
    // Late in the evening, UTC.
    await addGame(db, {
      category: "history",
      finishedAt: daysAgo(1) + 23.5 * HOUR,
      players: [
        ["ada", 1200, 6],
        ["tolu", 800, 4],
      ],
    });
    // Jigsaws on your own: two solved, one not finished.
    await addGame(db, {
      game: "jigsaw",
      difficulty: "medium",
      rounds: 25,
      startedAt: daysAgo(0) + 9 * HOUR - 134_000,
      finishedAt: daysAgo(0) + 9 * HOUR,
      players: [["ada", 2500, 25]],
    });
    await addGame(db, {
      game: "jigsaw",
      difficulty: "hard",
      rounds: 36,
      startedAt: daysAgo(0) + 8 * HOUR - 200_000,
      finishedAt: daysAgo(0) + 8 * HOUR,
      players: [["ada", 3600, 36]],
    });
    await addGame(db, {
      game: "jigsaw",
      difficulty: "easy",
      rounds: 16,
      startedAt: daysAgo(0) + 7 * HOUR - 50_000,
      finishedAt: daysAgo(0) + 7 * HOUR,
      players: [["ada", 1000, 10]],
    });
    await addGame(db, {
      game: "word-rush",
      difficulty: "auto",
      finishedAt: daysAgo(0) + 6 * HOUR,
      players: [
        ["tolu", 5000, 8],
        ["ada", 3000, 6],
      ],
    });
    await addGame(db, {
      game: "word-rush",
      difficulty: "auto",
      finishedAt: daysAgo(0) + 5 * HOUR,
      players: [["ada", 8420, 10]],
    });
    return { DB: db } as unknown as Env;
  }

  it("totals, per game, with each game's best", async () => {
    const stats = await playerStats(await seed(), "ada", 0, now);
    expect(stats.played).toBe(11);
    expect(stats.groupGames).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.categories[0]).toEqual({ category: "bible", games: 1, accuracy: 0.8 });
    expect(stats.games).toEqual([
      {
        game: "quiz",
        played: 6,
        wins: 1,
        best: { kind: "accuracy", value: 0.8, category: "bible" },
      },
      {
        game: "jigsaw",
        played: 3,
        wins: 0,
        // The fastest solve, not the unfinished one.
        best: { kind: "time", value: 134_000, difficulty: "medium" },
      },
      { game: "word-rush", played: 2, wins: 0, best: { kind: "score", value: 8420 } },
    ]);
  });

  it("counts the streak by the player's own days", async () => {
    const env = await seed();
    expect((await playerStats(env, "ada", 0, now)).streak).toEqual({ current: 3, best: 4 });
    // An hour ahead of UTC, yesterday's late game was today, so yesterday has none.
    expect((await playerStats(env, "ada", 60, now)).streak).toEqual({ current: 1, best: 4 });
  });

  it("is empty for someone who hasn't played", async () => {
    const env = await seed();
    await addUser(env.DB, "kemi");
    expect(await playerStats(env, "kemi", 0, now)).toEqual({
      played: 0,
      groupGames: 0,
      wins: 0,
      categories: [],
      games: [],
      streak: { current: 0, best: 0 },
    });
  });
});
