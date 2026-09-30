import { describe, expect, it } from "vitest";
import { seededRng } from "../../random";
import { isRejection } from "../types";
import {
  JIGSAW_CLASSIC_LIMIT_MS,
  JIGSAW_COUNTDOWN_MS,
  JIGSAW_CUT_MS,
  jigsawGame,
  jigsawLevelPlan,
  jigsawTimeLimit,
  placedCount,
  scrambled,
  type JigsawState,
} from "./jigsaw";
import {
  JIGSAW_PICTURES,
  JIGSAW_THEMES,
  jigsawContentId,
  jigsawGrid,
  jigsawSettingsSchema,
  pickJigsawPicture,
  type JigsawLevelChoice,
  type JigsawMode,
  type JigsawPicture,
} from "./settings";

const T0 = 1_000_000;
const START = T0 + JIGSAW_COUNTDOWN_MS;
const picture = JIGSAW_PICTURES[0];
const EASY_LIMIT = jigsawTimeLimit("easy", 16);

function game(
  nicknames = ["Ada", "Tolu"],
  {
    mode = "speed",
    level = "easy",
    pic = picture,
  }: {
    mode?: JigsawMode;
    level?: JigsawLevelChoice;
    pic?: JigsawPicture;
  } = {},
): JigsawState {
  return jigsawGame.setup({
    settings: { picture: "random", mode, level },
    players: nicknames.map((nickname, i) => ({ id: `p${i + 1}`, nickname })),
    content: [{ id: jigsawContentId(pic.id), picture: pic }],
    seed: 42,
    now: T0,
  });
}

const boardOf = (state: JigsawState, playerId: string) =>
  state.players.find((p) => p.id === playerId)!.board;

function act(state: JigsawState, playerId: string, a: number, b: number, now = START + 1000) {
  const next = jigsawGame.onAction(state, playerId, { type: "swap", a, b }, now);
  if (isRejection(next)) throw new Error(next.rejected);
  return next;
}

function place(state: JigsawState, playerId: string, piece: number, now = START + 1000) {
  const next = jigsawGame.onAction(state, playerId, { type: "place", piece }, now);
  if (isRejection(next)) throw new Error(next.rejected);
  return next;
}

/** Puts `count` more pieces in their place for one player (all of them by default). */
function solve(state: JigsawState, playerId: string, now = START + 1000, count = Infinity) {
  let s = state;
  for (let n = 0; n < count; n++) {
    const board = boardOf(s, playerId);
    const spot = board.findIndex((piece, i) => piece !== i);
    if (spot === -1) return s;
    s =
      board[spot] === -1
        ? place(s, playerId, spot, now)
        : act(s, playerId, spot, board.indexOf(spot), now);
    // A swap can place two at once; count what's placed, not moves.
    if (placedCount(boardOf(s, playerId)) >= placedCount(board) + (count - n)) return s;
  }
  return s;
}

describe("scrambled", () => {
  it("never starts a piece in its place, and is the same for the same seed", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const count of [16, 25, 36]) {
        const board = scrambled(count, seededRng(seed));
        expect([...board].sort((a, b) => a - b)).toEqual(board.map((_, i) => i));
        expect(placedCount(board)).toBe(0);
      }
    }
    expect(scrambled(16, seededRng(7))).toEqual(scrambled(16, seededRng(7)));
  });
});

describe("levels and settings", () => {
  it("cuts Easy to Hard as square boards of 16, 25 and 36, and Insane in the picture's shape", () => {
    expect(jigsawGrid("easy")).toEqual({ cols: 4, rows: 4 });
    expect(jigsawGrid("medium")).toEqual({ cols: 5, rows: 5 });
    expect(jigsawGrid("hard")).toEqual({ cols: 6, rows: 6 });
    expect(jigsawGrid("insane")).toEqual({ cols: 10, rows: 10 });
    for (const aspect of [0.5, 0.75, 4 / 3, 1.5, 2]) {
      const { cols, rows } = jigsawGrid("insane", aspect);
      expect(cols * rows).toBeGreaterThanOrEqual(90);
      expect(cols * rows).toBeLessThanOrEqual(110);
      // Near-square pieces.
      expect(aspect / (cols / rows)).toBeGreaterThan(0.8);
      expect(aspect / (cols / rows)).toBeLessThan(1.25);
    }
  });

  it("gives each level a fair countdown with minutes to spare", () => {
    expect(jigsawTimeLimit("easy", 16)).toBe(150_000);
    expect(jigsawTimeLimit("medium", 25)).toBe(210_000);
    expect(jigsawTimeLimit("hard", 36)).toBe(240_000);
    expect(jigsawTimeLimit("insane", 100)).toBe(900_000);
  });

  it("reads rooms saved with pieces per side, and keeps Auto to Elimination", () => {
    expect(jigsawSettingsSchema.parse({ picture: "random", side: 3 })).toEqual({
      picture: "random",
      mode: "classic",
      level: "easy",
    });
    expect(jigsawSettingsSchema.parse({ picture: "crew", side: 6 }).level).toBe("hard");
    expect(jigsawSettingsSchema.parse({ picture: "crew", side: 10 }).level).toBe("insane");
    expect(
      jigsawSettingsSchema.parse({ picture: "crew", mode: "speed", level: "auto" }).level,
    ).toBe("easy");
    expect(
      jigsawSettingsSchema.parse({ picture: "crew", mode: "elimination", level: "auto" }).level,
    ).toBe("auto");
    expect(
      jigsawSettingsSchema.safeParse({ picture: "crew", level: "easy", photoAspect: 3 }).success,
    ).toBe(false);
  });
});

describe("the race: Classic and Speed", () => {
  it("gives everyone the same puzzle and counts down before it starts", () => {
    const state = game();
    expect(boardOf(state, "p1")).toEqual(boardOf(state, "p2"));
    expect(boardOf(state, "p1")).toHaveLength(16);
    const view = jigsawGame.viewFor(state, "p1");
    expect(view.startsAt).toBe(START);
    expect(view.deadline).toBe(START + EASY_LIMIT);
    expect([view.cols, view.rows, view.level, view.mode]).toEqual([4, 4, "easy", "speed"]);
    expect(view.round).toBeNull();
    expect(() => act(state, "p1", 0, 1, START - 2000)).toThrow(/hasn't started/);
  });

  it("Classic shows no clock, and only stops a player after an hour", () => {
    const state = game(["Ada", "Tolu"], { mode: "classic" });
    expect(jigsawGame.viewFor(state, "p1").deadline).toBeNull();
    expect(jigsawGame.nextWakeAt(state)).toBe(START + JIGSAW_CLASSIC_LIMIT_MS);
  });

  it("swaps two pieces, and locks a piece once it's in place", () => {
    let state = game();
    const piece0At = boardOf(state, "p1").indexOf(0);
    state = act(state, "p1", 0, piece0At);
    expect(boardOf(state, "p1")[0]).toBe(0);
    expect(state.players[0]!.moves).toBe(1);
    expect(() => act(state, "p1", 0, 1)).toThrow(/already in its place/);
    expect(() => act(state, "p1", 2, 2)).toThrow(/can’t swap/);
    expect(() => act(state, "p1", 2, 99)).toThrow(/can’t swap/);
  });

  it("finishes a player who places every piece, and ranks the fastest first", () => {
    let state = solve(game(), "p2", START + 20_000);
    expect(state.players[1]!.finishedAt).toBe(START + 20_000);
    expect(jigsawGame.isFinished(state)).toBe(false);
    expect(() => act(state, "p2", 0, 1)).toThrow(/finished/);

    state = solve(state, "p1", START + 30_000);
    expect(jigsawGame.isFinished(state)).toBe(true);
    const view = jigsawGame.viewFor(state, "p1");
    expect(view.standings.map((s) => [s.nickname, s.rank, s.timeMs])).toEqual([
      ["Tolu", 1, 20_000],
      ["Ada", 2, 30_000],
    ]);
    expect(view.final).toBe(true);
  });

  it("shows other players' progress but never their boards", () => {
    const state = act(game(), "p1", 0, game().players[0]!.board.indexOf(0));
    const view = jigsawGame.viewFor(state, "p2");
    expect(view.board).toEqual(boardOf(state, "p2"));
    expect(view.standings.find((s) => s.playerId === "p1")!.placed).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(boardOf(state, "p1")));
  });

  it("Speed ends when the countdown runs out, ranking unfinished players by pieces placed", () => {
    let state = act(game(), "p2", 0, game().players[1]!.board.indexOf(0));
    expect(jigsawGame.nextWakeAt(state)).toBe(START + EASY_LIMIT);
    state = jigsawGame.tick(state, START + EASY_LIMIT);
    expect(jigsawGame.isFinished(state)).toBe(true);
    const standings = jigsawGame.viewFor(state, "p1").standings;
    expect(standings[0]!.nickname).toBe("Tolu");
    expect(standings.every((s) => s.outOfTime)).toBe(true);
    expect(() => act(state, "p1", 0, 1)).toThrow(/over/);
  });

  it("ends when the only other player leaves, and a late joiner gets the same puzzle", () => {
    let state = game();
    state = jigsawGame.onPlayerJoined(state, { id: "p3", nickname: "Kemi" }, T0 + 60_000);
    const kemi = state.players[2]!;
    expect(kemi.board).toEqual(state.players[0]!.board);
    expect(kemi.startsAt).toBe(T0 + 60_000 + JIGSAW_COUNTDOWN_MS);

    state = solve(state, "p1");
    state = jigsawGame.onPlayerLeft(state, "p2", START + 2000);
    state = jigsawGame.onPlayerLeft(state, "p3", START + 2000);
    expect(jigsawGame.isFinished(state)).toBe(true);
  });

  it("summarises the game for match history", () => {
    const state = solve(solve(game(), "p1", START + 5000), "p2", START + 9000);
    expect(jigsawGame.summarize(state)).toEqual({
      category: picture.id,
      difficulty: "easy",
      mode: "speed",
      rounds: 16,
      players: [
        { playerId: "p1", placing: 1, score: 1600, correct: 16 },
        { playerId: "p2", placing: 2, score: 1600, correct: 16 },
      ],
    });
  });

  it("carries on a game saved before modes and levels, as a race", () => {
    const fresh = game(["Ada"]);
    const legacy = {
      settings: { picture: "random", side: 4 },
      picture,
      side: 4,
      start: fresh.puzzles[0]!.start,
      players: fresh.players,
      finishedAt: null,
    } as unknown as JigsawState;
    const view = jigsawGame.viewFor(legacy, "p1");
    expect([view.cols, view.level, view.mode]).toEqual([4, "easy", "classic"]);
    const next = solve(legacy, "p1", START + 4000);
    expect(jigsawGame.isFinished(next)).toBe(true);
  });
});

describe("insane", () => {
  const insane = (names = ["Ada", "Tolu"], pic: JigsawPicture = picture) =>
    game(names, { level: "insane", pic });

  it("starts every piece in the same shuffled tray for everyone, with 15 minutes", () => {
    const state = insane();
    expect(boardOf(state, "p1")).toEqual(Array.from({ length: 100 }, () => -1));
    const tray = state.puzzles[0]!.tray!;
    expect([...tray].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(tray).not.toEqual(Array.from({ length: 100 }, (_, i) => i));
    const view = jigsawGame.viewFor(state, "p2");
    expect(view.tray).toEqual(tray);
    expect(view.me?.placed).toBe(0);
    expect(view.deadline).toBe(START + 900_000);
  });

  it("cuts a photo that kept its own shape into about a hundred pieces in that shape", () => {
    const photo = { id: "photo", name: "Your photo", src: "/p.jpg", aspect: 1.5 };
    const state = insane(["Ada"], photo);
    const view = jigsawGame.viewFor(state, "p1");
    expect([view.cols, view.rows]).toEqual([12, 8]);
    expect(view.tray).toHaveLength(96);
    // Up to Hard the same photo is a square board.
    expect(jigsawGame.viewFor(game(["Ada"], { pic: photo }), "p1").cols).toBe(4);
  });

  it("places a piece on its spot once, and takes no swaps", () => {
    let state = insane(["Ada"]);
    state = place(state, "p1", 42);
    expect(boardOf(state, "p1")[42]).toBe(42);
    expect(jigsawGame.viewFor(state, "p1").me?.placed).toBe(1);
    expect(() => place(state, "p1", 42)).toThrow(/already in its place/);
    expect(() => place(state, "p1", 100)).toThrow(/no such piece/);
    expect(() => act(state, "p1", 0, 1)).toThrow(/Drag the pieces/);
    expect(() => place(insane(["Ada"]), "p1", 0, START - 2000)).toThrow(/hasn't started/);
    expect(() => place(game(["Ada"]), "p1", 0)).toThrow(/Pieces swap/);
  });

  it("finishes when the last piece goes in", () => {
    let state = insane(["Ada"]);
    for (let piece = 0; piece < 100; piece++) state = place(state, "p1", piece, START + 5000);
    expect(jigsawGame.isFinished(state)).toBe(true);
    expect(jigsawGame.viewFor(state, "p1").me?.timeMs).toBe(5000);
  });
});

describe("elimination", () => {
  const five = ["Ada", "Bola", "Chidi", "Dayo", "Efe"];
  const elim = (level: JigsawLevelChoice = "easy", names = five) =>
    game(names, { mode: "elimination", level });

  it("needs three players, and plans knock-out rounds and a final, each a new picture", () => {
    expect(
      jigsawGame.playersNeeded!({ picture: "random", mode: "elimination", level: "easy" })?.min,
    ).toBe(3);
    const state = elim();
    // Five players: three knock-out rounds and the final.
    expect(state.puzzles).toHaveLength(4);
    expect(new Set(state.puzzles.map((p) => p.picture.id)).size).toBe(4);
    expect(state.puzzles[0]!.picture.id).toBe(picture.id);
    const view = jigsawGame.viewFor(state, "p1");
    expect(view.round).toEqual({ index: 0, total: 4, final: false });
    expect(view.deadline).toBe(START + EASY_LIMIT);
  });

  it("Auto climbs from Easy to Insane for the final", () => {
    expect(jigsawLevelPlan("auto", 4)).toEqual(["easy", "medium", "hard", "insane"]);
    expect(jigsawLevelPlan("auto", 2)).toEqual(["easy", "insane"]);
    expect(jigsawLevelPlan("medium", 3)).toEqual(["medium", "medium", "medium"]);
    expect(elim("auto").puzzles.map((p) => p.level)).toEqual(["easy", "medium", "hard", "insane"]);
  });

  it("keeps whoever finishes, knocks out the fewest pieces when time runs out, then moves on", () => {
    let state = elim();
    state = solve(state, "p1", START + 10_000);
    state = solve(state, "p2", START + 12_000, 6);
    state = solve(state, "p3", START + 12_000, 4);
    state = solve(state, "p4", START + 13_000, 4);
    state = solve(state, "p5", START + 14_000, 1);
    expect(jigsawGame.nextWakeAt(state)).toBe(START + EASY_LIMIT);
    state = jigsawGame.tick(state, START + EASY_LIMIT);

    // Five players, three knock-out rounds: one goes out each round, the fewest pieces.
    const view = jigsawGame.viewFor(state, "p5");
    expect(view.cut?.out.map((o) => o.nickname)).toEqual(["Efe"]);
    expect(view.me?.out).toBe(true);
    expect(view.board).toBeNull();
    expect(() => act(state, "p1", 0, 1, START + EASY_LIMIT + 10)).toThrow(/next round/);

    // After the cut shows, the next round starts on its own, with a new puzzle.
    const nextAt = START + EASY_LIMIT + JIGSAW_CUT_MS;
    expect(jigsawGame.nextWakeAt(state)).toBe(nextAt);
    state = jigsawGame.tick(state, nextAt);
    const next = jigsawGame.viewFor(state, "p1");
    expect(next.round?.index).toBe(1);
    expect(next.startsAt).toBe(nextAt + JIGSAW_COUNTDOWN_MS);
    expect(next.me?.placed).toBe(0);
    expect(next.picture.id).not.toBe(picture.id);
    expect(jigsawGame.viewFor(state, "p5").board).toBeNull();
    expect(jigsawGame.viewFor(state, "p4").board).not.toBeNull();
  });

  it("ends a round early once enough have finished that the rest are out anyway", () => {
    let state = elim();
    // Four of five stay in: once four have finished, the fifth is out.
    for (const [i, id] of ["p1", "p2", "p3"].entries()) {
      state = solve(state, id, START + 5000 + i * 1000);
    }
    expect(state.phase).toBe("play");
    state = solve(state, "p4", START + 9000);
    expect(state.phase).toBe("cut");
    expect(state.lastCut?.out).toEqual(["p5"]);
  });

  it("plays the final between two, and the first to finish wins", () => {
    let state = elim("easy", ["Ada", "Bola", "Chidi"]);
    expect(state.puzzles).toHaveLength(2);
    state = solve(state, "p1", START + 5000);
    state = solve(state, "p2", START + 6000);
    expect(state.lastCut?.out).toEqual(["p3"]);
    state = jigsawGame.tick(state, START + 6000 + JIGSAW_CUT_MS);
    expect(jigsawGame.viewFor(state, "p1").round?.final).toBe(true);
    const finalStart = START + 6000 + JIGSAW_CUT_MS + JIGSAW_COUNTDOWN_MS;
    state = solve(state, "p2", finalStart + 3000);
    expect(jigsawGame.isFinished(state)).toBe(true);
    const standings = jigsawGame.viewFor(state, "p1").standings;
    expect(standings.map((s) => s.nickname)).toEqual(["Bola", "Ada", "Chidi"]);
    expect(state.winnerId).toBe("p2");
  });

  it("goes straight to the final when leavers leave only two", () => {
    let state = elim();
    state = jigsawGame.onPlayerLeft(state, "p4", START + 1000);
    state = jigsawGame.onPlayerLeft(state, "p5", START + 1000);
    state = jigsawGame.onPlayerLeft(state, "p3", START + 1000);
    state = jigsawGame.tick(state, START + EASY_LIMIT);
    expect(state.phase).toBe("play");
    expect(jigsawGame.viewFor(state, "p1").round?.final).toBe(true);
  });

  it("a late joiner watches, and someone back after a cut they missed watches too", () => {
    let state = elim();
    state = jigsawGame.onPlayerJoined(state, { id: "p9", nickname: "Kemi" }, START + 1000);
    expect(jigsawGame.viewFor(state, "p9").board).toBeNull();
    state = jigsawGame.onPlayerLeft(state, "p5", START + 1000);
    // Back in the same round: carries on.
    const back = jigsawGame.onPlayerJoined(state, { id: "p5", nickname: "Efe" }, START + 2000);
    expect(jigsawGame.viewFor(back, "p5").board).not.toBeNull();
    // Back after a cut: watches.
    state = jigsawGame.tick(state, START + EASY_LIMIT);
    state = jigsawGame.onPlayerJoined(state, { id: "p5", nickname: "Efe" }, START + EASY_LIMIT + 1);
    state = jigsawGame.tick(state, START + EASY_LIMIT + JIGSAW_CUT_MS);
    expect(jigsawGame.viewFor(state, "p5").board).toBeNull();
  });
});

describe("pickJigsawPicture", () => {
  it("uses the picture asked for", () => {
    expect(pickJigsawPicture({ kind: "jigsaw-picture", picture: "crew" }, 1).id).toBe("crew");
  });

  it("picks one the room hasn't used lately for random", () => {
    const all = JIGSAW_PICTURES.map((p) => p.id);
    const unused = all[3]!;
    const recent = all.filter((id) => id !== unused).map(jigsawContentId);
    for (let seed = 0; seed < 20; seed++) {
      expect(
        pickJigsawPicture({ kind: "jigsaw-picture", picture: "random" }, seed, recent).id,
      ).toBe(unused);
    }
  });
});

describe("the picture library", () => {
  it("has five or more pictures in every theme, each with its own ID and file", () => {
    for (const theme of JIGSAW_THEMES) {
      expect(JIGSAW_PICTURES.filter((p) => p.theme === theme.id).length).toBeGreaterThanOrEqual(5);
    }
    const ids = JIGSAW_PICTURES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of JIGSAW_PICTURES) {
      expect(JIGSAW_THEMES.map((t) => t.id)).toContain(p.theme);
      expect(p.src).toBe(`/art/jigsaw/${p.id}.webp`);
    }
  });

  it("surprises a fresh room with pictures from every theme", () => {
    const themeOf = (id: string) => JIGSAW_PICTURES.find((p) => p.id === id)?.theme;
    const themes = new Set(
      Array.from({ length: 200 }, (_, seed) =>
        themeOf(pickJigsawPicture({ kind: "jigsaw-picture", picture: "random" }, seed, []).id),
      ),
    );
    expect([...themes].sort()).toEqual(JIGSAW_THEMES.map((t) => t.id).sort());
  });

  it("keeps surprising a room with pictures it hasn't had until it's seen them all", () => {
    const recent: string[] = [];
    for (let game = 0; game < JIGSAW_PICTURES.length; game++) {
      const picked = pickJigsawPicture({ kind: "jigsaw-picture", picture: "random" }, game, recent);
      expect(recent).not.toContain(jigsawContentId(picked.id));
      recent.unshift(jigsawContentId(picked.id));
    }
  });
});
