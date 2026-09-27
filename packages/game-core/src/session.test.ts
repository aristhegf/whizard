import { describe, expect, it } from "vitest";
import { COUNTDOWN_MS, type QuizView } from "./games/quiz/quiz";
import { DEFAULT_QUIZ_SETTINGS, type QuizQuestion } from "./games/quiz/settings";
import type { ContentRequest } from "./games/types";
import {
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
  returnToLobby,
  startGame,
  tickGame,
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
    expect(nextDeadline(started, connected)).toBe(T0 + COUNTDOWN_MS + 20_000);
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
