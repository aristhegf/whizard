import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import { playerProfile } from "./profiles";
import { addGame, addUser, makeFriends, testDb } from "./testDb";

async function seed() {
  const db = await testDb();
  await addUser(db, "ada", "Ada");
  await addUser(db, "tolu", "Tolu");
  await addUser(db, "kemi", "Kemi");
  await makeFriends(db, "ada", "tolu", 5);
  await addGame(db, {
    category: "bible",
    finishedAt: 100,
    players: [
      ["ada", 1200, 8],
      ["tolu", 900, 6],
    ],
  });
  await addGame(db, {
    game: "word-rush",
    finishedAt: 200,
    players: [
      ["tolu", 5000, 9],
      ["ada", 3000, 6],
    ],
  });
  // A guest won this one; Ada still placed higher than Tolu.
  await addGame(db, {
    category: "music",
    finishedAt: 300,
    players: [
      [null, 1500, 9],
      ["ada", 1000, 7],
      ["tolu", 400, 3],
    ],
  });
  for (const finishedAt of [400, 500, 600]) {
    await addGame(db, { game: "spot-it", finishedAt, players: [["tolu", 700, 7]] });
  }
  // Kemi played with Ada, but they aren't friends.
  await addGame(db, {
    finishedAt: 700,
    players: [
      ["kemi", 900, 7],
      ["ada", 800, 6],
    ],
  });
  return { DB: db } as unknown as Env;
}

describe("player profiles", () => {
  it("shows a friend's record, stats and games together", async () => {
    const profile = await playerProfile(await seed(), "ada", "Tolu");
    expect(profile.user).toEqual({ username: "tolu", displayName: "Tolu", avatar: null });
    expect(profile.relation).toBe("friend");
    expect(profile.friend).toMatchObject({
      since: 5,
      muted: false,
      record: { games: 3, wins: 2, losses: 1 },
      stats: { played: 6, wins: 1, topGame: "spot-it" },
    });
    expect(
      profile.friend?.together.map((m) => [m.game, m.myPlacing, m.theirPlacing, m.playerCount]),
    ).toEqual([
      ["quiz", 2, 3, 3],
      ["word-rush", 2, 1, 2],
      ["quiz", 1, 2, 2],
    ]);
    expect(profile.friend?.together[2]).toMatchObject({ category: "bible", finishedAt: 100 });
  });

  it("shows only who they are to someone who isn't a friend", async () => {
    const env = await seed();
    expect(await playerProfile(env, "ada", "kemi")).toEqual({
      user: { username: "kemi", displayName: "Kemi", avatar: null },
      relation: "none",
      friend: null,
    });
    await env.DB.prepare(
      "INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, 0)",
    )
      .bind("kemi", "ada")
      .run();
    expect(await playerProfile(env, "ada", "kemi")).toMatchObject({
      relation: "incoming",
      friend: null,
    });
    expect((await playerProfile(env, "ada", "ada")).relation).toBe("self");
  });

  it("says so when nobody has the username", async () => {
    await expect(playerProfile(await seed(), "ada", "nobody")).rejects.toMatchObject({
      status: 404,
    });
  });
});
