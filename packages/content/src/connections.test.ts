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

  it("is what drawContent returns for a connections request", () => {
    expect(drawContent({ kind: "connections-puzzle", level: "hard" }, 5)).toEqual(
      drawConnections("hard", 5),
    );
  });
});
