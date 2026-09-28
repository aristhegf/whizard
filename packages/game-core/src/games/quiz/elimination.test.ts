import { describe, expect, it } from "vitest";
import { isRejection } from "../types";
import {
  CUT_MS,
  FINAL_INTRO_MS,
  keepCount,
  plannedItems,
  planRounds,
  REVEAL_MS,
  START_COUNTDOWN_MS,
  type EliminationState,
  type EliminationView,
} from "./elimination";
import { quizGame } from "./quiz";
import { DEFAULT_QUIZ_SETTINGS, type QuizQuestion } from "./settings";

const T0 = 1_000_000;
const LIMIT = 10_000;

const QUESTIONS: QuizQuestion[] = Array.from({ length: 40 }, (_, i) => ({
  id: `q${i}`,
  prompt: `Question ${i}?`,
  choices: [`Right ${i}`, `Wrong ${i}a`, `Wrong ${i}b`, `Wrong ${i}c`],
}));

/** The knock-outs per round for a number of players, following keepCount. */
function cuts(players: number): number[] {
  const rounds = planRounds(players, 5).length;
  const out: number[] = [];
  let alive = players;
  for (let r = rounds; r >= 1; r--) {
    const keep = keepCount(alive, r);
    out.push(alive - keep);
    alive = keep;
  }
  return out;
}

describe("the numbers", () => {
  it("knocks out more at once in a big group, and always lands on two", () => {
    expect(cuts(3)).toEqual([1]);
    expect(cuts(5)).toEqual([1, 1, 1]);
    expect(cuts(12)).toEqual([3, 2, 2, 1, 1, 1]);
    expect(cuts(20)).toEqual([6, 5, 3, 2, 1, 1]);
    for (const players of [3, 4, 6, 8, 10, 13, 16, 20]) {
      const c = cuts(players);
      expect(
        c.reduce((a, b) => a + b, 0),
        `${players}`,
      ).toBe(players - 2);
      expect(
        c.every((n) => n >= 1),
        `${players}`,
      ).toBe(true);
    }
  });

  it("gives every round, and the final, the number of questions the host picked", () => {
    // 5 players need three knock-out rounds: of 10 each, then a final of 10.
    expect(planRounds(5, 10)).toEqual([10, 20, 30]);
    expect(plannedItems(5, 10)).toBe(40);
    // 12 players: six rounds, the most there are.
    expect(planRounds(12, 5)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(plannedItems(20, 20)).toBe(140);
  });
});

/** Five questions a round, so the games in these tests stay short. */
function setup(players: string[], count: 5 | 10 = 5): EliminationState {
  return quizGame.setup({
    settings: {
      ...DEFAULT_QUIZ_SETTINGS,
      variant: "elimination",
      count,
      timeLimitSeconds: 10,
    },
    players: players.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: QUESTIONS,
    seed: 7,
    now: T0,
  }) as EliminationState;
}

const view = (s: EliminationState, id: string) => quizGame.viewFor(s, id) as EliminationView;
const tick = (s: EliminationState, now: number) => quizGame.tick(s, now) as EliminationState;

/** Everyone still in answers the current question: `right` get it right, after `ms` each. */
function play(
  s: EliminationState,
  now: number,
  right: Record<string, number>,
  wrong: string[] = [],
): { state: EliminationState; now: number } {
  let state = tick(s, now);
  const q = state.items[state.index]!;
  for (const [id, ms] of Object.entries(right)) {
    const r = quizGame.onAction(
      state,
      id,
      { type: "answer", index: state.index, choice: q.correctChoice, clientElapsedMs: ms },
      state.startsAt + ms,
    );
    if (isRejection(r)) throw new Error(`${id}: ${r.rejected}`);
    state = r as EliminationState;
  }
  for (const id of wrong) {
    const r = quizGame.onAction(
      state,
      id,
      {
        type: "answer",
        index: state.index,
        choice: (q.correctChoice + 1) % 4,
        clientElapsedMs: 900,
      },
      state.startsAt + 900,
    );
    if (isRejection(r)) throw new Error(`${id}: ${r.rejected}`);
    state = r as EliminationState;
  }
  // Wait for everything that follows: the reveal, and a cut or final intro if there is one.
  return { state, now: Math.max(now, state.phaseEndsAt) };
}

describe("a game", () => {
  it("knocks out the lowest scores each round until two play the final", () => {
    const names = ["ada", "bola", "chidi", "dayo", "efe"];
    let s = setup(names);
    let now = T0 + START_COUNTDOWN_MS;
    expect(view(s, "ada").stage.kind).toBe("question");
    expect(view(s, "ada").rounds).toBe(3);

    expect(view(s, "ada").roundItem).toEqual({ number: 1, of: 5 });

    // Round 1 (5 questions): Efe gets everything wrong and goes.
    const speed = { ada: 500, bola: 1000, chidi: 1500, dayo: 2000 };
    for (let i = 0; i < 5; i++) ({ state: s, now } = play(s, now, speed, ["efe"]));
    s = tick(s, now);
    const cut = view(s, "efe").stage;
    expect(cut).toMatchObject({ kind: "cut", round: 1, next: "round" });
    expect(cut.kind === "cut" && cut.out.map((p) => p.playerId)).toEqual(["efe"]);
    expect(view(s, "efe").me?.status).toBe("out");

    // Knocked out: watching, can't answer.
    now += CUT_MS;
    s = tick(s, now);
    const q = view(s, "efe").stage;
    expect(q).toMatchObject({ kind: "question", playing: false });
    const refused = quizGame.onAction(
      s,
      "efe",
      { type: "answer", index: s.index, choice: 0, clientElapsedMs: 100 },
      now + 100,
    );
    expect(isRejection(refused)).toBe(true);

    // Rounds 2 and 3: the slowest right answers go, one each.
    const speeds: Record<string, number> = speed;
    for (const alive of [
      ["ada", "bola", "chidi", "dayo"],
      ["ada", "bola", "chidi"],
    ]) {
      const answers = Object.fromEntries(alive.map((id) => [id, speeds[id]!]));
      for (let i = 0; i < 5; i++) ({ state: s, now } = play(s, now, answers));
      s = tick(s, now);
      const slowest = alive[alive.length - 1];
      expect(view(s, "ada").stage).toMatchObject({ kind: "cut", out: [{ playerId: slowest }] });
      now += CUT_MS;
    }
    s = tick(s, now);
    expect(view(s, "ada").stage).toMatchObject({ kind: "final" });
    const finalists = view(s, "ada").stage;
    expect(finalists.kind === "final" && finalists.finalists.map((p) => p.playerId).sort()).toEqual(
      ["ada", "bola"],
    );

    expect(finalists.kind === "final" && finalists.length).toBe(5);

    // The final (5 questions, like a round) starts from zero. Bola wins it: five right to three.
    now += FINAL_INTRO_MS;
    ({ state: s, now } = play(s, now, { bola: 3000 }, ["ada"]));
    expect(view(s, "ada").finalScores?.find((f) => f.playerId === "ada")?.score).toBe(0);
    expect(view(s, "ada").roundItem).toEqual({ number: 1, of: 5 });
    ({ state: s, now } = play(s, now, { bola: 3000, ada: 500 }));
    ({ state: s, now } = play(s, now, { bola: 3000 }, ["ada"]));
    ({ state: s, now } = play(s, now, { bola: 3000, ada: 500 }));
    ({ state: s, now } = play(s, now, { bola: 3000, ada: 500 }));
    s = tick(s, now);
    expect(s.finishedAt).not.toBeNull();
    const done = view(s, "chidi").stage;
    expect(done).toMatchObject({ kind: "done", winner: { playerId: "bola" } });

    const summary = quizGame.summarize(s);
    expect(summary.mode).toBe("elimination");
    expect(summary.players.map((p) => p.playerId)).toEqual(["bola", "ada", "chidi", "dayo", "efe"]);
  });

  it("goes to sudden death when the final is level", () => {
    let s = setup(["ada", "bola", "chidi"]);
    let now = T0 + START_COUNTDOWN_MS;
    // One round of 5 questions knocks out Chidi.
    for (let i = 0; i < 5; i++) {
      ({ state: s, now } = play(s, now, { ada: 1000, bola: 1000 }, ["chidi"]));
    }
    now += CUT_MS;
    s = tick(s, now);
    now = s.phaseEndsAt;
    // Five identical answers each in the final: level.
    for (let i = 0; i < 5; i++) ({ state: s, now } = play(s, now, { ada: 1000, bola: 1000 }));
    s = tick(s, now);
    expect(s.finishedAt).toBeNull();
    expect(view(s, "ada").suddenDeath).toBe(true);
    ({ state: s, now } = play(s, now, { ada: 900 }, ["bola"]));
    s = tick(s, now);
    expect(view(s, "bola").stage).toMatchObject({ kind: "done", winner: { playerId: "ada" } });
  });

  it("keeps both players tied exactly at the line", () => {
    let s = setup(["ada", "bola", "chidi", "dayo"]);
    let now = T0 + START_COUNTDOWN_MS;
    // Four players: two rounds of 5. Chidi and Dayo tie exactly at the bottom of the first.
    for (let i = 0; i < 5; i++) {
      ({ state: s, now } = play(s, now, { ada: 500, bola: 600, chidi: 2000, dayo: 2000 }));
    }
    s = tick(s, now);
    expect(s.lastCut?.tieKept).toBe(true);
    expect(s.lastCut?.out).toEqual([]);
  });

  it("closes a question as soon as everyone still in has answered", () => {
    let s = setup(["ada", "bola", "chidi"]);
    const start = T0 + START_COUNTDOWN_MS;
    ({ state: s } = play(s, start, { ada: 500, bola: 700, chidi: 900 }));
    expect(s.phase).toBe("reveal");
    expect(s.phaseEndsAt).toBe(start + 900 + REVEAL_MS);
  });

  it("times out anyone who doesn't answer", () => {
    let s = setup(["ada", "bola", "chidi"]);
    s = tick(s, T0 + START_COUNTDOWN_MS + LIMIT);
    expect(s.phase).toBe("reveal");
    expect(view(s, "ada").stage).toMatchObject({ kind: "reveal", myChoice: null });
  });

  it("lets a late joiner watch, and ends when everyone else leaves", () => {
    let s = setup(["ada", "bola", "chidi"]);
    s = quizGame.onPlayerJoined(s, { id: "kemi", nickname: "KEMI" }, T0 + 5000) as EliminationState;
    expect(view(s, "kemi").me?.status).toBe("watching");
    expect(view(s, "kemi").standings.map((r) => r.playerId)).not.toContain("kemi");
    s = quizGame.onPlayerLeft(s, "bola", T0 + 6000) as EliminationState;
    s = quizGame.onPlayerLeft(s, "chidi", T0 + 7000) as EliminationState;
    expect(s.finishedAt).toBe(T0 + 7000);
    expect(view(s, "kemi").stage).toMatchObject({ kind: "done", winner: { playerId: "ada" } });
  });

  it("needs at least three players", () => {
    expect(
      quizGame.playersNeeded?.({ ...DEFAULT_QUIZ_SETTINGS, variant: "elimination" }),
    ).toMatchObject({ min: 3 });
    expect(quizGame.playersNeeded?.(DEFAULT_QUIZ_SETTINGS)).toBeNull();
  });
});
