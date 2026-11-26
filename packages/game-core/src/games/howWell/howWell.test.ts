import { describe, expect, it } from "vitest";
import { GAMES, gameModule, isGameId } from "../registry";
import {
  HOW_WELL_GUESS_POINTS_MAX,
  HOW_WELL_GUESS_POINTS_MIN,
  HOW_WELL_INTRO_MS,
  HOW_WELL_KNOWN_POINTS,
  HOW_WELL_REVEAL_MS,
  howWellGame,
  type HowWellState,
  type HowWellView,
} from "./howWell";
import {
  DEFAULT_HOW_WELL_SETTINGS,
  fillName,
  fillYou,
  howWellSettingsSchema,
  type HowWellQuestion,
  type HowWellSettings,
} from "./settings";

const T0 = 1_000_000;
const SETTINGS: HowWellSettings = { rounds: 5, answerSeconds: 20, pack: "friend-group" };
const ANSWER_MS = SETTINGS.answerSeconds * 1000;

const QUESTIONS: HowWellQuestion[] = Array.from({ length: 15 }, (_, i) => ({
  id: `how-well-friend-group-${String(i + 1).padStart(3, "0")}`,
  pack: "friend-group",
  prompt: `Question ${i + 1}: what's {name}'s pick?`,
  choices: ["A", "B", "C", "D"],
}));

function setup(
  ids: string[] = ["ada", "bo", "cy"],
  settings: HowWellSettings = SETTINGS,
  content: HowWellQuestion[] = QUESTIONS,
): HowWellState {
  return howWellGame.setup({
    settings,
    players: ids.map((id) => ({ id, nickname: id.toUpperCase() })),
    content,
    seed: 7,
    now: T0,
  });
}

const tick = (state: HowWellState, now: number) => howWellGame.tick(state, now);

/** An answer, as the room runs it: a tick first, then the action, throwing on a rejection. */
function act(
  state: HowWellState,
  playerId: string,
  choice: number,
  now = state.answerStartsAt + 1000,
  clientMs = now - state.answerStartsAt,
): HowWellState {
  const result = howWellGame.onAction(
    tick(state, now),
    playerId,
    { type: "answer", choice, clientElapsedMs: clientMs },
    now,
  );
  if ("rejected" in result) throw new Error(result.rejected);
  return result;
}

function rejection(state: HowWellState, playerId: string, choice: number, now: number): string {
  const result = howWellGame.onAction(
    tick(state, now),
    playerId,
    { type: "answer", choice, clientElapsedMs: 0 },
    now,
  );
  return "rejected" in result ? result.rejected : "accepted";
}

const viewOf = (state: HowWellState, playerId: string) =>
  howWellGame.viewFor(state, playerId) as HowWellView;

const subjectOf = (state: HowWellState) => state.history.at(-1)!.subjectId;

/** From the intro to open answers. */
const open = (state: HowWellState) => tick(state, state.answerStartsAt);

/** From the reveal to the next round's intro (or the end). */
const next = (state: HowWellState) => tick(state, state.revealEndsAt!);

/** Plays every round: the subject picks 0, everyone else picks what `guess` says. */
function playAll(state: HowWellState, guess: (id: string) => number | null = () => 0) {
  let s = state;
  const subjects: string[] = [];
  while (!howWellGame.isFinished(s)) {
    s = open(s);
    const subject = subjectOf(s);
    subjects.push(subject);
    s = act(s, subject, 0);
    for (const p of s.players) {
      if (p.id === subject || p.left || s.phase !== "answer") continue;
      const pick = guess(p.id);
      if (pick !== null) s = act(s, p.id, pick);
    }
    if (s.phase === "answer") s = tick(s, s.answerEndsAt);
    expect(s.phase).toBe("reveal");
    s = next(s);
  }
  return { state: s, subjects };
}

describe("how well do you know me: setup and registration", () => {
  it("is registered as how-well for 2 to 20 players", () => {
    expect(isGameId("how-well")).toBe(true);
    expect(gameModule("how-well")).toBe(GAMES["how-well"]);
    expect(howWellGame.id).toBe("how-well");
    expect(howWellGame.minPlayers).toBe(2);
    expect(howWellGame.maxPlayers).toBe(20);
  });

  it("asks the content bank for one question per round from the pack", () => {
    expect(howWellGame.contentNeeded(SETTINGS, 4)).toEqual({
      kind: "how-well-questions",
      pack: "friend-group",
      count: 5,
    });
    expect(
      howWellGame.contentNeeded({ ...DEFAULT_HOW_WELL_SETTINGS, pack: "couples", rounds: 15 }, 2),
    ).toEqual({ kind: "how-well-questions", pack: "couples", count: 15 });
  });

  it("opens with an intro on the first seat, then the question", () => {
    const s = setup();
    expect(s.phase).toBe("intro");
    expect(subjectOf(s)).toBe("ada");
    expect(s.answerStartsAt).toBe(T0 + HOW_WELL_INTRO_MS);
    expect(s.answerEndsAt).toBe(s.answerStartsAt + ANSWER_MS);
    expect(howWellGame.nextWakeAt(s)).toBe(s.answerStartsAt);
    expect(tick(s, s.answerStartsAt - 1).phase).toBe("intro");
    const opened = open(s);
    expect(opened.phase).toBe("answer");
    expect(howWellGame.nextWakeAt(opened)).toBe(opened.answerEndsAt);
  });

  it("uses the questions in the order drawn, one per round", () => {
    const { state } = playAll(setup());
    expect(state.history.map((r) => r.question.id)).toEqual(QUESTIONS.slice(0, 5).map((q) => q.id));
  });

  it("plays fewer rounds if the bank came up short", () => {
    const { state, subjects } = playAll(setup(["ada", "bo"], SETTINGS, QUESTIONS.slice(0, 3)));
    expect(subjects).toHaveLength(3);
    expect(viewOf(state, "ada").rounds).toBe(3);
  });

  it("fills in the subject's name", () => {
    expect(fillName("What's {name}'s ideal Saturday?", "Ada")).toBe("What's Ada's ideal Saturday?");
    expect(fillName("{name} or {name}?", "Bo")).toBe("Bo or Bo?");
  });

  it("asks the subject about themselves", () => {
    expect(fillYou("What's {name}'s ideal Saturday?")).toBe("What's your ideal Saturday?");
    expect(fillYou("How does {name} take their tea?")).toBe("How do you take your tea?");
    expect(fillYou("What's {name} like in a group chat?")).toBe(
      "What are you like in a group chat?",
    );
    expect(fillYou("Which room is {name} always found in?")).toBe(
      "Which room are you always found in?",
    );
    expect(fillYou("How does {name} act when they're hungry?")).toBe(
      "How do you act when you're hungry?",
    );
    expect(fillYou("What would {name} do if they were in charge?")).toBe(
      "What would you do if you were in charge?",
    );
    expect(fillYou("What makes {name} laugh?")).toBe("What makes you laugh?");
  });
});

describe("settings", () => {
  it("defaults to 10 rounds, 20 seconds and the friend group pack", () => {
    expect(DEFAULT_HOW_WELL_SETTINGS).toEqual({
      rounds: 10,
      answerSeconds: 20,
      pack: "friend-group",
    });
    expect(howWellSettingsSchema.parse(DEFAULT_HOW_WELL_SETTINGS)).toEqual(
      DEFAULT_HOW_WELL_SETTINGS,
    );
    expect(howWellGame.defaultSettings).toEqual(DEFAULT_HOW_WELL_SETTINGS);
  });

  it("takes every listed option", () => {
    for (const rounds of [5, 10, 15]) {
      for (const answerSeconds of [15, 20, 30]) {
        for (const pack of ["couples", "best-friends", "family", "friend-group"]) {
          expect(howWellSettingsSchema.safeParse({ rounds, answerSeconds, pack }).success).toBe(
            true,
          );
        }
      }
    }
  });

  it("refuses anything else", () => {
    const ok = DEFAULT_HOW_WELL_SETTINGS;
    for (const bad of [
      { ...ok, rounds: 7 },
      { ...ok, rounds: "10" },
      { ...ok, answerSeconds: 10 },
      { ...ok, answerSeconds: 60 },
      { ...ok, pack: "work" },
      { rounds: 10, answerSeconds: 20 },
      null,
    ]) {
      expect(howWellSettingsSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("rotation", () => {
  it("turns through every player in seat order, then round again", () => {
    const { subjects } = playAll(setup(["ada", "bo", "cy"], { ...SETTINGS, rounds: 10 }));
    expect(subjects).toEqual(["ada", "bo", "cy", "ada", "bo", "cy", "ada", "bo", "cy", "ada"]);
  });

  it("alternates for a couple", () => {
    const { subjects } = playAll(setup(["ada", "bo"]));
    expect(subjects).toEqual(["ada", "bo", "ada", "bo", "ada"]);
  });

  it("with more players than rounds, gives the first seats a turn each", () => {
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const { subjects } = playAll(setup(ids));
    expect(subjects).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("skips players who left", () => {
    let s = setup(["ada", "bo", "cy", "di"], { ...SETTINGS, rounds: 10 });
    s = howWellGame.onPlayerLeft(s, "bo", T0);
    const { subjects } = playAll(s);
    expect(subjects).toEqual(["ada", "cy", "di", "ada", "cy", "di", "ada", "cy", "di", "ada"]);
  });

  it("puts a late joiner into the current cycle, not in front of it", () => {
    let s = setup(["ada", "bo", "cy"], { ...SETTINGS, rounds: 10 });
    // Ada's round: Dee joins once answers are open, so she's in from the next round.
    s = open(s);
    s = howWellGame.onPlayerJoined(s, { id: "dee", nickname: "DEE" }, s.answerStartsAt);
    const { subjects } = playAll(s);
    expect(subjects).toEqual(["ada", "bo", "cy", "dee", "ada", "bo", "cy", "dee", "ada", "bo"]);
  });

  it("a late joiner after a full cycle waits for the next cycle", () => {
    let s = setup(["ada", "bo"], { ...SETTINGS, rounds: 10 });
    for (let i = 0; i < 3; i++) {
      s = open(s);
      s = act(s, subjectOf(s), 0);
      s = act(s, s.players.find((p) => p.id !== subjectOf(s))!.id, 0);
      s = next(s);
    }
    // Ada, Bo, Ada so far; Bo is up. Cy arrives in the intro and is straight in.
    expect(subjectOf(s)).toBe("bo");
    s = howWellGame.onPlayerJoined(s, { id: "cy", nickname: "CY" }, s.answerStartsAt - 1);
    const { subjects } = playAll(s);
    // Cy owes nobody: one turn a cycle, like everyone else, and never twice in a row.
    expect(subjects).toEqual(["bo", "cy", "ada", "bo", "cy", "ada", "bo"]);
  });

  it("a player who comes back rejoins the rotation without a run of catch-up turns", () => {
    let s = setup(["ada", "bo", "cy"], { ...SETTINGS, rounds: 15 });
    s = howWellGame.onPlayerLeft(s, "cy", T0);
    const subjects: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = open(s);
      subjects.push(subjectOf(s));
      s = act(s, subjectOf(s), 0);
      s = tick(s, s.answerEndsAt);
      s = next(s);
    }
    expect(subjects).toEqual(["ada", "bo", "ada", "bo", "ada", "bo"]);
    s = howWellGame.onPlayerJoined(s, { id: "cy", nickname: "CY" }, s.answerStartsAt - 1);
    const rest = playAll(s).subjects;
    expect(rest.slice(0, 6)).toEqual(["ada", "bo", "cy", "ada", "bo", "cy"]);
  });
});

describe("answering", () => {
  it("only opens answers once the intro is over", () => {
    const s = setup();
    expect(rejection(s, "bo", 0, s.answerStartsAt - 1)).toBe("Answers aren't open.");
    expect(rejection(s, "bo", 0, s.answerStartsAt)).toBe("accepted");
  });

  it("takes one answer each, from the choices", () => {
    let s = open(setup());
    expect(rejection(s, "bo", 4, s.answerStartsAt + 10)).toBe("That isn't one of the choices.");
    expect(rejection(s, "bo", -1, s.answerStartsAt + 10)).toBe("That isn't one of the choices.");
    s = act(s, "bo", 2);
    expect(rejection(s, "bo", 1, s.answerStartsAt + 2000)).toBe("You've already answered.");
    expect(rejection(s, "stranger", 1, s.answerStartsAt + 2000)).toBe("You're watching this game.");
  });

  it("ends early once the subject and every guesser have answered", () => {
    let s = open(setup());
    s = act(s, "bo", 1);
    s = act(s, "ada", 1);
    expect(s.phase).toBe("answer");
    s = act(s, "cy", 2, s.answerStartsAt + 3000);
    expect(s.phase).toBe("reveal");
    expect(s.revealEndsAt).toBe(s.answerStartsAt + 3000 + HOW_WELL_REVEAL_MS);
    expect(howWellGame.nextWakeAt(s)).toBe(s.revealEndsAt);
  });

  it("waits for the subject even when every guess is in", () => {
    let s = open(setup());
    s = act(s, "bo", 1);
    s = act(s, "cy", 1);
    expect(s.phase).toBe("answer");
  });

  it("closes when the time runs out", () => {
    let s = open(setup());
    s = act(s, "ada", 1);
    expect(tick(s, s.answerEndsAt - 1).phase).toBe("answer");
    s = tick(s, s.answerEndsAt);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.outcome).toBe("answered");
  });

  it("closes straight away if the room only wakes up after the deadline", () => {
    const s = tick(setup(), T0 + HOW_WELL_INTRO_MS + ANSWER_MS + 5);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.outcome).toBe("no-answer");
  });

  it("moves on after the reveal and finishes after the last round", () => {
    let s = open(setup(["ada", "bo"], { ...SETTINGS, rounds: 5 }));
    s = act(s, "ada", 0);
    s = act(s, "bo", 0);
    expect(tick(s, s.revealEndsAt! - 1).phase).toBe("reveal");
    s = next(s);
    expect(s.phase).toBe("intro");
    expect(s.history).toHaveLength(2);
    const { state } = playAll(s);
    expect(howWellGame.isFinished(state)).toBe(true);
    expect(howWellGame.nextWakeAt(state)).toBeNull();
    expect(rejection(state, "ada", 0, state.finishedAt! + 1)).toBe("The game is over.");
  });
});

describe("scoring", () => {
  it("pays right guesses by speed, and the subject for each one", () => {
    let s = open(setup(["ada", "bo", "cy", "di"]));
    s = act(s, "ada", 2, s.answerStartsAt + 5000);
    s = act(s, "bo", 2, s.answerStartsAt); // instant
    s = act(s, "cy", 2, s.answerStartsAt + ANSWER_MS / 2);
    s = act(s, "di", 3, s.answerStartsAt + 100); // wrong
    expect(s.phase).toBe("reveal");
    const round = s.history[0]!;
    expect(round.points).toEqual({
      bo: HOW_WELL_GUESS_POINTS_MAX,
      cy: (HOW_WELL_GUESS_POINTS_MIN + HOW_WELL_GUESS_POINTS_MAX) / 2,
      ada: 2 * HOW_WELL_KNOWN_POINTS,
    });
    const standings = viewOf(s, "ada").standings;
    // Bo and Ada tie on points; Bo has the right guess.
    expect(standings.map((r) => r.playerId)).toEqual(["bo", "ada", "cy", "di"]);
    expect(standings.find((r) => r.playerId === "ada")).toMatchObject({
      points: 1000,
      known: 2,
      turns: 1,
      correct: 0,
      guessed: 0,
    });
    expect(standings.find((r) => r.playerId === "di")).toMatchObject({
      points: 0,
      correct: 0,
      guessed: 1,
    });
  });

  it("a guess at the very end of the window still scores the floor", () => {
    let s = open(setup(["ada", "bo"]));
    s = act(s, "ada", 1);
    s = act(s, "bo", 1, s.answerEndsAt - 1, ANSWER_MS);
    expect(s.history[0]!.points["bo"]).toBe(HOW_WELL_GUESS_POINTS_MIN);
  });

  it("credits the screen's own time, within the network allowance", () => {
    let s = open(setup(["ada", "bo"]));
    s = act(s, "ada", 1);
    // Claims an impossible instant answer 10 s in: credited no faster than 8.5 s.
    s = act(s, "bo", 1, s.answerStartsAt + 10_000, 0);
    const expected = Math.round(
      HOW_WELL_GUESS_POINTS_MIN +
        (HOW_WELL_GUESS_POINTS_MAX - HOW_WELL_GUESS_POINTS_MIN) * (1 - 8500 / ANSWER_MS),
    );
    expect(s.history[0]!.points["bo"]).toBe(expected);
  });

  it("a guesser who never answers scores nothing and counts as a miss", () => {
    let s = open(setup(["ada", "bo", "cy"]));
    s = act(s, "ada", 0);
    s = act(s, "bo", 0);
    s = tick(s, s.answerEndsAt);
    const reveal = viewOf(s, "cy").stage;
    if (reveal.kind !== "reveal") throw new Error("expected the reveal");
    expect(reveal.guesses).toEqual([
      { playerId: "bo", choice: 0, correct: true, points: expect.any(Number) },
      { playerId: "cy", choice: null, correct: false, points: 0 },
    ]);
    expect(viewOf(s, "cy").me).toMatchObject({ guessed: 1, correct: 0, points: 0 });
  });

  it("totals points across the game", () => {
    const { state } = playAll(setup(["ada", "bo", "cy"], { ...SETTINGS, rounds: 5 }));
    // Everyone always guesses 0 and every subject picks 0: everyone right, every round.
    const standings = viewOf(state, "ada").standings;
    const sum = (id: string) => state.history.reduce((total, r) => total + (r.points[id] ?? 0), 0);
    for (const row of standings) expect(row.points).toBe(sum(row.playerId));
    // Ada and Bo had two turns, Cy one.
    expect(standings.find((r) => r.playerId === "ada")).toMatchObject({ turns: 2, known: 4 });
    expect(standings.find((r) => r.playerId === "cy")).toMatchObject({
      turns: 1,
      known: 2,
      correct: 4,
      guessed: 4,
    });
  });
});

describe("void rounds", () => {
  it("is void when the subject doesn't answer in time: nobody scores", () => {
    let s = open(setup());
    s = act(s, "bo", 1);
    s = act(s, "cy", 1);
    s = tick(s, s.answerEndsAt);
    expect(s.phase).toBe("reveal");
    const round = s.history[0]!;
    expect(round.outcome).toBe("no-answer");
    expect(round.points).toEqual({});
    const stage = viewOf(s, "bo").stage;
    expect(stage).toMatchObject({ kind: "reveal", outcome: "no-answer", answer: null });
    if (stage.kind !== "reveal") throw new Error("expected the reveal");
    expect(stage.guesses.every((g) => !g.correct && g.points === 0)).toBe(true);
    expect(stage.subjectPoints).toBe(0);
    // A void round is no turn guessed in, but it was the subject's turn.
    expect(viewOf(s, "bo").me).toMatchObject({ guessed: 0, points: 0 });
    expect(viewOf(s, "ada").me).toMatchObject({ turns: 1, known: 0 });
  });

  it("is void when the subject leaves mid-round, and the game moves on", () => {
    let s = open(setup(["ada", "bo", "cy"]));
    s = act(s, "ada", 1);
    s = act(s, "bo", 1);
    const at = s.answerStartsAt + 2000;
    s = howWellGame.onPlayerLeft(s, "ada", at);
    expect(s.phase).toBe("reveal");
    expect(s.revealEndsAt).toBe(at + HOW_WELL_REVEAL_MS);
    expect(s.history[0]).toMatchObject({ outcome: "subject-left", points: {} });
    expect(viewOf(s, "bo").stage).toMatchObject({
      kind: "reveal",
      outcome: "subject-left",
      answer: null,
    });
    s = next(s);
    expect(s.phase).toBe("intro");
    expect(subjectOf(s)).toBe("bo");
  });

  it("is void when the subject leaves during the intro", () => {
    let s = setup(["ada", "bo", "cy"]);
    s = howWellGame.onPlayerLeft(s, "ada", T0 + 10);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.outcome).toBe("subject-left");
  });

  it("void rounds still count towards the game's length", () => {
    let s = setup(["ada", "bo"], { ...SETTINGS, rounds: 5 });
    for (let i = 0; i < 5; i++) {
      s = tick(open(s), s.answerEndsAt);
      s = next(s);
    }
    expect(howWellGame.isFinished(s)).toBe(true);
    const summary = howWellGame.summarize(s);
    expect(summary.rounds).toBe(5);
    expect(summary.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe("leaving and joining", () => {
  it("a guesser leaving can end the round on everyone else's answers", () => {
    let s = open(setup(["ada", "bo", "cy"]));
    s = act(s, "ada", 0);
    s = act(s, "bo", 0);
    s = howWellGame.onPlayerLeft(s, "cy", s.answerStartsAt + 3000);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.outcome).toBe("answered");
    expect(s.history[0]!.guessers).toEqual(["bo"]);
  });

  it("a guess made before leaving still counts for the subject", () => {
    let s = open(setup(["ada", "bo", "cy"]));
    s = act(s, "bo", 0);
    s = howWellGame.onPlayerLeft(s, "bo", s.answerStartsAt + 2000);
    s = act(s, "ada", 0);
    s = act(s, "cy", 1);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.guessers).toEqual(["bo", "cy"]);
    expect(s.history[0]!.points["ada"]).toBe(HOW_WELL_KNOWN_POINTS);
  });

  it("ends the game when fewer than two players are left", () => {
    let s = open(setup(["ada", "bo"]));
    s = howWellGame.onPlayerLeft(s, "bo", s.answerStartsAt + 10);
    expect(howWellGame.isFinished(s)).toBe(true);
    expect(viewOf(s, "ada").stage).toEqual({ kind: "done" });
    expect(howWellGame.summarize(s).players.map((p) => p.playerId)).toEqual(["ada"]);
  });

  it("ignores a leave from someone not in the game, or already gone", () => {
    const s = open(setup());
    expect(howWellGame.onPlayerLeft(s, "nobody", s.answerStartsAt)).toBe(s);
    const gone = howWellGame.onPlayerLeft(s, "cy", s.answerStartsAt);
    expect(howWellGame.onPlayerLeft(gone, "cy", s.answerStartsAt)).toBe(gone);
  });

  it("a newcomer in the intro plays this round; once answers open, the next", () => {
    let s = setup(["ada", "bo"]);
    s = howWellGame.onPlayerJoined(s, { id: "cy", nickname: "CY" }, T0 + 10);
    s = open(s);
    expect(viewOf(s, "cy").stage).toMatchObject({ kind: "answer", role: "guesser" });
    s = howWellGame.onPlayerJoined(s, { id: "di", nickname: "DI" }, s.answerStartsAt + 10);
    expect(viewOf(s, "di").stage).toMatchObject({ kind: "answer", role: "spectator" });
    expect(rejection(s, "di", 0, s.answerStartsAt + 20)).toBe("You're in from the next round.");
    // Di isn't waited on: the round ends on the other three.
    s = act(s, "ada", 0);
    s = act(s, "bo", 0);
    s = act(s, "cy", 0);
    expect(s.phase).toBe("reveal");
    expect(viewOf(s, "di").stage).toMatchObject({ kind: "reveal", role: "spectator" });
    s = next(s);
    expect(viewOf(s, "di").stage).toMatchObject({ kind: "intro", role: "guesser" });
  });

  it("someone coming back mid-round can still answer it", () => {
    let s = open(setup(["ada", "bo", "cy"]));
    s = howWellGame.onPlayerLeft(s, "cy", s.answerStartsAt + 10);
    s = howWellGame.onPlayerJoined(s, { id: "cy", nickname: "CY" }, s.answerStartsAt + 20);
    s = act(s, "ada", 0);
    s = act(s, "bo", 0);
    expect(s.phase).toBe("answer");
    s = act(s, "cy", 0);
    expect(s.phase).toBe("reveal");
  });

  it("ignores joins once the game is over, and duplicate joins", () => {
    const s = open(setup());
    expect(howWellGame.onPlayerJoined(s, { id: "bo", nickname: "BO" }, s.answerStartsAt)).toBe(s);
    const { state } = playAll(setup());
    expect(howWellGame.onPlayerJoined(state, { id: "zed", nickname: "ZED" }, T0)).toBe(state);
  });
});

describe("viewFor", () => {
  it("never shows the subject's answer or anyone's guess before the reveal", () => {
    let s = setup(["ada", "bo", "cy"]);
    s = open(s);
    s = act(s, "ada", 3);
    s = act(s, "bo", 2);
    expect(s.phase).toBe("answer");
    for (const id of ["ada", "bo", "cy", "stranger"]) {
      const view = viewOf(s, id);
      const stage = view.stage;
      expect(stage.kind).toBe("answer");
      if (stage.kind !== "answer") return;
      expect(stage.answered).toEqual(["ada", "bo"]);
      expect(stage.participants).toEqual(["ada", "bo", "cy"]);
      expect(stage).not.toHaveProperty("answer");
      expect(stage).not.toHaveProperty("guesses");
      // Only your own pick, and nothing else's choice anywhere in the view.
      const text = JSON.stringify(view);
      expect(text).not.toContain('"picks"');
      if (id === "ada") expect(view.myAnswer?.choice).toBe(3);
      else if (id === "bo") expect(view.myAnswer?.choice).toBe(2);
      else expect(view.myAnswer).toBeNull();
      const choices = [...text.matchAll(/"choice":(\d+)/g)].map((m) => Number(m[1]));
      expect(choices).toEqual(view.myAnswer ? [view.myAnswer.choice] : []);
    }
  });

  it("shows nothing hidden in the intro either", () => {
    const s = setup(["ada", "bo"]);
    const view = viewOf(s, "bo");
    expect(view.stage).toMatchObject({
      kind: "intro",
      round: 0,
      subject: { playerId: "ada", nickname: "ADA" },
      role: "guesser",
      prompt: QUESTIONS[0]!.prompt,
      choices: QUESTIONS[0]!.choices,
      startsAt: s.answerStartsAt,
      deadline: s.answerEndsAt,
      answered: [],
    });
    expect(viewOf(s, "ada").stage).toMatchObject({ role: "subject" });
  });

  it("reveals the answer, every guess and the points", () => {
    let s = open(setup(["ada", "bo", "cy"]));
    s = act(s, "ada", 3);
    s = act(s, "bo", 3, s.answerStartsAt);
    s = act(s, "cy", 0);
    const view = viewOf(s, "cy");
    expect(view.stage).toEqual({
      kind: "reveal",
      round: 0,
      subject: { playerId: "ada", nickname: "ADA" },
      role: "guesser",
      prompt: QUESTIONS[0]!.prompt,
      choices: QUESTIONS[0]!.choices,
      outcome: "answered",
      answer: 3,
      guesses: [
        { playerId: "bo", choice: 3, correct: true, points: HOW_WELL_GUESS_POINTS_MAX },
        { playerId: "cy", choice: 0, correct: false, points: 0 },
      ],
      subjectPoints: HOW_WELL_KNOWN_POINTS,
      endsAt: s.revealEndsAt,
    });
    expect(view.myAnswer?.choice).toBe(0);
    expect(viewOf(s, "ada").stage).toMatchObject({ role: "subject" });
  });

  it("describes the game around the stage", () => {
    const s = setup(["ada", "bo"], { rounds: 10, answerSeconds: 30, pack: "couples" });
    const view = viewOf(s, "ada");
    expect(view).toMatchObject({
      game: "how-well",
      rounds: 10,
      pack: "couples",
      answerMs: 30_000,
      myAnswer: null,
      playerCount: 2,
      final: false,
    });
    expect(view.me).toMatchObject({ playerId: "ada", rank: 1, points: 0 });
    expect(viewOf(s, "stranger").me).toBeNull();
  });

  it("is done at the end, with the final standings", () => {
    const { state } = playAll(setup());
    const view = viewOf(state, "bo");
    expect(view.stage).toEqual({ kind: "done" });
    expect(view.final).toBe(true);
    expect(view.myAnswer).toBeNull();
    expect(view.standings).toHaveLength(3);
  });
});

describe("summarize", () => {
  it("records the pack, the rounds and everyone who stayed, best first", () => {
    let s = setup(["ada", "bo", "cy", "di"], { ...SETTINGS, rounds: 5 });
    // Di leaves straight away; Cy always guesses wrong.
    s = howWellGame.onPlayerLeft(s, "di", T0);
    const { state } = playAll(s, (id) => (id === "cy" ? 1 : 0));
    const summary = howWellGame.summarize(state);
    expect(summary.category).toBe("friend-group");
    expect(summary.difficulty).toBeNull();
    expect(summary.mode).toBeNull();
    // Di left before her turn: Ada, Bo, Cy, Ada, Bo.
    expect(summary.rounds).toBe(5);
    // Ada and Bo level on everything, so by name.
    expect(summary.players.map((p) => p.playerId)).toEqual(["ada", "bo", "cy"]);
    expect(summary.players.map((p) => p.placing)).toEqual([1, 2, 3]);
    const standings = viewOf(state, "ada").standings;
    for (const p of summary.players) {
      const row = standings.find((r) => r.playerId === p.playerId)!;
      expect(p.score).toBe(row.points);
      expect(p.correct).toBe(row.correct);
    }
    expect(summary.players.find((p) => p.playerId === "cy")!.correct).toBe(0);
  });
});
