import { LEVELS } from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { CONNECTIONS, drawConnections, drawContent } from "./index";

describe("connections puzzles", () => {
  it("has a dozen puzzles at each level, with unique IDs", () => {
    for (const level of LEVELS) {
      expect(CONNECTIONS.filter((p) => p.level === level).length).toBeGreaterThanOrEqual(12);
    }
    expect(new Set(CONNECTIONS.map((p) => p.id)).size).toBe(CONNECTIONS.length);
  });

  it("never uses the same group twice", () => {
    const groups = CONNECTIONS.flatMap((p) => p.groups.map((g) => [...g.words].sort().join("|")));
    expect(new Set(groups).size).toBe(groups.length);
  });
});

describe("drawConnections", () => {
  it("draws one puzzle at the level asked for, the same one for the same seed", () => {
    for (const level of LEVELS) {
      const [puzzle] = drawConnections(level, 7);
      expect(puzzle?.level).toBe(level);
      expect(drawConnections(level, 7)).toEqual([puzzle]);
    }
  });

  it("avoids puzzles the room played lately and the players have seen", () => {
    const easy = CONNECTIONS.filter((p) => p.level === "easy");
    const recent = easy.slice(0, -1).map((p) => p.id);
    expect(drawConnections("easy", 3, { recent })[0]?.id).toBe(easy.at(-1)?.id);
    const seen = new Map(easy.slice(1).map((p) => [p.id, { players: 1, lastSeenAt: 1 }]));
    expect(drawConnections("easy", 3, { seen })[0]?.id).toBe(easy[0]?.id);
  });

  it("draws one different puzzle per round for Elimination, still avoiding repeats", () => {
    const puzzles = drawConnections("medium", 7, {}, CONNECTIONS, 4);
    expect(puzzles).toHaveLength(4);
    expect(new Set(puzzles.map((p) => p.id)).size).toBe(4);
    expect(puzzles.every((p) => p.level === "medium")).toBe(true);
    // The first is the one a single draw gets.
    expect(puzzles[0]).toEqual(drawConnections("medium", 7)[0]);
    const medium = CONNECTIONS.filter((p) => p.level === "medium");
    const recent = medium.slice(0, -3).map((p) => p.id);
    const fresh = drawConnections("medium", 7, { recent }, CONNECTIONS, 3).map((p) => p.id);
    expect(fresh.sort()).toEqual(
      medium
        .slice(-3)
        .map((p) => p.id)
        .sort(),
    );
  });

  it("is what drawContent returns for a connections request", () => {
    expect(drawContent({ kind: "connections-puzzle", level: "hard" }, 5)).toEqual(
      drawConnections("hard", 5),
    );
    expect(drawContent({ kind: "connections-puzzle", level: "easy", count: 3 }, 5)).toEqual(
      drawConnections("easy", 5, {}, CONNECTIONS, 3),
    );
  });
});
