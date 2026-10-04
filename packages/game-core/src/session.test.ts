import { describe, expect, it } from "vitest";
import { CLASSIC_IDLE_LIMIT_MS, COUNTDOWN_MS, type QuizView } from "./games/quiz/quiz";
import { DEFAULT_QUIZ_SETTINGS, type QuizQuestion } from "./games/quiz/settings";
import type { ContentRequest } from "./games/types";
import {
  configureRoom,
  createRoomState,
  joinRoom,
  DISCONNECTED_PLAYER_TTL_MS,
  leaveRoom,
  nextDeadline,
  settle,
  toSnapshot,
  type RoomState,
} from "./room";
import {
  applyGameAction,
  chooseGame,
  configureGame,
  gameViewFor,
  markRecorded,
  quitGame,
  rejoinGame,
  returnToLobby,
  startGame,
  tickGame,
  unrecordedResult,
  type ContentSource,
} from "./session";

const T0 = 1_000_000;

const bank: ContentSource = (request: ContentRequest) =>
  Array.from(
    { length: request.kind === "quiz-questions" ? request.levels.length : 0 },
    (_, i): QuizQuestion => ({
      id: `q${i}`,
      prompt: `Q${i}?`,
      choices: ["a", "b", "c", "d"],
    }),
  );

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

describe("chooseGame", () => {
  it("lets the host switch games in the lobby, with that game's defaults", () => {
    const { state } = room("Ada", "Tolu");
    expect(chooseGame(state, "p2", "spot-it")).toEqual({ ok: false, error: "not_host" });
    const next = ok(chooseGame(state, "p1", "word-rush"));
    expect(next.game).toEqual({
      id: "word-rush",
      settings: { mode: "speed", level: "auto", rounds: 10, timeLimitSeconds: 30 },
    });
  });

  it("starts Spot It without anything from the content bank", () => {
    const { state, connected } = room("Ada");
    const chosen = ok(chooseGame(state, "p1", "spot-it"));
    const none: ContentSource = () => {
      throw new Error("Spot It shouldn't draw content");
    };
    const started = ok(startGame(chosen, "p1", connected, T0, 1, none));
    expect(started.session?.gameId).toBe("spot-it");
    expect(chooseGame(started, "p1", "quiz")).toEqual({ ok: false, error: "game_in_progress" });
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

describe("quitting a game", () => {
  it("keeps the player in the room while the others play on", () => {
    const { state, connected } = room("Ada", "Tolu");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    const quit = ok(quitGame(started, "p2", T0 + 5000));
    const snapshot = toSnapshot(quit, connected);
    expect(snapshot.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(snapshot.phase).toBe("playing");
    expect(snapshot.sittingOut).toEqual(["p2"]);
    // Quitting twice is harmless; there's nothing to quit in the lobby.
    expect(ok(quitGame(quit, "p2", T0 + 6000))).toBe(quit);
    expect(quitGame(state, "p1", T0)).toEqual({ ok: false, error: "no_game" });
  });

  it("ends the game when nobody is left playing, and the next game starts afresh", () => {
    const { state, connected } = room("Ada");
    const started = ok(startGame(state, "p1", connected, T0, 1, bank));
    // No changing the game while it runs.
    expect(configureGame(started, "p1", DEFAULT_QUIZ_SETTINGS)).toMatchObject({
      error: "game_in_progress",
    });
    const quit = ok(quitGame(started, "p1", T0 + 5000));
    expect(toSnapshot(quit, connected)).toMatchObject({ phase: "finished", sittingOut: ["p1"] });

    // Once it's over, changing settings brings the room back to the lobby.
    const settings = { ...DEFAULT_QUIZ_SETTINGS, count: 5 };
    const lobby = ok(configureGame(quit, "p1", settings));
    expect(toSnapshot(lobby, connected)).toMatchObject({ phase: "lobby", sittingOut: [] });
    // Or the host starts the next game straight away, with everyone in it.
    const again = ok(startGame(quit, "p1", connected, T0 + 9000, 2, bank));
    expect(toSnapshot(again, connected)).toMatchObject({ phase: "playing", sittingOut: [] });
  });

  it("passes the host role on when the host leaves the room", () => {
    const { state, connected } = room("Ada", "Tolu", "Kemi");
    const left = leaveRoom(state, "p1", connected, T0 + 1000);
    expect(left.hostId).toBe("p2");
  });
});

describe("coming back to a running game", () => {
  /** The quiz view one player sees. */
  const viewOf = (state: RoomState, id: string) => gameViewFor(state, id) as QuizView;
  const joinAs = (state: RoomState, nickname: string, guestId: string, id: string) => {
    const result = joinRoom(state, { nickname, guestId }, new Set(), T0 + 20_000, () => ({
      id,
      sessionToken: `t-${id}`,
    }));
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  /** Ada and Tolu, each on their own browser, in a room that doesn't allow late joins. */
  function started(settings = DEFAULT_QUIZ_SETTINGS) {
    let state = createRoomState("ABCDEF", T0);
    const connected = new Set<string>();
    for (const [n, name] of ["Ada", "Tolu"].entries()) {
      const r = joinRoom(state, { nickname: name, guestId: `g${n + 1}` }, connected, T0, () => ({
        id: `p${n + 1}`,
        sessionToken: `t${n + 1}`,
      }));
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      connected.add(`p${n + 1}`);
    }
    state = ok(configureGame(state, "p1", settings));
    // Late joins are off for these tests: they're about coming back, not joining fresh.
    const closed = configureRoom(state, "p1", { lateJoin: false });
    if (!closed.ok) throw new Error(closed.error);
    return {
      state: ok(startGame(closed.state, "p1", connected, T0, 1, bank)),
      connected,
    };
  }
  /** Tolu answers the first question. */
  const answered = (state: RoomState) =>
    ok(
      applyGameAction(
        state,
        "p2",
        { type: "answer", index: 0, choice: 0, clientElapsedMs: 1000 },
        T0 + COUNTDOWN_MS + 1000,
      ),
    );

  it("lets someone who quit go back in, with their score", () => {
    const { state, connected } = started();
    const before = answered(state);
    const quit = ok(quitGame(before, "p2", T0 + 10_000));
    expect(toSnapshot(quit, connected).sittingOut).toEqual(["p2"]);

    const back = ok(rejoinGame(quit, "p2", T0 + 12_000));
    expect(toSnapshot(back, connected).sittingOut).toEqual([]);
    const tolu = viewOf(back, "p2").standings.find((s) => s.playerId === "p2")!;
    expect(tolu.left).toBe(false);
    expect(tolu.score).toBe(viewOf(before, "p2").standings.find((s) => s.playerId === "p2")!.score);
    // Only a game they were in, and only while it runs.
    expect(rejoinGame(quit, "p9", T0)).toMatchObject({ ok: false, error: "no_game" });
  });

  it("brings someone who left the room back as the same player, late joins or not", () => {
    const { state, connected } = started();
    const left = leaveRoom(answered(state), "p2", connected, T0 + 10_000);
    expect(left.players.map((p) => p.id)).toEqual(["p1"]);

    // The same browser, whatever name they type: back in as Tolu, where they were.
    const back = joinAs(left, "Someone", "g2", "fresh");
    expect(back.player).toMatchObject({ id: "p2", nickname: "Tolu" });
    const tolu = viewOf(back.state, "p2").standings.find((s) => s.playerId === "p2")!;
    expect(tolu).toMatchObject({ left: false, nickname: "Tolu" });
    expect(tolu.score).toBeGreaterThanOrEqual(0);
  });

  it("keeps a newcomer out of a game that doesn't take late joins", () => {
    const { state } = started();
    const newcomer = joinAs(state, "Kemi", "g3", "p3");
    expect(newcomer.player.id).toBe("p3");
    expect(viewOf(newcomer.state, "p3").stage.kind).toBe("watching");
  });

  it("restarts the question they were on, so time away doesn't count against them", () => {
    const { state } = started({ ...DEFAULT_QUIZ_SETTINGS, variant: "speed" });
    const quit = ok(quitGame(state, "p2", T0 + 1000));
    // A minute later: several questions' worth of time has gone by for the others.
    const later = T0 + 60_000;
    const back = tickGame(ok(rejoinGame(quit, "p2", later)), later + 100);
    const view = viewOf(back, "p2");
    expect(view.stage).toMatchObject({
      kind: "question",
      index: 0,
      startsAt: later + COUNTDOWN_MS,
    });
  });

  it("stops the game waiting for someone gone too long, and takes them back if they return", () => {
    const { state } = started();
    // Tolu's connection drops and doesn't come back in time: they're dropped from the room.
    const connected = new Set(["p1"]);
    const gone = settle(state, connected, T0 + DISCONNECTED_PLAYER_TTL_MS + 1);
    expect(gone.players.map((p) => p.id)).toEqual(["p1"]);
    expect(viewOf(gone, "p1").standings.find((s) => s.playerId === "p2")?.left).toBe(true);

    const back = joinAs(gone, "Tolu", "g2", "fresh");
    expect(back.player.id).toBe("p2");
    expect(viewOf(back.state, "p1").standings.find((s) => s.playerId === "p2")?.left).toBe(false);
  });
});
