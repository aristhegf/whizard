import { describe, expect, it } from "vitest";
import { seededRng } from "../../random";
import { isRejection } from "../types";
import {
  JIGSAW_COUNTDOWN_MS,
  JIGSAW_INSANE_TIME_LIMIT_MS,
  JIGSAW_TIME_LIMIT_MS,
  jigsawGame,
  placedCount,
  scrambled,
  type JigsawState,
} from "./jigsaw";
import { JIGSAW_PICTURES, JIGSAW_THEMES, jigsawContentId, pickJigsawPicture } from "./settings";

const T0 = 1_000_000;
const START = T0 + JIGSAW_COUNTDOWN_MS;
const picture = JIGSAW_PICTURES[0];

function game(nicknames = ["Ada", "Tolu"], side: 3 | 4 | 10 = 3): JigsawState {
  return jigsawGame.setup({
    settings: { picture: picture.id, side },
    players: nicknames.map((nickname, i) => ({ id: `p${i + 1}`, nickname })),
    content: [{ id: jigsawContentId(picture.id), picture }],
    seed: 42,
    now: T0,
  });
}

function act(state: JigsawState, playerId: string, a: number, b: number, now = START + 1000) {
  const next = jigsawGame.onAction(state, playerId, { type: "swap", a, b }, now);
  if (isRejection(next)) throw new Error(next.rejected);
  return next;
}

/** Puts every piece in its place for one player, a swap at a time. */
function solve(state: JigsawState, playerId: string, now = START + 1000): JigsawState {
  let s = state;
  for (;;) {
    const board = s.players.find((p) => p.id === playerId)!.board;
    const spot = board.findIndex((piece, i) => piece !== i);
    if (spot === -1) return s;
    s = act(s, playerId, spot, board.indexOf(spot), now);
  }
}

function place(state: JigsawState, playerId: string, piece: number, now = START + 1000) {
  const next = jigsawGame.onAction(state, playerId, { type: "place", piece }, now);
  if (isRejection(next)) throw new Error(next.rejected);
  return next;
}

describe("scrambled", () => {
  it("never starts a piece in its place, and is the same for the same seed", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const side of [3, 4, 5, 6]) {
        const board = scrambled(side, seededRng(seed));
        expect([...board].sort((a, b) => a - b)).toEqual(board.map((_, i) => i));
        expect(placedCount(board)).toBe(0);
      }
    }
    expect(scrambled(4, seededRng(7))).toEqual(scrambled(4, seededRng(7)));
  });
});

describe("jigsaw", () => {
  it("gives everyone the same puzzle and counts down before it starts", () => {
    const state = game();
    const [ada, tolu] = state.players;
    expect(ada!.board).toEqual(tolu!.board);
    const view = jigsawGame.viewFor(state, "p1");
    expect(view.startsAt).toBe(START);
    expect(view.deadline).toBe(START + JIGSAW_TIME_LIMIT_MS);
    expect(() => act(state, "p1", 0, 1, START - 2000)).toThrow(/hasn't started/);
  });

  it("swaps two pieces, and locks a piece once it's in place", () => {
    let state = game();
    const board = state.players[0]!.board;
    const piece0At = board.indexOf(0);
    state = act(state, "p1", 0, piece0At);
    const after = state.players[0]!;
    expect(after.board[0]).toBe(0);
    expect(after.moves).toBe(1);
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
    expect(view.board).toEqual(state.players[1]!.board);
    expect(view.standings.find((s) => s.playerId === "p1")!.placed).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.players[0]!.board));
  });

  it("ends when time runs out, ranking unfinished players by pieces placed", () => {
    let state = act(game(), "p2", 0, game().players[1]!.board.indexOf(0));
    expect(jigsawGame.nextWakeAt(state)).toBe(START + JIGSAW_TIME_LIMIT_MS);
    state = jigsawGame.tick(state, START + JIGSAW_TIME_LIMIT_MS);
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
      difficulty: "3x3",
      mode: "race",
      rounds: 9,
      players: [
        { playerId: "p1", placing: 1, score: 900, correct: 9 },
        { playerId: "p2", placing: 2, score: 900, correct: 9 },
      ],
    });
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

describe("insane", () => {
  it("starts every piece in the same shuffled tray for everyone, with 30 minutes", () => {
    const state = game(["Ada", "Tolu"], 10);
    expect(state.players[0]!.board).toEqual(Array.from({ length: 100 }, () => -1));
    expect([...state.tray!].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, i) => i),
    );
    expect(state.tray).not.toEqual(Array.from({ length: 100 }, (_, i) => i));
    const view = jigsawGame.viewFor(state, "p2");
    expect(view.tray).toEqual(state.tray);
    expect(view.me?.placed).toBe(0);
    expect(view.deadline).toBe(START + JIGSAW_INSANE_TIME_LIMIT_MS);
    expect(jigsawGame.nextWakeAt(state)).toBe(START + JIGSAW_INSANE_TIME_LIMIT_MS);
  });

  it("places a piece on its spot once, and takes no swaps", () => {
    let state = game(["Ada"], 10);
    state = place(state, "p1", 42);
    expect(state.players[0]!.board[42]).toBe(42);
    expect(jigsawGame.viewFor(state, "p1").me?.placed).toBe(1);
    expect(() => place(state, "p1", 42)).toThrow(/already in its place/);
    expect(() => place(state, "p1", 100)).toThrow(/no such piece/);
    expect(() => act(state, "p1", 0, 1)).toThrow(/Drag the pieces/);
    expect(() => place(game(["Ada"], 10), "p1", 0, START - 2000)).toThrow(/hasn't started/);
  });

  it("finishes when the last piece goes in", () => {
    let state = game(["Ada"], 10);
    for (let piece = 0; piece < 100; piece++) state = place(state, "p1", piece, START + 5000);
    expect(jigsawGame.isFinished(state)).toBe(true);
    expect(jigsawGame.viewFor(state, "p1").me?.timeMs).toBe(5000);
  });

  it("the swapping sizes take no placing and have no tray", () => {
    const state = game(["Ada"], 4);
    expect(state.tray).toBeNull();
    expect(jigsawGame.viewFor(state, "p1").tray).toBeNull();
    expect(() => place(state, "p1", 0)).toThrow(/Pieces swap/);
  });
});
