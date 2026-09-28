import { describe, expect, it } from "vitest";
import { CLASSIC_IDLE_LIMIT_MS, COUNTDOWN_MS, type QuizView } from "./games/quiz/quiz";
import { DEFAULT_QUIZ_SETTINGS, type QuizQuestion } from "./games/quiz/settings";
import type { ContentRequest } from "./games/types";
import {
  configureRoom,
  createRoomState,
  joinRoom,
  leaveRoom,
  nextDeadline,
  toSnapshot,
  type RoomState,
} from "./room";
import {
  applyGameAction,
  configureGame,
  gameViewFor,
  markRecorded,
  returnToLobby,
  startGame,
  tickGame,
  unrecordedResult,
  type ContentSource,
} from "./session";

const T0 = 1_000_000;

const bank: ContentSource = (request: ContentRequest) =>
  Array.from({ length: request.count }, (_, i): QuizQuestion => ({
    id: `q${i}`,
    prompt: `Q${i}?`,
    choices: ["a", "b", "c", "d"],
  }));

function room(...nicknames: string[]): { state: RoomState; connected: Set<string> } {
  let state = createRoomState("ABCDEF", T0);
  const connected = new Set<string>();
  nicknames.forEach((nickname, i) => {
    const result = joinRoom(state, { nickname }, connected, T0, () => ({
      id: `p${i + 1}`,
      sessionToken: `t${i + 1}`,
    }));
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    connected.add(`p${i + 1}`);
  });
  return { state, connected };
}

function ok(result: ReturnType<typeof startGame>): RoomState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("configureGame", () => {
  it("lets the host change settings in the lobby", () => {
    const { state } = room("Ada", "Tolu");
    const settings = { ...DEFAULT_QUIZ_SETTINGS, count: 5, timeLimitSeconds: 10 };
    const next = ok(configureGame(state, "p1", settings));
    expect(toSnapshot(next, new Set()).game.settings).toEqual(settings);
  });

  it("only lets the host change settings", () => {
    const { state } = room("Ada", "Tolu");
    expect(configureGame(state, "p2", DEFAULT_QUIZ_SETTINGS)).toEqual({
      ok: false,
      error: "not_host",
    });
  });

  it("rejects settings the game doesn't support", () => {
    const { state } = room("Ada");
    const bad = { ...DEFAULT_QUIZ_SETTINGS, count: 7 };
    expect(configureGame(state, "p1", bad)).toEqual({ ok: false, error: "bad_settings" });
  });
});

describe("startGame", () => {
  it("starts a solo game", () => {
    const { state, connected } = room("Ada");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    expect(toSnapshot(started, connected).phase).toBe("playing");
    const view = gameViewFor(started, "p1") as QuizView;
    expect(view.stage).toMatchObject({ kind: "question", index: 0 });
    expect(view.total).toBe(DEFAULT_QUIZ_SETTINGS.count);
  });

  it("includes only players who are connected", () => {
    const { state, connected } = room("Ada", "Tolu");
    connected.delete("p2");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    expect((gameViewFor(started, "p2") as QuizView).stage.kind).toBe("watching");
  });

  it("needs the host and at least one connected player", () => {
    const { state, connected } = room("Ada", "Tolu");
    expect(startGame(state, "p2", connected, T0, 1, bank)).toEqual({
      ok: false,
      error: "not_host",
    });
    expect(startGame(state, "p1", new Set(), T0, 1, bank)).toEqual({
      ok: false,
      error: "not_enough_players",
    });
  });

  it("refuses to start without questions", () => {
    const { state, connected } = room("Ada");
    expect(startGame(state, "p1", connected, T0, 1, () => [])).toEqual({
      ok: false,
      error: "no_content",
    });
  });

  it("can't start twice at once, but can play again after finishing", () => {
    const { state, connected } = room("Ada");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    expect(startGame(started, "p1", connected, T0, 2, bank)).toMatchObject({
      error: "game_in_progress",
    });
    let finished = started;
    for (let wake = nextDeadline(finished, connected); wake !== null;) {
      finished = tickGame(finished, wake);
      wake =
        toSnapshot(finished, connected).phase === "playing"
          ? nextDeadline(finished, connected)
          : null;
    }
    expect(toSnapshot(finished, connected).phase).toBe("finished");
    expect(startGame(finished, "p1", connected, T0, 2, bank).ok).toBe(true);
  });
});

describe("playing", () => {
  it("applies valid moves and rejects malformed ones", () => {
    const { state, connected } = room("Ada");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    const move = { type: "answer", index: 0, choice: 1, clientElapsedMs: 500 };
    const played = ok(applyGameAction(started, "p1", move, T0 + COUNTDOWN_MS + 600));
    expect((gameViewFor(played, "p1") as QuizView).stage.kind).toBe("answer");

    expect(applyGameAction(started, "p1", { type: "cheat" }, T0)).toEqual({
      ok: false,
      error: "bad_action",
    });
    expect(applyGameAction(played, "p1", move, T0 + COUNTDOWN_MS + 700)).toMatchObject({
      ok: false,
      error: "bad_action",
      message: expect.stringMatching(/closed/),
    });
  });

  it("rejects moves when no game is running", () => {
    const { state } = room("Ada");
    expect(applyGameAction(state, "p1", { type: "next" }, T0)).toEqual({
      ok: false,
      error: "no_game",
    });
  });

  it("schedules the room's alarm for the game's next deadline", () => {
    const { state, connected } = room("Ada");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    expect(nextDeadline(started, connected)).toBe(T0 + COUNTDOWN_MS + CLASSIC_IDLE_LIMIT_MS);
  });

  it("stops waiting for players who leave mid-game", () => {
    const { state, connected } = room("Ada", "Tolu");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    const move = { type: "answer", index: 0, choice: 0, clientElapsedMs: 500 };
    const answered = ok(applyGameAction(started, "p1", move, T0 + COUNTDOWN_MS + 600));
    const left = leaveRoom(answered, "p2", connected, T0 + COUNTDOWN_MS + 700);
    expect((gameViewFor(left, "p1") as QuizView).stage.kind).toBe("answer");
  });

  it("lets the host return everyone to the lobby", () => {
    const { state, connected } = room("Ada", "Tolu");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    expect(returnToLobby(started, "p2")).toEqual({ ok: false, error: "not_host" });
    const lobby = ok(returnToLobby(started, "p1"));
    expect(toSnapshot(lobby, connected).phase).toBe("lobby");
  });
});

describe("match results", () => {
  function runOut(state: RoomState, connected: Set<string>): RoomState {
    let current = state;
    for (let wake = nextDeadline(current, connected); wake !== null;) {
      current = tickGame(current, wake);
      wake =
        toSnapshot(current, connected).phase === "playing"
          ? nextDeadline(current, connected)
          : null;
    }
    return current;
  }

  it("summarizes a finished game once, with who played", () => {
    const { state, connected } = room("Ada", "Tolu");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    expect(unrecordedResult(started)).toBeNull();

    const finished = runOut(started, connected);
    const result = unrecordedResult(finished);
    expect(result).toMatchObject({
      gameId: "quiz",
      startedAt: T0,
      summary: {
        category: DEFAULT_QUIZ_SETTINGS.category,
        difficulty: DEFAULT_QUIZ_SETTINGS.difficulty,
        mode: DEFAULT_QUIZ_SETTINGS.variant,
        rounds: DEFAULT_QUIZ_SETTINGS.count,
        players: [
          { playerId: "p1", placing: 1, score: 0, correct: 0 },
          { playerId: "p2", placing: 2, score: 0, correct: 0 },
        ],
      },
      roster: [
        { playerId: "p1", nickname: "Ada", account: null, guestId: null },
        { playerId: "p2", nickname: "Tolu", account: null, guestId: null },
      ],
    });
    expect(unrecordedResult(markRecorded(finished))).toBeNull();
  });

  it("says how each question went", () => {
    const { state, connected } = room("Ada", "Tolu");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    const move = { type: "answer", index: 0, choice: 0, clientElapsedMs: 500 };
    const answered = ok(applyGameAction(started, "p1", move, T0 + COUNTDOWN_MS + 600));
    const items = unrecordedResult(runOut(answered, connected))?.summary.items ?? [];
    expect(items).toHaveLength(DEFAULT_QUIZ_SETTINGS.count);
    // Ada answered the first question; everything else ran out of time.
    const first = items[0]!;
    expect(first.answered).toBe(1);
    expect(first.timedOut).toBe(1);
    expect(first.correct + Object.values(first.wrongPicks).reduce((a, b) => a + b, 0)).toBe(1);
    expect(items.slice(1).every((i) => i.answered === 0 && i.timedOut === 2)).toBe(true);
  });

  it("leaves out players who quit before the end", () => {
    const { state, connected } = room("Ada", "Tolu");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    const left = leaveRoom(started, "p2", connected, T0 + 10);
    connected.delete("p2");
    const result = unrecordedResult(runOut(left, connected));
    expect(result?.summary.players.map((p) => p.playerId)).toEqual(["p1"]);
    expect(result?.roster).toHaveLength(2);
  });
});

describe("late joiners", () => {
  function started(lateJoin: boolean) {
    const { state, connected } = room("Ada");
    const withSettings = configureRoom(state, "p1", { lateJoin });
    if (!withSettings.ok) throw new Error(withSettings.error);
    return { state: ok(startGame(withSettings.state, "p1", connected, T0, 1, bank)), connected };
  }

  it("join the running game when the host allows it", () => {
    const { state, connected } = started(true);
    const result = joinRoom(state, { nickname: "Tolu" }, connected, T0 + 10_000, () => ({
      id: "p2",
      sessionToken: "t2",
    }));
    if (!result.ok) throw new Error(result.error);
    const view = gameViewFor(result.state, "p2") as QuizView;
    expect(view.stage).toMatchObject({ kind: "question", index: 0 });
    expect(unrecordedResult(result.state)).toBeNull();
  });

  it("watch until the next game otherwise", () => {
    const { state, connected } = started(false);
    const result = joinRoom(state, { nickname: "Tolu" }, connected, T0 + 10_000, () => ({
      id: "p2",
      sessionToken: "t2",
    }));
    if (!result.ok) throw new Error(result.error);
    expect((gameViewFor(result.state, "p2") as QuizView).stage.kind).toBe("watching");
  });
});
