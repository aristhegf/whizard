import { describe, expect, it } from "vitest";
import { isRejection } from "../types";
import {
  AUTO_ADVANCE_MS,
  COUNTDOWN_MS,
  quizGame,
  type QuizAction,
  type QuizState,
  type QuizView,
} from "./quiz";
import { DEFAULT_QUIZ_SETTINGS, type QuizQuestion } from "./settings";

const T0 = 1_000_000;
const LIMIT = 20_000;
const START = T0 + COUNTDOWN_MS;

const QUESTIONS: QuizQuestion[] = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  prompt: `Question ${n}?`,
  choices: [`Right ${n}`, `Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
  explanation: `Because ${n}.`,
  reference: `Book ${n}:1`,
}));

function setup(players = ["ada", "tolu"], seed = 42): QuizState {
  return quizGame.setup({
    settings: { ...DEFAULT_QUIZ_SETTINGS, timeLimitSeconds: 20 },
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

/** Answers every question, moving on right after each answer. */
function playThrough(state: QuizState, player: string, correct: boolean[], from: number) {
  let s = state;
  let now = from;
  correct.forEach((c, i) => {
    s = answer(s, player, i, c, now + 400);
    s = act(s, player, { type: "next" }, now + 500);
    now += 500;
  });
  return { state: s, now };
}

const view = (state: QuizState, player: string): QuizView => quizGame.viewFor(state, player);

describe("setup", () => {
  it("shuffles choices but keeps every option", () => {
    const state = setup();
    state.questions.forEach((q, i) => {
      expect([...q.choices].sort()).toEqual([...QUESTIONS[i]!.choices].sort());
      expect(q.choices[q.correctChoice]).toBe(`Right ${i + 1}`);
    });
  });

  it("gives everyone the same order for the same seed", () => {
    expect(setup(["a"], 7).questions).toEqual(setup(["b"], 7).questions);
  });

  it("starts everyone on the same question at the same moment, without the answer", () => {
    const state = setup();
    for (const player of ["ada", "tolu"]) {
      const stage = view(state, player).stage;
      expect(stage).toMatchObject({ kind: "question", index: 0, startsAt: START });
      expect(JSON.stringify(stage)).not.toContain("correct");
    }
  });

  it("works for a single player", () => {
    const state = setup(["solo"]);
    expect(view(state, "solo").playerCount).toBe(1);
    const { state: done } = playThrough(state, "solo", [true, true, false], START);
    expect(quizGame.isFinished(done)).toBe(true);
  });
});

describe("playing at your own pace", () => {
  it("never waits for other players", () => {
    let state = answer(setup(), "ada", 0, true, START + 1000);
    state = act(state, "ada", { type: "next" }, START + 1500);
    expect(view(state, "ada").stage).toMatchObject({ kind: "question", index: 1 });
    expect(view(state, "tolu").stage).toMatchObject({ kind: "question", index: 0 });
  });

  it("shows the right answer and explanation after answering", () => {
    const state = answer(setup(), "tolu", 0, false, START + 1000);
    expect(view(state, "tolu").stage).toMatchObject({
      kind: "answer",
      correct: false,
      points: 0,
      correctChoice: right(state, 0),
      explanation: "Because 1.",
      reference: "Book 1:1",
      isLast: false,
    });
  });

  it("times each question from when it appeared", () => {
    let state = answer(setup(), "ada", 0, true, START + 1000);
    state = act(state, "ada", { type: "next" }, START + 5000);
    state = answer(state, "ada", 1, true, START + 5000);
    // First: claimed 0 ms, server saw 1000 ms, allowance keeps it at 0. Second: instant.
    expect(view(state, "ada").me?.score).toBe(1000 + 1000);
  });

  it("times out a question and moves on by itself", () => {
    let state = quizGame.tick(setup(), START + LIMIT);
    expect(view(state, "ada").stage).toMatchObject({ kind: "answer", myChoice: null });
    state = quizGame.tick(state, START + LIMIT + AUTO_ADVANCE_MS);
    expect(view(state, "ada").stage).toMatchObject({ kind: "question", index: 1 });
  });

  it("finishes even if a player stops responding", () => {
    const state = quizGame.tick(setup(), START + 10 * 60_000);
    expect(quizGame.isFinished(state)).toBe(true);
    expect(quizGame.nextWakeAt(state)).toBeNull();
  });

  it("rejects early, repeated and invalid moves", () => {
    const state = setup();
    const move = { type: "answer", index: 0, choice: 0, clientElapsedMs: 0 } as const;
    expect(reject(state, "ada", move, T0)).toMatch(/hasn't started/);
    expect(reject(state, "ada", { type: "next" }, START)).toMatch(/Answer the question first/);
    expect(reject(state, "ada", { ...move, choice: 9 }, START)).toMatch(/isn't one of the choices/);
    expect(reject(state, "stranger", move, START)).toMatch(/watching/);

    const answered = answer(state, "ada", 0, true, START + 100);
    expect(reject(answered, "ada", move, START + 200)).toMatch(/closed/);
  });
});

describe("results", () => {
  it("keeps everyone's scores hidden while you're still playing", () => {
    const state = answer(setup(), "ada", 0, true, START + 1000);
    expect(view(state, "ada").standings).toEqual([]);
    expect(view(state, "tolu").standings).toEqual([]);
  });

  it("shows a points-only leaderboard to whoever finishes first", () => {
    const { state } = playThrough(setup(), "ada", [true, true, true], START);
    const results = view(state, "ada");
    expect(results.stage.kind).toBe("done");
    expect(results.final).toBe(false);
    for (const row of results.standings) {
      expect(Object.keys(row).sort()).toEqual(
        ["finished", "left", "nickname", "playerId", "rank", "score"].sort(),
      );
    }
    expect(results.standings.map((s) => [s.nickname, s.finished])).toEqual([
      ["ADA", true],
      ["TOLU", false],
    ]);
  });

  it("gives each player a private review of their own answers", () => {
    const first = playThrough(setup(), "ada", [true, false, true], START);
    const { state } = playThrough(first.state, "tolu", [false, false, false], first.now);

    const ada = view(state, "ada");
    expect(ada.final).toBe(true);
    if (ada.stage.kind !== "done") throw new Error("expected done");
    expect(ada.stage.review.map((r) => r.correct)).toEqual([true, false, true]);
    expect(ada.stage.review[1]).toMatchObject({
      prompt: "Question 2?",
      myChoice: wrong(state, 1),
      correctChoice: right(state, 1),
      explanation: "Because 2.",
    });

    const tolu = view(state, "tolu");
    if (tolu.stage.kind !== "done") throw new Error("expected done");
    expect(tolu.stage.review.map((r) => r.correct)).toEqual([false, false, false]);
    expect(JSON.stringify(tolu)).not.toContain('"correct":true');
  });

  it("ranks by points", () => {
    const first = playThrough(setup(), "ada", [false, false, true], START);
    const { state } = playThrough(first.state, "tolu", [true, true, false], first.now);
    expect(view(state, "ada").standings.map((s) => [s.nickname, s.rank])).toEqual([
      ["TOLU", 1],
      ["ADA", 2],
    ]);
  });

  it("finishes when the only other player leaves", () => {
    const { state, now } = playThrough(setup(), "ada", [true, true, true], START);
    expect(quizGame.isFinished(quizGame.onPlayerLeft(state, "tolu", now))).toBe(true);
  });

  it("lets a spectator see the leaderboard but no answers", () => {
    const state = answer(setup(), "ada", 0, true, START + 500);
    expect(view(state, "stranger").stage).toEqual({ kind: "watching" });
  });
});
