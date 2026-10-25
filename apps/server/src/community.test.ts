import { describe, expect, it } from "vitest";
import { buildCommunityStats } from "./community";
import { addGame, addUser, testDb } from "./testDb";

describe("community leaderboard", () => {
  it("includes every signed-in user who wins a multiplayer game by default", async () => {
    const db = await testDb();
    await addUser(db, "ada", "Ada Lovelace");
    await addUser(db, "tolu", "Tolu");

    // Ada wins a game with Tolu (placing 1, 2 players)
    await addGame(db, {
      category: "history",
      finishedAt: Date.now(),
      players: [
        ["ada", 1200, 6],
        ["tolu", 800, 4],
      ],
    });

    const stats = await buildCommunityStats(db, Date.now());
    expect(stats.leaderboard).toHaveLength(1);
    expect(stats.leaderboard[0]).toEqual({
      username: "ada",
      displayName: "Ada Lovelace",
      avatar: null,
      wins: 1,
    });
  });

  it("does not include suspended users on the leaderboard", async () => {
    const db = await testDb();
    await addUser(db, "cheater", "Banned Player");
    await addUser(db, "friend", "Friend");
    await db
      .prepare("UPDATE users SET suspended_at = ? WHERE id = ?")
      .bind(Date.now(), "cheater")
      .run();

    await addGame(db, {
      category: "history",
      finishedAt: Date.now(),
      players: [
        ["cheater", 1200, 6],
        ["friend", 800, 4],
      ],
    });

    const stats = await buildCommunityStats(db, Date.now());
    expect(stats.leaderboard).toHaveLength(0);
  });
});
