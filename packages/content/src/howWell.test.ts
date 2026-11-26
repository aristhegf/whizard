import {
  HOW_WELL_PACKS,
  fillName,
  fillYou,
  applyGameAction,
  chooseGame,
  configureGame,
  createRoomState,
  gameViewFor,
  joinRoom,
  startGame,
  tickGame,
  unrecordedResult,
  type HowWellState,
  type HowWellView,
  type RoomState,
} from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { HOW_WELL_FILES, HOW_WELL_QUESTIONS, drawContent, drawHowWell } from "./index";
import { normalize } from "./quality";

/** Three of the longest games (15 rounds) and then some, before a pack has to repeat. */
const MIN_PER_PACK = 50;

describe("how well do you know me questions", () => {
  it("has a file for every pack, holding at least fifty of that pack", () => {
    for (const { id } of HOW_WELL_PACKS) {
      const file = HOW_WELL_FILES[id] as { pack: string; id: string }[];
      expect(file.length, id).toBeGreaterThanOrEqual(MIN_PER_PACK);
      for (const q of file) {
        expect(q.pack, q.id).toBe(id);
        expect(q.id.startsWith(`how-well-${id}-`), q.id).toBe(true);
      }
    }
  });

  it("has unique ids, and no prompt twice in a pack", () => {
    expect(new Set(HOW_WELL_QUESTIONS.map((q) => q.id)).size).toBe(HOW_WELL_QUESTIONS.length);
    for (const { id } of HOW_WELL_PACKS) {
      const prompts = HOW_WELL_QUESTIONS.filter((q) => q.pack === id).map((q) =>
        normalize(q.prompt),
      );
      expect(new Set(prompts).size, id).toBe(prompts.length);
    }
  });

  it("names the subject in every prompt, with four short different choices", () => {
    for (const q of HOW_WELL_QUESTIONS) {
      expect(q.prompt, q.id).toContain("{name}");
      expect(q.prompt.trim(), q.id).toBe(q.prompt);
      expect(q.prompt.endsWith("?"), q.id).toBe(true);
      expect(q.choices, q.id).toHaveLength(4);
      expect(new Set(q.choices.map((c) => c.toLowerCase())).size, q.id).toBe(4);
      for (const c of q.choices) expect(c.trim(), q.id).toBe(c);
    }
  });
});

describe("how well questions in both voices", () => {
  // Answers about someone else, where "their" isn't the subject.
  const ABOUT_OTHERS = new Set([
    "how-well-couples-004",
    "how-well-couples-006",
    "how-well-couples-037",
    "how-well-family-036",
  ]);

  it("reads right for the subject, about themselves", () => {
    for (const q of HOW_WELL_QUESTIONS) {
      const mine = fillYou(q.prompt);
      expect(mine, q.id).not.toMatch(/\{name\}|\b(they|their|them|themselves|they're)\b/i);
      expect(mine, q.id).not.toMatch(/\b(you is|you does|you has|you was|What's you\b)/);
      expect(mine, q.id).toMatch(/\byour?\b/);
    }
  });

  it("reads right for everyone else, with the subject's name", () => {
    for (const q of HOW_WELL_QUESTIONS) {
      const theirs = fillName(q.prompt, "Tolu");
      expect(theirs, q.id).toContain("Tolu");
      // "You" in a prompt would mean the reader, and turn odd for the subject.
      expect(q.prompt, q.id).not.toMatch(/\b(you|your|you're)\b/i);
    }
  });

  it("has answers that read for both: no one is 'they' or 'you' in them", () => {
    for (const q of HOW_WELL_QUESTIONS) {
      for (const choice of q.choices) {
        expect(choice, q.id).not.toMatch(/\b(your|they'd|they're|themselves)\b/i);
        if (!ABOUT_OTHERS.has(q.id)) expect(choice, q.id).not.toMatch(/\b(they|their|them)\b/i);
      }
    }
  });
});

describe("drawHowWell", () => {
  it("draws the questions asked for from one pack, all different, the same for the same seed", () => {
    for (const { id } of HOW_WELL_PACKS) {
      const drawn = drawHowWell(id, 15, 42);
      expect(drawn).toHaveLength(15);
      expect(new Set(drawn.map((q) => q.id)).size).toBe(15);
      expect(drawn.every((q) => q.pack === id)).toBe(true);
      expect(drawHowWell(id, 15, 42)).toEqual(drawn);
    }
    expect(drawHowWell("couples", 10, 1)).not.toEqual(drawHowWell("couples", 10, 2));
  });

  it("avoids questions the room used lately and the players have seen", () => {
    const pack = HOW_WELL_QUESTIONS.filter((q) => q.pack === "family");
    const recent = pack.slice(0, -5).map((q) => q.id);
    const fresh = drawHowWell("family", 5, 3, { recent }).map((q) => q.id);
    expect(fresh.sort()).toEqual(
      pack
        .slice(-5)
        .map((q) => q.id)
        .sort(),
    );
    const seen = new Map(pack.slice(1).map((q) => [q.id, { players: 1, lastSeenAt: 1 }]));
    expect(drawHowWell("family", 1, 3, { seen })[0]?.id).toBe(pack[0]?.id);
  });

  it("is what drawContent returns for a how-well request", () => {
    expect(drawContent({ kind: "how-well-questions", pack: "best-friends", count: 10 }, 9)).toEqual(
      drawHowWell("best-friends", 10, 9),
    );
  });
});

describe("a how-well room, end to end", () => {
  function room(...nicknames: string[]) {
    let state: RoomState = createRoomState("ABCDEF", 0);
    const connected = new Set<string>();
    nicknames.forEach((nickname, i) => {
      const result = joinRoom(state, { nickname }, connected, 0, () => ({
        id: `p${i + 1}`,
        sessionToken: `t${i + 1}`,
      }));
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      connected.add(`p${i + 1}`);
    });
    return { state, connected };
  }

  const must = (result: ReturnType<typeof startGame>): RoomState => {
    if (!result.ok) throw new Error(result.error);
    return result.state;
  };

  it("needs two players, then runs to a recorded result on the real bank", () => {
    const solo = room("Ada");
    const chosen = must(chooseGame(solo.state, "p1", "how-well"));
    expect(startGame(chosen, "p1", solo.connected, 0, 1, drawContent)).toEqual({
      ok: false,
      error: "not_enough_players",
    });

    const { state: lobby, connected } = room("Ada", "Bo");
    let state = must(chooseGame(lobby, "p1", "how-well"));
    state = must(configureGame(state, "p1", { rounds: 5, answerSeconds: 15, pack: "couples" }));
    expect(configureGame(state, "p1", { rounds: 6, answerSeconds: 15, pack: "couples" })).toEqual({
      ok: false,
      error: "bad_settings",
    });
    state = must(startGame(state, "p1", connected, 0, 1234, drawContent));
    const game = () => state.session!.state as HowWellState;
    expect(game().questions.map((q) => q.id)).toEqual(
      drawHowWell("couples", 5, 1234).map((q) => q.id),
    );
    expect(state.recentContent?.slice(0, 5)).toEqual(game().questions.map((q) => q.id));

    while (!state.session!.finished) {
      const now = game().answerStartsAt;
      state = tickGame(state, now);
      const view = gameViewFor(state, "p1") as HowWellView;
      expect(view.stage.kind).toBe("answer");
      // The subject and the guesser both pick the second choice: a right guess every round.
      for (const id of ["p1", "p2"]) {
        const result = applyGameAction(
          state,
          id,
          { type: "answer", choice: 1, clientElapsedMs: 500 },
          now + 500,
        );
        if (!result.ok) throw new Error(result.message);
        state = result.state;
      }
      expect(game().phase).toBe("reveal");
      state = tickGame(state, game().revealEndsAt!);
    }
    const result = unrecordedResult(state)!;
    expect(result.gameId).toBe("how-well");
    expect(result.summary.category).toBe("couples");
    expect(result.summary.rounds).toBe(5);
    expect(result.summary.players).toHaveLength(2);
    expect(result.summary.players.every((p) => p.score > 0)).toBe(true);
  });
});
