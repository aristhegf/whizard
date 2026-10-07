import { describe, expect, it } from "vitest";
import {
  NETWORK_ALLOWANCE_MS,
  REACTION_COUNTDOWN_MS,
  REACTION_PAUSE_MS,
  REACTION_STREAK_BONUS,
  reactionChoiceCount,
  reactionGame,
  type ReactionState,
  type ReactionView,
} from "./reaction";
import {
  DEFAULT_REACTION_SETTINGS,
  reactionSettingsSchema,
  type ReactionSettings,
} from "./settings";

const T0 = 1_000_000;
const SETTINGS: ReactionSettings = { rounds: 5, tapSeconds: 3, level: "easy", insaneSize: 5 };

function setup(ids: string[] = ["ada"], settings = SETTINGS, seed = 7): ReactionState {
  return reactionGame.setup({
    settings,
    players: ids.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: undefined,
    seed,
    now: T0,
  }) as ReactionState;
}

function tick(state: ReactionState, now: number): ReactionState {
  return reactionGame.tick(state, now) as ReactionState;
}

/** A tap, as the room runs it: a tick first, then the action, throwing on a rejection. */
function act(
  state: ReactionState,
  playerId: string,
  clientMs: number,
  now: number,
  choice?: number,
  misses = 0,
): ReactionState {
  const result = reactionGame.onAction(
    tick(state, now),
    playerId,
    {
      type: "tap",
      choice: choice ?? state.rounds[state.round]!.correct,
      clientElapsedMs: clientMs,
      misses,
    },
    now,
  );
  if ("rejected" in result) throw new Error(result.rejected);
  return result as ReactionState;
}

const viewOf = (state: ReactionState, playerId: string) =>
  reactionGame.viewFor(state, playerId) as ReactionView;

/** Through the countdown, to the round waiting for its options. */
function toWait(state: ReactionState): ReactionState {
  const started = tick(state, state.roundStartsAt);
  expect(started.phase).toBe("wait");
  return started;
}

/** The wrong tile of the current round: any option that isn't the target. */
const wrongChoice = (state: ReactionState) =>
  state.rounds[state.round]!.options.findIndex((_, i) => i !== state.rounds[state.round]!.correct);

/** The whole game, one tap a round from each player. */
function playAll(
  state: ReactionState,
  times: Record<string, number>,
  misses: Record<string, number> = {},
): ReactionState {
  let s = state;
  while (!reactionGame.isFinished(s)) {
    if (s.phase === "countdown") {
      s = tick(s, s.roundStartsAt);
      continue;
    }
    if (s.phase === "wait") {
      for (const [id, ms] of Object.entries(times))
        s = act(s, id, ms, s.signalAt + ms + 60, undefined, misses[id] ?? 0);
      if (s.phase === "result") {
        s = tick(s, s.resultEndsAt!);
        continue;
      }
      s = tick(s, s.roundEndsAt);
      continue;
    }
    s = tick(s, s.resultEndsAt!);
  }
  return s;
}

describe("reaction", () => {
  it("needs no content and takes the round choices", () => {
    expect(reactionGame.contentNeeded(DEFAULT_REACTION_SETTINGS, 1)).toBeNull();
    expect(reactionSettingsSchema.safeParse({ rounds: 5, tapSeconds: 3 }).success).toBe(true);
    expect(reactionSettingsSchema.safeParse({ rounds: 7, tapSeconds: 3 }).success).toBe(false);
    expect(reactionSettingsSchema.safeParse({ rounds: 5, tapSeconds: 4 }).success).toBe(false);
    expect(
      reactionSettingsSchema.safeParse({ rounds: 5, tapSeconds: 3, level: "nope" }).success,
    ).toBe(false);
    expect(
      reactionSettingsSchema.safeParse({ rounds: 5, tapSeconds: 3, insaneSize: 9 }).success,
    ).toBe(false);
  });

  it("reads rooms saved before the levels existed as Easy on a 5×5", () => {
    expect(reactionSettingsSchema.parse({ rounds: 5, tapSeconds: 3 })).toEqual(SETTINGS);
  });

  it("starts everyone on the same countdown, with a seeded wait", () => {
    const state = setup(["ada", "tolu"]);
    expect(state.phase).toBe("countdown");
    expect(state.roundStartsAt).toBe(T0 + REACTION_COUNTDOWN_MS);
    expect(state.signalAt).toBe(state.roundStartsAt + state.delays[0]!);
    expect(state.delays[0]).toBeGreaterThanOrEqual(1500);
    expect(state.delays[0]).toBeLessThanOrEqual(4000);
    // The same seed waits the same way for every client.
    expect(setup(["kemi"], SETTINGS, 7).delays).toEqual(state.delays);

    const view = viewOf(state, "ada");
    expect(view.stage).toMatchObject({
      kind: "countdown",
      startsAt: T0 + REACTION_COUNTDOWN_MS,
      signalAt: state.signalAt,
      target: { id: state.rounds[0]!.target.id },
    });
    // The board rides along with the countdown, hidden until the signal on each client's clock.
    if (view.stage.kind !== "countdown") throw new Error("not a countdown");
    expect(view.stage.options).toEqual(state.rounds[0]!.options);
    expect(view.standings).toHaveLength(2);
    expect(view.standings.every((s) => s.avgMs === null)).toBe(true);
  });

  it("gives each level its board, with the target exactly once", () => {
    const counts: [ReactionSettings["level"], number][] = [
      ["easy", 1],
      ["medium", 2],
      ["hard", 4],
    ];
    for (const [level, count] of counts) {
      const state = setup(["ada"], { ...SETTINGS, level });
      expect(reactionChoiceCount({ ...SETTINGS, level })).toBe(count);
      for (const round of state.rounds) {
        expect(round.options).toHaveLength(count);
        // Every small board is all different things, with the target among them once.
        expect(new Set(round.options.map((o) => o.id)).size).toBe(count);
        expect(round.options[round.correct]!.id).toBe(round.target.id);
      }
    }
  });

  it("spreads Insane over the host's grid, the target standing alone", () => {
    for (const insaneSize of [5, 6, 7] as const) {
      const state = setup(["ada"], { ...SETTINGS, level: "insane", insaneSize });
      expect(reactionChoiceCount({ ...SETTINGS, level: "insane", insaneSize })).toBe(
        insaneSize * insaneSize,
      );
      for (const round of state.rounds) {
        expect(round.options).toHaveLength(insaneSize * insaneSize);
        // The target is the one of its kind; the rest repeat the category around it.
        expect(round.options.filter((o) => o.id === round.target.id)).toHaveLength(1);
        expect(round.options[round.correct]!.id).toBe(round.target.id);
      }
    }
  });

  it("deals the same boards from the same seed, and different ones from another", () => {
    expect(setup(["ada"], SETTINGS, 9).rounds).toEqual(setup(["ada"], SETTINGS, 9).rounds);
    expect(setup(["ada"], SETTINGS, 9).rounds).not.toEqual(setup(["ada"], SETTINGS, 10).rounds);
    // Categories turn round to round: a long game isn't one board of the same kind.
    const rounds = setup(["ada"], { ...SETTINGS, rounds: 15 }, 4).rounds;
    expect(new Set(rounds.map((r) => r.target.id)).size).toBeGreaterThan(4);
  });

  it("credits the client's own reaction within reach of the server's", () => {
    const state = toWait(setup());
    const at = state.signalAt + 360;
    const tapped = act(state, "ada", 300, at);
    const record = viewOf(tapped, "ada").myTap!;
    expect(record).toEqual({ ms: 300, misses: 0 });

    // A claim faster than the network can explain is floored to the server's allowance.
    const cheated = act(state, "ada", 5, at);
    expect(viewOf(cheated, "ada").myTap!.ms).toBe(360 - NETWORK_ALLOWANCE_MS);

    // And one slower than the server measured is capped at what the server saw.
    const slow = act(state, "ada", 9000, at);
    expect(viewOf(slow, "ada").myTap!.ms).toBe(360);
  });

  it("turns down a tap before the options are up", () => {
    const state = toWait(setup());
    const early = reactionGame.onAction(
      state,
      "ada",
      { type: "tap", choice: 0, clientElapsedMs: 0, misses: 0 },
      state.signalAt - 500,
    );
    expect(early).toEqual({ rejected: "Too soon — the options aren't up yet." });
    expect(viewOf(state, "ada").myTap).toBeNull();
  });

  it("allows for the clock's error right around the signal", () => {
    const state = toWait(setup());
    // Arrives 50ms "early": within tolerance, so it's a real tap (a very fast one).
    const tapped = act(state, "ada", 80, state.signalAt - 50);
    expect(viewOf(tapped, "ada").myTap).toEqual({ ms: 0, misses: 0 });
  });

  it("turns down a wrong tile without locking the player out", () => {
    const state = toWait(setup(["ada"], { ...SETTINGS, level: "medium" }));
    const wrong = wrongChoice(state);
    const refused = reactionGame.onAction(
      state,
      "ada",
      { type: "tap", choice: wrong, clientElapsedMs: 120, misses: 0 },
      state.signalAt + 150,
    );
    expect(refused).toEqual({ rejected: "Not that one — keep going." });
    // No record: the round is still theirs to win, with no delay on the next tap.
    expect(viewOf(state, "ada").myTap).toBeNull();
    expect(state.phase).toBe("wait");
    const right = act(state, "ada", 300, state.signalAt + 320);
    expect(viewOf(right, "ada").myTap!.ms).toBe(300);
    expect(right.phase).toBe("result");
  });

  it("ends the round as soon as everyone has found it, times fastest first", () => {
    let state = toWait(setup(["ada", "tolu"]));
    state = act(state, "ada", 220, state.signalAt + 280);
    expect(state.phase).toBe("wait");
    state = act(state, "tolu", 480, state.signalAt + 540);
    expect(state.phase).toBe("result");

    const stage = viewOf(state, "ada").stage;
    expect(stage).toMatchObject({ kind: "result" });
    if (stage.kind !== "result") throw new Error("no result");
    expect(stage.times.map((t) => t.playerId)).toEqual(["ada", "tolu"]);
    expect(stage.times[0]!.ms).toBe(220);
    expect(stage.endsAt).toBe(state.resultEndsAt);
  });

  it("marks anyone who never found it as missed when the window closes", () => {
    let state = toWait(setup(["ada", "tolu"]));
    state = act(state, "ada", 200, state.signalAt + 250);
    state = tick(state, state.roundEndsAt);
    expect(state.phase).toBe("result");
    const stage = viewOf(state, "ada").stage;
    if (stage.kind !== "result") throw new Error("no result");
    // Tolu never found it: the full window.
    expect(viewOf(state, "tolu").myTap).toEqual({ ms: null, misses: 0 });
    expect(stage.times.map((t) => t.ms)).toEqual([200, null]);
  });

  it("won't take a tap once the round is over", () => {
    const waiting = toWait(setup());
    const state = tick(waiting, waiting.roundEndsAt);
    expect(state.phase).toBe("result");
    const result = reactionGame.onAction(
      state,
      "ada",
      { type: "tap", choice: 0, clientElapsedMs: 100, misses: 0 },
      state.roundStartsAt + 10_000,
    );
    expect(result).toEqual({ rejected: "That round is over." });
  });

  it("won't take the same tap twice", () => {
    const waiting = toWait(setup(["ada", "tolu"]));
    const state = act(waiting, "ada", 200, waiting.signalAt + 250);
    expect(state.phase).toBe("wait");
    const again = reactionGame.onAction(
      state,
      "ada",
      { type: "tap", choice: 0, clientElapsedMs: 100, misses: 0 },
      state.signalAt + 400,
    );
    expect(again).toEqual({ rejected: "You've already tapped." });
  });

  it("plays its rounds and finishes with times, points and places", () => {
    const done = playAll(setup(["ada", "tolu"]), { ada: 250, tolu: 400 });
    expect(reactionGame.isFinished(done)).toBe(true);
    expect(viewOf(done, "ada").stage).toEqual({ kind: "done" });

    const standings = viewOf(done, "ada").standings;
    expect(standings.map((s) => s.playerId)).toEqual(["ada", "tolu"]);
    expect(standings[0]).toMatchObject({ rank: 1, played: 5 });
    expect(standings[0]!.totalMs).toBe(5 * 250);
    expect(standings[0]!.avgMs).toBe(250);
    expect(standings[0]!.bestMs).toBe(250);
    // The window off every round: 3000ms rounds, so 2750 and 2600 a round.
    expect(standings[0]!.points).toBe(5 * 2750);
    expect(standings[1]!.points).toBe(5 * 2600);

    const summary = reactionGame.summarize(done);
    expect(summary).toMatchObject({ rounds: 5, category: null, difficulty: null, mode: null });
    // Five first-try rounds each: three past the first two pay 1,000, on top of the points.
    expect(summary.players).toEqual([
      {
        playerId: "ada",
        placing: 1,
        score: 5 * 2750 + 3 * REACTION_STREAK_BONUS,
        correct: null,
        bestMs: 250,
      },
      {
        playerId: "tolu",
        placing: 2,
        score: 5 * 2600 + 3 * REACTION_STREAK_BONUS,
        correct: null,
        bestMs: 400,
      },
    ]);
  });

  it("shares the rank between players on the same times", () => {
    const done = playAll(setup(["ada", "tolu", "chidi"]), { ada: 250, tolu: 250, chidi: 400 });
    const standings = viewOf(done, "ada").standings;
    expect(standings.map((s) => s.playerId)).toEqual(["ada", "tolu", "chidi"]);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
    // The match keeps the shared places too.
    expect(reactionGame.summarize(done).players.map((p) => p.placing)).toEqual([1, 1, 3]);
  });

  it("counts a missed round as the window, in time and points", () => {
    const state = toWait(setup());
    // The window closes without a tap, then the rest of the game is played fast.
    const missed = tick(state, state.roundEndsAt);
    const done = playAll(missed, { ada: 250 });
    const me = viewOf(done, "ada").me!;
    expect(me).toMatchObject({ played: 5, bestMs: 250 });
    expect(me.totalMs).toBe(3000 + 4 * 250);
    expect(me.points).toBe(4 * 2750);
    expect(me.avgMs).toBe((3000 + 4 * 250) / 5);
  });

  it("pays a streak bonus for rounds found first try in a row", () => {
    // A clean game: every round found on the first tap, so the run never closes.
    const clean = playAll(setup(["ada"]), { ada: 250 });
    const me = viewOf(clean, "ada").me!;
    expect(me.streak).toBe(5);
    expect(me.bestStreak).toBe(5);
    expect(me.streakBonus).toBe(3 * REACTION_STREAK_BONUS);

    // Wrong tiles on the way: no run ever starts, so nothing is paid.
    const dirty = playAll(setup(["ada"]), { ada: 250 }, { ada: 2 });
    const theirs = viewOf(dirty, "ada").me!;
    expect(theirs.streak).toBe(0);
    expect(theirs.bestStreak).toBe(0);
    expect(theirs.streakBonus).toBe(0);
    expect(reactionGame.summarize(dirty).players[0]!.score).toBe(5 * 2750);
  });

  it("closes a streak on a wrong-tile round, keeping what it paid", () => {
    let state = setup(["ada"]);
    const round = (misses = 0) => {
      state = toWait(state);
      state = act(state, "ada", 250, state.signalAt + 300, undefined, misses);
      state = tick(state, state.resultEndsAt!);
    };
    round();
    round();
    round(); // Three in a row: the third pays 1,000 when the run closes.
    round(2); // A wrong tile twice on the way: the run ends here.
    round(); // One more first-try find: a new run of one.

    const me = viewOf(state, "ada").me!;
    expect(me.bestStreak).toBe(3);
    expect(me.streak).toBe(1);
    expect(me.streakBonus).toBe(REACTION_STREAK_BONUS);
  });

  it("brings the last round's ranks to this one's result, for the arrows", () => {
    let state = toWait(setup(["ada", "tolu"]));
    state = act(state, "ada", 200, state.signalAt + 250);
    state = act(state, "tolu", 400, state.signalAt + 450);
    expect(state.phase).toBe("result");
    // The first round's result has nothing behind it.
    const first = viewOf(state, "ada").stage;
    if (first.kind !== "result") throw new Error("no result");
    expect(first.previous).toEqual([]);

    state = tick(state, state.resultEndsAt!);
    state = toWait(state);
    // Tolu finds it faster this time: the lead changes hands.
    state = act(state, "tolu", 100, state.signalAt + 150);
    state = act(state, "ada", 500, state.signalAt + 550);
    const second = viewOf(state, "ada").stage;
    if (second.kind !== "result") throw new Error("no result");
    expect(second.previous).toEqual([
      { playerId: "ada", rank: 1 },
      { playerId: "tolu", rank: 2 },
    ]);
    // And the standings underneath show the swap: 250ms average beats 350ms.
    expect(viewOf(state, "ada").standings.map((s) => s.playerId)).toEqual(["tolu", "ada"]);
  });

  it("says the level the way the lobby does", () => {
    expect(viewOf(setup(["ada"]), "ada").levelName).toBe("Easy");
    expect(viewOf(setup(["ada"], { ...SETTINGS, level: "hard" }), "ada").levelName).toBe("Hard");
    expect(
      viewOf(setup(["ada"], { ...SETTINGS, level: "insane", insaneSize: 6 }), "ada").levelName,
    ).toBe("Insane 6×6");
  });

  it("waits for the pause between rounds, then counts down again", () => {
    let state = toWait(setup());
    state = act(state, "ada", 200, state.signalAt + 250);
    expect(state.phase).toBe("result");
    const resultEndsAt = state.resultEndsAt!;
    expect(resultEndsAt).toBe(state.signalAt + 250 + REACTION_PAUSE_MS);

    // Too early: still showing the times.
    expect(tick(state, resultEndsAt - 1).phase).toBe("result");
    const next = tick(state, resultEndsAt);
    expect(next.phase).toBe("countdown");
    expect(next.round).toBe(1);
    expect(next.roundStartsAt).toBe(resultEndsAt + REACTION_COUNTDOWN_MS);
    expect(viewOf(next, "ada").stage).toMatchObject({ kind: "countdown", round: 1 });
  });

  it("says where a late joiner stands, and brings them in next round", () => {
    let state = toWait(setup(["ada"]));
    state = reactionGame.onPlayerJoined(
      state,
      { id: "tolu", nickname: "TOLU" },
      state.signalAt + 900,
    );

    const queued = viewOf(state, "tolu");
    expect(queued.stage).toEqual({ kind: "queued" });
    const refused = reactionGame.onAction(
      state,
      "tolu",
      { type: "tap", choice: 0, clientElapsedMs: 100, misses: 0 },
      state.signalAt + 1000,
    );
    expect(refused).toEqual({ rejected: "You're in from the next round." });

    // Ada taps; Tolu isn't in this round, so it ends without waiting for them.
    state = act(state, "ada", 220, state.signalAt + 280);
    expect(state.phase).toBe("result");
    state = tick(state, state.resultEndsAt!);
    state = toWait(state);
    expect(viewOf(state, "tolu").stage).toMatchObject({ kind: "wait", round: 1 });
    state = act(state, "tolu", 300, state.signalAt + 350);
    expect(viewOf(state, "tolu").myTap).toEqual({ ms: 300, misses: 0 });
  });

  it("lets a late joiner straight into the countdown they arrive on", () => {
    const state = setup(["ada"]);
    const joined = reactionGame.onPlayerJoined(state, { id: "tolu", nickname: "TOLU" }, T0 + 500);
    const waiting = toWait(joined);
    expect(viewOf(waiting, "tolu").stage).toMatchObject({ kind: "wait", round: 0 });
    const tapped = act(waiting, "tolu", 300, waiting.signalAt + 350);
    expect(viewOf(tapped, "tolu").myTap).toEqual({ ms: 300, misses: 0 });
  });

  it("fills a miss for someone who comes back mid-round without tapping", () => {
    let state = toWait(setup(["ada", "tolu"]));
    const left = reactionGame.onPlayerLeft(state, "tolu", state.signalAt + 100);
    expect(left.phase).toBe("wait");
    const back = reactionGame.onPlayerJoined(
      left,
      { id: "tolu", nickname: "TOLU" },
      state.signalAt + 500,
    );
    expect(back.players.find((p) => p.id === "tolu")!.left).toBe(false);
    expect(viewOf(back, "tolu").myTap).toEqual({ ms: null, misses: 0 });
    // With their miss on the books, one tap still ends the round.
    state = act(back, "ada", 220, state.signalAt + 280);
    expect(state.phase).toBe("result");
  });

  it("ends the game when everyone leaves", () => {
    let state = toWait(setup(["ada", "tolu"]));
    state = reactionGame.onPlayerLeft(state, "ada", state.signalAt + 100);
    expect(state.finishedAt).toBeNull();
    state = reactionGame.onPlayerLeft(state, "tolu", state.signalAt + 110);
    expect(state.finishedAt).not.toBeNull();
    expect(reactionGame.isFinished(state)).toBe(true);
    expect(viewOf(state, "ada").stage).toEqual({ kind: "done" });
  });

  it("refuses taps from spectators, and keeps their view clean", () => {
    const state = toWait(setup(["ada"]));
    const result = reactionGame.onAction(
      state,
      "nobody",
      { type: "tap", choice: 0, clientElapsedMs: 100, misses: 0 },
      state.signalAt + 200,
    );
    expect(result).toEqual({ rejected: "You're watching this game." });
    expect(viewOf(state, "nobody").stage).toEqual({ kind: "watching" });
    expect(viewOf(state, "nobody").myTap).toBeNull();
  });

  it("wakes the room for the countdown, the window and the pause", () => {
    const state = setup();
    expect(reactionGame.nextWakeAt(state)).toBe(state.roundStartsAt);
    const waiting = toWait(state);
    expect(reactionGame.nextWakeAt(waiting)).toBe(waiting.roundEndsAt);
    const result = act(waiting, "ada", 200, waiting.signalAt + 250);
    expect(reactionGame.nextWakeAt(result)).toBe(result.resultEndsAt);
    const done = playAll(setup(), { ada: 250 });
    expect(reactionGame.nextWakeAt(done)).toBeNull();
  });
});
