import { describe, expect, it } from "vitest";
import {
  MEMORY_ANSWER_ALLOWANCE_MS,
  MEMORY_ANSWER_MS,
  MEMORY_COUNTDOWN_MS,
  MEMORY_RESULT_MS,
  memoryGame,
  type MemoryState,
  type MemoryView,
} from "./memory";
import { DEFAULT_MEMORY_SETTINGS, memorySettingsSchema } from "./settings";

const T0 = 1_000_000;
const SETTINGS = { rounds: 5, revealSeconds: 5 } as const;

function setup(ids: string[] = ["ada"], settings = SETTINGS, seed = 7): MemoryState {
  return memoryGame.setup({
    settings,
    players: ids.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: undefined,
    seed,
    now: T0,
  }) as MemoryState;
}

function tick(state: MemoryState, now: number): MemoryState {
  return memoryGame.tick(state, now) as MemoryState;
}

/** An answer, as the room runs it: a tick first, then the action, throwing on a rejection. */
function act(
  state: MemoryState,
  playerId: string,
  choice: number,
  clientMs: number,
  now: number,
): MemoryState {
  const result = memoryGame.onAction(
    tick(state, now),
    playerId,
    { type: "answer", choice, clientElapsedMs: clientMs },
    now,
  );
  if ("rejected" in result) throw new Error(result.rejected);
  return result as MemoryState;
}

const viewOf = (state: MemoryState, playerId: string) =>
  memoryGame.viewFor(state, playerId) as MemoryView;

/** Through the countdown and the reveal, to the open question. */
function toQuestion(state: MemoryState): MemoryState {
  let s = tick(state, state.roundStartsAt);
  expect(s.phase).toBe("reveal");
  s = tick(s, s.questionStartsAt);
  expect(s.phase).toBe("question");
  return s;
}

/** The whole game, one answer a round from each player ("correct" and "wrong" are chosen for them). */
function playAll(state: MemoryState, answers: Record<string, "correct" | "wrong">): MemoryState {
  let s = state;
  while (!memoryGame.isFinished(s)) {
    if (s.phase === "countdown") {
      s = tick(s, s.roundStartsAt);
      continue;
    }
    if (s.phase === "reveal") {
      s = tick(s, s.questionStartsAt);
      continue;
    }
    if (s.phase === "question") {
      for (const [id, how] of Object.entries(answers)) {
        const right = s.rounds[s.round]!.correct;
        const choice = how === "correct" ? right : (right + 1) % 4;
        s = act(s, id, choice, s.questionStartsAt + 400, s.questionStartsAt + 460);
        if (s.phase !== "question") break;
      }
      if (s.phase === "question") s = tick(s, s.questionEndsAt);
      continue;
    }
    s = tick(s, s.resultEndsAt!);
  }
  return s;
}

describe("memory", () => {
  it("needs no content and takes the round choices", () => {
    expect(memoryGame.contentNeeded(DEFAULT_MEMORY_SETTINGS, 1)).toBeNull();
    expect(memorySettingsSchema.safeParse({ rounds: 5, revealSeconds: 3 }).success).toBe(true);
    expect(memorySettingsSchema.safeParse({ rounds: 7, revealSeconds: 3 }).success).toBe(false);
    expect(memorySettingsSchema.safeParse({ rounds: 5, revealSeconds: 4 }).success).toBe(false);
  });

  it("starts on a countdown, with every round's set and question from the seed", () => {
    const state = setup(["ada", "tolu"]);
    expect(state.phase).toBe("countdown");
    expect(state.roundStartsAt).toBe(T0 + MEMORY_COUNTDOWN_MS);
    expect(state.rounds).toHaveLength(5);
    // The same seed shows the same game to every client.
    expect(setup(["kemi"], SETTINGS, 7).rounds).toEqual(state.rounds);

    const types = state.rounds.map((r) => r.type);
    expect(types).toEqual(["gone", "position", "count", "gone", "position"]);
    for (const round of state.rounds) {
      expect(round.items).toHaveLength(6);
      expect(new Set(round.items.map((i) => i.id)).size).toBe(6);
      expect(round.choices).toHaveLength(4);
      expect(round.correct).toBeGreaterThanOrEqual(0);
      expect(round.correct).toBeLessThan(4);
    }

    const view = viewOf(state, "ada");
    // The countdown carries the whole reveal window, so clients can run it on their own clocks.
    expect(view.stage).toMatchObject({
      kind: "countdown",
      round: 0,
      startsAt: T0 + MEMORY_COUNTDOWN_MS,
      endsAt: T0 + MEMORY_COUNTDOWN_MS + SETTINGS.revealSeconds * 1000,
    });
    expect(view.standings).toHaveLength(2);
    expect(view.standings.every((s) => s.points === 0)).toBe(true);
  });

  it("asks which item was not shown, with the answer off screen", () => {
    const round = setup().rounds[0]!;
    expect(round.type).toBe("gone");
    expect(round.question).toBe("Which one was NOT shown?");
    // Three of the four choices were shown; the fourth (the right one) was not.
    const answers = round.choices.map((c) => round.items.find((i) => `${i.emoji} ${i.name}` === c));
    expect(answers.filter(Boolean)).toHaveLength(3);
    expect(answers[round.correct]).toBeUndefined();
  });

  it("asks about a position, answered with what stood there", () => {
    const round = setup().rounds[1]!;
    expect(round.type).toBe("position");
    const position = Number(round.question.match(/position (\d+)/)![1]) - 1;
    expect(round.choices[round.correct]).toBe(
      `${round.items[position]!.emoji} ${round.items[position]!.name}`,
    );
  });

  it("asks how many of a kind, answered with the real count", () => {
    const round = setup().rounds[2]!;
    expect(round.type).toBe("count");
    const kind = round.question.match(/How many (\w+)/)![1]!;
    const count = round.items.filter((i) => i.kind === kind).length;
    expect(count).toBeGreaterThan(0);
    expect(round.choices[round.correct]).toBe(String(count));
    expect(new Set(round.choices).size).toBe(4);
  });

  it("keeps the question's answer back until the result", () => {
    const state = setup();
    const revealing = tick(state, state.roundStartsAt);
    expect(revealing.phase).toBe("reveal");
    expect(viewOf(revealing, "ada").stage).toMatchObject({ kind: "reveal" });
    expect("correct" in viewOf(revealing, "ada").stage).toBe(false);

    const asking = tick(revealing, revealing.questionStartsAt);
    expect(asking.phase).toBe("question");
    expect(viewOf(asking, "ada").stage).toMatchObject({ kind: "question" });
    expect("correct" in viewOf(asking, "ada").stage).toBe(false);

    const done = tick(asking, asking.questionEndsAt);
    const result = viewOf(done, "ada").stage;
    expect(result).toMatchObject({ kind: "result", correct: expect.any(Number) });
  });

  it("times the reveal and the question from the room's clock", () => {
    const state = setup();
    expect(state.questionStartsAt).toBe(state.roundStartsAt + 5000);
    expect(state.questionEndsAt).toBe(state.questionStartsAt + MEMORY_ANSWER_MS);
    expect(memoryGame.nextWakeAt(state)).toBe(state.roundStartsAt);

    const revealing = tick(state, state.roundStartsAt);
    expect(revealing.phase).toBe("reveal");
    expect(memoryGame.nextWakeAt(revealing)).toBe(revealing.questionStartsAt);

    const asking = tick(revealing, revealing.questionStartsAt);
    expect(asking.phase).toBe("question");
    expect(memoryGame.nextWakeAt(asking)).toBe(asking.questionEndsAt);

    // Solo: one answer ends the round at once, then the pause, then the next countdown.
    const answered = act(asking, "ada", 0, 300, asking.questionStartsAt + 360);
    expect(answered.phase).toBe("result");
    expect(memoryGame.nextWakeAt(answered)).toBe(answered.resultEndsAt);
    const paused = tick(answered, answered.resultEndsAt!);
    expect(paused.phase).toBe("countdown");
    expect(paused.round).toBe(1);
    expect(paused.roundStartsAt).toBe(answered.resultEndsAt! + MEMORY_RESULT_MS);
  });

  it("scores a right answer more the faster it is, and nothing for a wrong one", () => {
    const state = toQuestion(setup());
    const fast = act(state, "ada", state.rounds[0]!.correct, 200, state.questionStartsAt + 260);
    const fastRecord = viewOf(fast, "ada").myAnswer!;
    expect(fastRecord.correct).toBe(true);
    expect(fastRecord.usedMs).toBe(200);
    expect(fastRecord.points).toBeGreaterThan(900);

    // Answering at the last moment still scores, at the floor.
    const slow = act(
      state,
      "ada",
      state.rounds[0]!.correct,
      MEMORY_ANSWER_MS - 1,
      state.questionStartsAt + MEMORY_ANSWER_MS - 1,
    );
    expect(viewOf(slow, "ada").myAnswer!.points).toBe(500);

    // The first choice may well be wrong; wrong scores nothing.
    const wrongChoice = (state.rounds[0]!.correct + 1) % 4;
    const wrong = act(state, "ada", wrongChoice, 100, state.questionStartsAt + 160);
    const record = viewOf(wrong, "ada").myAnswer!;
    expect(record.correct).toBe(false);
    expect(record.points).toBe(0);
  });

  it("trusts the client's own clock within reach of the server's", () => {
    const state = toQuestion(setup());
    // A claim faster than the network can explain is floored to the server's allowance.
    const at = state.questionStartsAt + 1600;
    const cheated = act(state, "ada", 0, 5, at);
    expect(viewOf(cheated, "ada").myAnswer!.usedMs).toBe(1600 - MEMORY_ANSWER_ALLOWANCE_MS);

    // And one slower than the server measured is capped at what the server saw.
    const slow = act(state, "ada", 0, 9000, state.questionStartsAt + 800);
    expect(viewOf(slow, "ada").myAnswer!.usedMs).toBe(800);
  });

  it("refuses a second answer and answers outside the question", () => {
    const state = toQuestion(setup(["ada", "tolu"]));
    const answered = act(state, "ada", 0, 300, state.questionStartsAt + 360);
    expect(answered.phase).toBe("question");
    const again = memoryGame.onAction(
      answered,
      "ada",
      { type: "answer", choice: 0, clientElapsedMs: 100 },
      state.questionStartsAt + 500,
    );
    expect(again).toEqual({ rejected: "You've already answered." });

    const closed = tick(state, state.questionEndsAt);
    expect(closed.phase).toBe("result");
    const tooLate = memoryGame.onAction(
      closed,
      "ada",
      { type: "answer", choice: 0, clientElapsedMs: 100 },
      state.questionEndsAt + 1,
    );
    expect(tooLate).toEqual({ rejected: "That question is over." });

    const bad = memoryGame.onAction(
      state,
      "ada",
      { type: "answer", choice: 9, clientElapsedMs: 100 },
      state.questionStartsAt + 100,
    );
    expect(bad).toEqual({ rejected: "That isn't one of the choices." });
  });

  it("ends the round as soon as everyone has answered", () => {
    const state = toQuestion(setup(["ada", "tolu"]));
    const first = act(state, "ada", 0, 300, state.questionStartsAt + 360);
    expect(first.phase).toBe("question");
    const second = act(first, "tolu", 1, 400, first.questionStartsAt + 460);
    expect(second.phase).toBe("result");
    const answers = viewOf(second, "ada").stage;
    expect(answers).toMatchObject({ kind: "result" });
    expect(answers.kind === "result" && answers.answers).toHaveLength(2);
  });

  it("ranks by points, and summarizes score and answers right", () => {
    const state = setup(["ada", "tolu"]);
    const correct = state.rounds[0]!.correct;
    const wrong = (correct + 1) % 4;
    let s = toQuestion(state);
    s = act(s, "ada", correct, 150, s.questionStartsAt + 210);
    s = act(s, "tolu", wrong, 150, s.questionStartsAt + 210);
    const standings = viewOf(s, "ada").standings;
    expect(standings[0]!.nickname).toBe("ADA");
    expect(standings[0]!.correct).toBe(1);
    expect(standings[0]!.points).toBeGreaterThan(standings[1]!.points);

    const done = playAll(setup(["ada", "tolu"]), { ada: "correct", tolu: "wrong" });
    const summary = memoryGame.summarize(done);
    expect(summary).toMatchObject({ rounds: 5, category: null, difficulty: null, mode: null });
    expect(summary.players).toEqual([
      {
        playerId: "ada",
        placing: 1,
        score: expect.any(Number),
        correct: expect.any(Number),
      },
      {
        playerId: "tolu",
        placing: 2,
        score: expect.any(Number),
        correct: expect.any(Number),
      },
    ]);
    const ada = summary.players[0]!;
    const tolu = summary.players[1]!;
    // Ada answered the right choice every round; Tolu's was always one out.
    expect(ada.correct).toBe(SETTINGS.rounds);
    expect(tolu.correct).toBe(0);
    expect(ada.score).toBeGreaterThan(tolu.score);
  });

  it("plays every round through to the results", () => {
    const s = playAll(setup(), { ada: "correct" });
    expect(memoryGame.isFinished(s)).toBe(true);
    const view = viewOf(s, "ada");
    expect(view.stage.kind).toBe("done");
    expect(view.final).toBe(true);
    expect(view.me!.played).toBe(5);
    expect(view.me!.correct).toBeGreaterThanOrEqual(0);
    expect(view.me!.points).toBeGreaterThan(0);
  });

  it("holds a late joiner for the next round, or brings them straight in", () => {
    const mid = toQuestion(setup(["ada"]));
    const joined = memoryGame.onPlayerJoined(
      mid,
      { id: "tolu", nickname: "TOLU" },
      mid.questionStartsAt + 100,
    ) as MemoryState;
    const view = viewOf(joined, "tolu");
    expect(view.stage.kind).toBe("queued");

    const counting = setup(["ada"]);
    const straightIn = memoryGame.onPlayerJoined(
      counting,
      { id: "tolu", nickname: "TOLU" },
      T0 + 500,
    ) as MemoryState;
    expect(viewOf(straightIn, "tolu").stage.kind).toBe("countdown");
  });

  it("fills a miss for someone who comes back mid-round without answering", () => {
    const mid = toQuestion(setup(["ada", "tolu"]));
    const left = memoryGame.onPlayerLeft(mid, "tolu", mid.questionStartsAt + 500) as MemoryState;
    expect(viewOf(left, "tolu").stage.kind).toBe("watching");
    const back = memoryGame.onPlayerJoined(
      left,
      { id: "tolu", nickname: "TOLU" },
      mid.questionStartsAt + 900,
    ) as MemoryState;
    const record = viewOf(back, "tolu").myAnswer!;
    expect(record).toEqual({ choice: null, correct: false, usedMs: null, points: 0 });
  });

  it("finishes when everyone has left", () => {
    let s = toQuestion(setup(["ada", "tolu"]));
    s = memoryGame.onPlayerLeft(s, "ada", s.questionStartsAt + 100) as MemoryState;
    expect(memoryGame.isFinished(s)).toBe(false);
    s = memoryGame.onPlayerLeft(s, "tolu", s.questionStartsAt + 200) as MemoryState;
    expect(memoryGame.isFinished(s)).toBe(true);
  });
});
