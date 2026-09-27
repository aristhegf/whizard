import { describe, expect, it } from "vitest";
import { isRejection } from "../types";
import {
  AUTO_ADVANCE_MS,
  COUNTDOWN_MS,
  REVEAL_MS,
  quizGame,
  type QuizAction,
  type QuizState,
  type QuizView,
} from "./quiz";
import { DEFAULT_QUIZ_SETTINGS, type QuizQuestion, type QuizSettings } from "./settings";

const T0 = 1_000_000;
const LIMIT = 20_000;

const QUESTIONS: QuizQuestion[] = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  prompt: `Question ${n}?`,
  choices: [`Right ${n}`, `Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
  explanation: `Because ${n}.`,
  reference: `Book ${n}:1`,
}));

function setup(variant: QuizSettings["variant"], players = ["ada", "tolu"], seed = 42): QuizState {
  return quizGame.setup({
    settings: { ...DEFAULT_QUIZ_SETTINGS, variant, timeLimitSeconds: 20 },
    players: players.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: QUESTIONS,
    seed,
    now: T0,
  });
}

function act(state: QuizState, player: string, action: QuizAction, now: number): QuizState {
  const result = quizGame.onAction(quizGame.tick(state, now), player, action, now);
  if (isRejection(result)) throw new Error(result.rejected);
  return result;
}

function reject(state: QuizState, player: string, action: QuizAction, now: number): string {
  const result = quizGame.onAction(quizGame.tick(state, now), player, action, now);
  if (!isRejection(result)) throw new Error("expected a rejection");
  return result.rejected;
}

const right = (state: QuizState, index: number) => state.questions[index]!.correctChoice;
const wrong = (state: QuizState, index: number) => (right(state, index) + 1) % 4;

function answer(state: QuizState, player: string, index: number, correct: boolean, at: number) {
  const choice = correct ? right(state, index) : wrong(state, index);
  return act(state, player, { type: "answer", index, choice, clientElapsedMs: 0 }, at);
}

const view = (state: QuizState, player: string): QuizView => quizGame.viewFor(state, player);

describe("quiz setup", () => {
  it("shuffles choices but keeps every option", () => {
    const state = setup("classic");
    state.questions.forEach((q, i) => {
      expect([...q.choices].sort()).toEqual([...QUESTIONS[i]!.choices].sort());
      expect(q.choices[q.correctChoice]).toBe(`Right ${i + 1}`);
    });
  });

  it("gives every player the same order for the same seed", () => {
    expect(setup("classic", ["a"], 7).questions).toEqual(setup("classic", ["b"], 7).questions);
  });

  it("works for a single player", () => {
    const state = setup("classic", ["solo"]);
    const solo = answer(state, "solo", 0, true, T0 + COUNTDOWN_MS + 1000);
    expect(view(solo, "solo").stage.kind).toBe("answer");
  });
});

describe("Classic", () => {
  it("shows everyone the same question after a countdown, without the answer", () => {
    const state = setup("classic");
    for (const player of ["ada", "tolu"]) {
      const stage = view(state, player).stage;
      expect(stage).toMatchObject({ kind: "question", index: 0, startsAt: T0 + COUNTDOWN_MS });
      expect(JSON.stringify(stage)).not.toContain("correct");
    }
  });

  it("scores a fast correct answer and waits for the others", () => {
    const state = answer(setup("classic"), "ada", 0, true, T0 + COUNTDOWN_MS + 2000);
    const stage = view(state, "ada").stage;
    expect(stage).toMatchObject({ kind: "question", answeredCount: 1, activeCount: 2 });
    // Claimed 0 ms, server saw 2000 ms: credited 500 ms after the network allowance.
    expect(view(state, "ada").me?.score).toBe(988);
  });

  it("hides scores from the open round so nobody learns the answer early", () => {
    const state = answer(setup("classic"), "ada", 0, true, T0 + COUNTDOWN_MS + 2000);
    expect(view(state, "tolu").standings.every((s) => s.score === 0)).toBe(true);
  });

  it("reveals the answer once everyone has answered", () => {
    let state = setup("classic");
    const at = T0 + COUNTDOWN_MS + 2000;
    state = answer(state, "ada", 0, true, at);
    state = answer(state, "tolu", 0, false, at + 1000);
    expect(view(state, "tolu").stage).toMatchObject({
      kind: "answer",
      correct: false,
      points: 0,
      correctChoice: right(state, 0),
      explanation: "Because 1.",
      reference: "Book 1:1",
      nextAt: at + 1000 + REVEAL_MS,
    });
    expect(view(state, "tolu").standings[0]).toMatchObject({ nickname: "ADA", score: 988 });
  });

  it("times out players who don't answer", () => {
    let state = answer(setup("classic"), "ada", 0, true, T0 + COUNTDOWN_MS + 1000);
    state = quizGame.tick(state, T0 + COUNTDOWN_MS + LIMIT);
    expect(view(state, "tolu").stage).toMatchObject({
      kind: "answer",
      myChoice: null,
      correct: false,
    });
  });

  it("moves to the next question after the reveal, then finishes", () => {
    let state = setup("classic");
    let now = T0 + COUNTDOWN_MS;
    for (let i = 0; i < 3; i++) {
      state = answer(state, "ada", i, true, now + 1000);
      state = answer(state, "tolu", i, i === 0, now + 2000);
      now = now + 2000 + REVEAL_MS;
      state = quizGame.tick(state, now);
      now =
        quizGame.viewFor(state, "ada").stage.kind === "question"
          ? (view(state, "ada").stage as { startsAt: number }).startsAt
          : now;
    }
    expect(quizGame.isFinished(state)).toBe(true);
    const final = view(state, "tolu");
    expect(final.final).toBe(true);
    expect(final.stage.kind).toBe("done");
    expect(final.standings.map((s) => [s.nickname, s.rank, s.correctCount])).toEqual([
      ["ADA", 1, 3],
      ["TOLU", 2, 1],
    ]);
  });

  it("rejects early, repeated and out-of-turn answers", () => {
    const state = setup("classic");
    const early = { type: "answer", index: 0, choice: 0, clientElapsedMs: 0 } as const;
    expect(reject(state, "ada", early, T0)).toMatch(/hasn't started/);

    const answered = answer(state, "ada", 0, true, T0 + COUNTDOWN_MS + 100);
    expect(reject(answered, "ada", early, T0 + COUNTDOWN_MS + 200)).toMatch(/already answered/);
    const future = { type: "answer", index: 1, choice: 0, clientElapsedMs: 0 } as const;
    expect(reject(state, "ada", future, T0 + COUNTDOWN_MS + 100)).toMatch(/closed/);
    expect(reject(state, "ada", { type: "next" }, T0 + COUNTDOWN_MS)).toMatch(/by itself/);
    expect(reject(state, "stranger", early, T0 + COUNTDOWN_MS)).toMatch(/watching/);
  });

  it("stops waiting for a player who leaves", () => {
    let state = answer(setup("classic"), "ada", 0, true, T0 + COUNTDOWN_MS + 1000);
    state = quizGame.onPlayerLeft(state, "tolu", T0 + COUNTDOWN_MS + 1500);
    expect(view(state, "ada").stage.kind).toBe("answer");
  });

  it("wakes at the deadline, then at the end of the reveal", () => {
    let state = setup("classic");
    expect(quizGame.nextWakeAt(state)).toBe(T0 + COUNTDOWN_MS + LIMIT);
    state = quizGame.tick(state, T0 + COUNTDOWN_MS + LIMIT);
    expect(quizGame.nextWakeAt(state)).toBe(T0 + COUNTDOWN_MS + LIMIT + REVEAL_MS);
  });
});

describe("Speed Quiz", () => {
  const start = T0 + COUNTDOWN_MS;

  it("lets each player move at their own pace", () => {
    let state = answer(setup("speed"), "ada", 0, true, start + 1000);
    expect(view(state, "ada").stage).toMatchObject({ kind: "answer", correct: true });
    expect(view(state, "tolu").stage).toMatchObject({ kind: "question", index: 0 });

    state = act(state, "ada", { type: "next" }, start + 2000);
    expect(view(state, "ada").stage).toMatchObject({
      kind: "question",
      index: 1,
      startsAt: start + 2000,
    });
  });

  it("measures each question from when it appeared", () => {
    let state = answer(setup("speed"), "ada", 0, true, start + 1000);
    state = act(state, "ada", { type: "next" }, start + 5000);
    state = answer(state, "ada", 1, true, start + 5000);
    expect(view(state, "ada").me?.score).toBe(1000 + 1000);
  });

  it("keeps other players' scores hidden until you finish", () => {
    const state = answer(setup("speed"), "ada", 0, true, start + 1000);
    expect(view(state, "tolu").standings).toEqual([]);
    expect(view(state, "ada").standings).toEqual([]);
  });

  it("shows live results to whoever finishes first, and final results at the end", () => {
    let state = setup("speed");
    let now = start;
    for (let i = 0; i < 3; i++) {
      state = answer(state, "ada", i, true, now + 500);
      state = act(state, "ada", { type: "next" }, now + 1000);
      now += 1000;
    }
    const early = view(state, "ada");
    expect(early.stage.kind).toBe("done");
    expect(early.final).toBe(false);
    expect(early.standings.find((s) => s.nickname === "TOLU")).toMatchObject({
      finished: false,
      answeredCount: 0,
    });

    for (let i = 0; i < 3; i++) {
      state = answer(state, "tolu", i, false, now + 500);
      state = act(state, "tolu", { type: "next" }, now + 1000);
      now += 1000;
    }
    expect(view(state, "tolu").final).toBe(true);
  });

  it("times out a question and moves on by itself", () => {
    let state = quizGame.tick(setup("speed"), start + LIMIT);
    expect(view(state, "ada").stage).toMatchObject({ kind: "answer", myChoice: null });
    state = quizGame.tick(state, start + LIMIT + AUTO_ADVANCE_MS);
    expect(view(state, "ada").stage).toMatchObject({ kind: "question", index: 1 });
  });

  it("finishes even if a player stops responding", () => {
    const state = quizGame.tick(setup("speed"), start + 10 * 60_000);
    expect(quizGame.isFinished(state)).toBe(true);
    expect(quizGame.nextWakeAt(state)).toBeNull();
  });

  it("finishes when the only other player leaves", () => {
    let state = setup("speed");
    let now = start;
    for (let i = 0; i < 3; i++) {
      state = answer(state, "ada", i, true, now + 500);
      state = act(state, "ada", { type: "next" }, now + 1000);
      now += 1000;
    }
    state = quizGame.onPlayerLeft(state, "tolu", now);
    expect(quizGame.isFinished(state)).toBe(true);
  });
});
