import { describe, expect, it } from "vitest";
import { createRoomState } from "../../room";
import { startGame, typedTextOf } from "../../session";
import {
  CREW_VOTE_POINTS,
  IMPOSTOR_CLUE_MAX_LENGTH,
  IMPOSTOR_ESCAPE_POINTS,
  IMPOSTOR_GUESS_MS,
  IMPOSTOR_GUESS_POINTS,
  IMPOSTOR_REVEAL_MS,
  IMPOSTOR_ROLE_MS,
  clueProblem,
  impostorGame,
  type ImpostorAction,
  type ImpostorRound,
  type ImpostorState,
  type ImpostorView,
} from "./impostor";
import {
  DEFAULT_IMPOSTOR_SETTINGS,
  IMPOSTOR_GUESS_OPTIONS,
  impostorSettingsSchema,
  type ImpostorSettings,
  type ImpostorWord,
} from "./settings";

const T0 = 1_000_000;
const PLAYERS = ["ada", "bola", "chidi", "dayo"];
const SETTINGS: ImpostorSettings = { ...DEFAULT_IMPOSTOR_SETTINGS, rounds: 8 };
const SECRET_WORDS = [
  "Pineapple",
  "Spaghetti",
  "Watermelon",
  "Doughnut",
  "Avocado",
  "Pancake",
  "Sandwich",
  "Popcorn",
];
const DECOYS = ["Apple", "Bread", "Cheese", "Honey", "Lemon", "Mango", "Salad"];
const WORDS: ImpostorWord[] = SECRET_WORDS.map((word, i) => ({
  id: `impostor-food-${i}`,
  category: "food",
  word,
  decoys: DECOYS,
}));

function setup(
  ids: string[] = PLAYERS,
  settings: Partial<ImpostorSettings> = {},
  seed = 7,
): ImpostorState {
  return impostorGame.setup({
    settings: { ...SETTINGS, ...settings },
    players: ids.map((id) => ({ id, nickname: id.toUpperCase() })),
    content: WORDS,
    seed,
    now: T0,
  });
}

const tick = (state: ImpostorState, now: number) => impostorGame.tick(state, now);

/** An action as the room runs it: a tick first, then the action. */
function attempt(state: ImpostorState, playerId: string, action: ImpostorAction, now: number) {
  return impostorGame.onAction(tick(state, now), playerId, action, now);
}

/** The same, throwing on a rejection. */
function act(
  state: ImpostorState,
  playerId: string,
  action: ImpostorAction,
  now = state.phaseEndsAt - 1000,
): ImpostorState {
  const result = attempt(state, playerId, action, now);
  if ("rejected" in result) throw new Error(result.rejected);
  return result;
}

/** The message a rejected action comes back with. */
function rejection(
  state: ImpostorState,
  playerId: string,
  action: ImpostorAction,
  now = state.phaseEndsAt - 1000,
): string {
  const result = attempt(state, playerId, action, now);
  if (!("rejected" in result)) throw new Error("Expected a rejection");
  return result.rejected;
}

const viewOf = (state: ImpostorState, playerId: string): ImpostorView =>
  impostorGame.viewFor(state, playerId);

const roundOf = (state: ImpostorState): ImpostorRound => state.rounds.at(-1)!;
const impostorOf = (state: ImpostorState) => roundOf(state).impostorId;
const crewOf = (state: ImpostorState) =>
  roundOf(state).order.filter((id) => id !== impostorOf(state));
const turnOf = (state: ImpostorState) => roundOf(state).order[roundOf(state).turn]!;

/** Past the role card, to the first clue. */
function toClues(state: ImpostorState): ImpostorState {
  const next = tick(state, state.phaseEndsAt);
  expect(next.phase).toBe("clues");
  return next;
}

/** Everyone gives a clue in turn (typed or spoken, as the game is set), up to the vote. */
function giveClues(state: ImpostorState): ImpostorState {
  let s = state.phase === "role" ? toClues(state) : state;
  let n = 0;
  while (s.phase === "clues") {
    const action: ImpostorAction =
      s.settings.clues === "typed" ? { type: "clue", text: `hint${n++}` } : { type: "done" };
    s = act(s, turnOf(s), action);
  }
  expect(s.phase).toBe("vote");
  return s;
}

/** Everyone votes as given; anyone left out abstains. */
function vote(state: ImpostorState, votes: Record<string, string>): ImpostorState {
  let s = state;
  for (const [voter, suspect] of Object.entries(votes)) {
    s = act(s, voter, { type: "vote", playerId: suspect });
  }
  return s;
}

/** Everyone else votes for the impostor; the impostor votes for the first crew member. */
function catchImpostor(state: ImpostorState): ImpostorState {
  const impostor = impostorOf(state);
  const votes: Record<string, string> = {};
  for (const id of roundOf(state).order) votes[id] = id === impostor ? crewOf(state)[0]! : impostor;
  return vote(state, votes);
}

/** Plays every round to the end, the vote always catching the impostor, who never guesses. */
function playAll(state: ImpostorState): ImpostorState {
  let s = state;
  while (!impostorGame.isFinished(s)) {
    s = catchImpostor(giveClues(s));
    if (s.phase === "guess") s = tick(s, s.phaseEndsAt);
    expect(s.phase).toBe("reveal");
    s = tick(s, s.phaseEndsAt);
  }
  return s;
}

/** The state with one round field swapped, for checking what a view depends on. */
function withRound(state: ImpostorState, change: Partial<ImpostorRound>): ImpostorState {
  return { ...state, rounds: [...state.rounds.slice(0, -1), { ...roundOf(state), ...change }] };
}

describe("impostor settings", () => {
  it("has the agreed defaults and choices", () => {
    expect(DEFAULT_IMPOSTOR_SETTINGS).toEqual({
      rounds: 5,
      clueSeconds: 20,
      voteSeconds: 30,
      clues: "typed",
      wordPack: "mixed",
    });
    expect(impostorSettingsSchema.parse(DEFAULT_IMPOSTOR_SETTINGS)).toEqual(
      DEFAULT_IMPOSTOR_SETTINGS,
    );
    const ok = (change: Record<string, unknown>) =>
      impostorSettingsSchema.safeParse({ ...DEFAULT_IMPOSTOR_SETTINGS, ...change }).success;
    for (const rounds of [3, 5, 8]) expect(ok({ rounds })).toBe(true);
    for (const clueSeconds of [15, 20, 30]) expect(ok({ clueSeconds })).toBe(true);
    for (const voteSeconds of [20, 30, 45]) expect(ok({ voteSeconds })).toBe(true);
    for (const clues of ["typed", "spoken"]) expect(ok({ clues })).toBe(true);
    for (const wordPack of ["mixed", "food", "animals", "places", "jobs", "home", "sports"]) {
      expect(ok({ wordPack })).toBe(true);
    }
    expect(ok({ rounds: 4 })).toBe(false);
    expect(ok({ clueSeconds: 25 })).toBe(false);
    expect(ok({ voteSeconds: 60 })).toBe(false);
    expect(ok({ clues: "drawn" })).toBe(false);
    expect(ok({ wordPack: "colours" })).toBe(false);
    expect(impostorSettingsSchema.safeParse({ rounds: 5 }).success).toBe(false);
  });

  it("asks the content bank for one word per round from the pack", () => {
    expect(impostorGame.contentNeeded({ ...SETTINGS, rounds: 3, wordPack: "jobs" }, 6)).toEqual({
      kind: "impostor-words",
      pack: "jobs",
      count: 3,
    });
    expect(impostorGame.minPlayers).toBe(4);
    expect(impostorGame.maxPlayers).toBe(12);
  });
});

describe("impostor rounds", () => {
  it("starts on the role card, with one impostor and a seeded clue order", () => {
    const state = setup();
    expect(state.phase).toBe("role");
    expect(state.phaseEndsAt).toBe(T0 + IMPOSTOR_ROLE_MS);
    expect(impostorGame.nextWakeAt(state)).toBe(T0 + IMPOSTOR_ROLE_MS);
    const round = roundOf(state);
    expect(round.word).toBe("Pineapple");
    expect([...round.order].sort()).toEqual([...PLAYERS].sort());
    expect(PLAYERS).toContain(round.impostorId);
    // The last chance's choices: the word and seven from its category, all different.
    expect(round.options).toHaveLength(IMPOSTOR_GUESS_OPTIONS);
    expect(round.options).toContain("Pineapple");
    expect(new Set(round.options).size).toBe(IMPOSTOR_GUESS_OPTIONS);
    // The same seed makes the same game.
    expect(setup().rounds).toEqual(state.rounds);
    const orders = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) => setup(PLAYERS, {}, seed).rounds[0]!.order.join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("shares the impostor role fairly, never the same player twice in a row", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const ids of [PLAYERS, [...PLAYERS, "efe"], [...PLAYERS, "efe", "femi", "gbenga"]]) {
        const done = playAll(setup(ids, { rounds: 8 }, seed));
        const impostors = done.rounds.map((r) => r.impostorId);
        expect(impostors).toHaveLength(8);
        for (let i = 1; i < impostors.length; i++) expect(impostors[i]).not.toBe(impostors[i - 1]);
        const counts = ids.map((id) => impostors.filter((x) => x === id).length);
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses each round's own word, in order", () => {
    const done = playAll(setup());
    expect(done.rounds.map((r) => r.word)).toEqual(SECRET_WORDS);
    // A shorter content list shortens the game rather than failing it.
    const short = impostorGame.setup({
      settings: SETTINGS,
      players: PLAYERS.map((id) => ({ id, nickname: id })),
      content: WORDS.slice(0, 2),
      seed: 3,
      now: T0,
    });
    expect(playAll(short).rounds).toHaveLength(2);
  });
});

describe("impostor views", () => {
  /** A state in every phase of round one, with the impostor caught, for the secrecy checks. */
  function everyPhase(): [string, ImpostorState][] {
    const role = setup();
    const clues = toClues(role);
    const midClues = act(clues, turnOf(clues), { type: "clue", text: "fruit" });
    const voting = giveClues(midClues);
    const impostor = impostorOf(voting);
    const someVotes = act(voting, crewOf(voting)[0]!, { type: "vote", playerId: impostor });
    const guessing = catchImpostor(voting);
    expect(guessing.phase).toBe("guess");
    return [
      ["role", role],
      ["clues", clues],
      ["clues after one", midClues],
      ["vote", voting],
      ["vote after one", someVotes],
      ["guess", guessing],
    ];
  }

  it("gives the crew the word and the impostor only the category", () => {
    for (const [phase, state] of everyPhase()) {
      const impostor = impostorOf(state);
      const view = viewOf(state, impostor);
      expect(view.role, phase).toBe("impostor");
      expect(view.word, phase).toBeNull();
      expect(view.category).toEqual({ id: "food", name: "Food" });
      // Until the last chance, the word isn't anywhere in what the impostor gets.
      if (phase !== "guess") expect(JSON.stringify(view), phase).not.toContain("Pineapple");
      for (const crew of crewOf(state)) {
        const crewView = viewOf(state, crew);
        expect(crewView.role, phase).toBe("crew");
        expect(crewView.word, phase).toBe("Pineapple");
      }
    }
  });

  it("never shows anyone else who the impostor is before the vote lands on them", () => {
    for (const [phase, state] of everyPhase()) {
      if (phase === "guess") continue;
      const [viewer, a, b] = crewOf(state);
      const impostor = impostorOf(state);
      // A crew member's view is the same whoever else the impostor is.
      const swapped = withRound(state, { impostorId: a! });
      expect(viewOf(swapped, viewer!), phase).toEqual(viewOf(state, viewer!));
      expect(viewOf(withRound(state, { impostorId: b! }), viewer!), phase).toEqual(
        viewOf(state, viewer!),
      );
      // And the impostor's is the same whatever the word is (but for the last chance's choices).
      const otherWord = withRound(state, {
        word: "Avocado",
        options: roundOf(state).options.map((o) => (o === "Pineapple" ? "Avocado" : o)),
      });
      expect(viewOf(otherWord, impostor), phase).toEqual(viewOf(state, impostor));
    }
  });

  it("only says who the impostor is once the vote has caught them", () => {
    const [, guessing] = everyPhase().find(([phase]) => phase === "guess")!;
    for (const id of PLAYERS) {
      const view = viewOf(guessing, id);
      expect(view.stage).toMatchObject({ kind: "guess", accusedId: impostorOf(guessing) });
      // Votes are still hidden: the reveal shows them.
      expect(JSON.stringify(view.stage)).not.toContain("voterId");
      expect(view.history).toEqual([]);
    }
    // The impostor gets the choices and nothing that marks the right one.
    const view = viewOf(guessing, impostorOf(guessing));
    expect(view.word).toBeNull();
    expect(view.stage).toMatchObject({ options: roundOf(guessing).options });
  });

  it("never shows anyone else's vote before the reveal", () => {
    const voting = giveClues(setup());
    const [first, second, third] = crewOf(voting);
    const impostor = impostorOf(voting);
    const one = act(voting, first!, { type: "vote", playerId: impostor });
    const other = act(voting, first!, { type: "vote", playerId: second! });
    for (const viewer of [second!, third!, impostor]) {
      expect(viewOf(one, viewer)).toEqual(viewOf(other, viewer));
      expect(viewOf(one, viewer).myVote).toBeNull();
      // Who has voted shows; for whom does not.
      expect(viewOf(one, viewer).stage).toMatchObject({ kind: "vote", voted: [first] });
    }
    expect(viewOf(one, first!).myVote).toBe(impostor);
    expect(viewOf(other, first!).myVote).toBe(second);
  });

  it("keeps the word and the impostor from players who aren't in the round", () => {
    const state = toClues(setup());
    const joined = impostorGame.onPlayerJoined(state, { id: "efe", nickname: "EFE" }, T0);
    const view = viewOf(joined, "efe");
    expect(view.stage).toEqual({ kind: "queued" });
    expect(view.role).toBeNull();
    expect(view.word).toBeNull();
    expect(viewOf(withRound(joined, { impostorId: crewOf(joined)[0]! }), "efe")).toEqual(view);
    // Someone who has left watches without either.
    const left = impostorGame.onPlayerLeft(state, crewOf(state)[0]!, T0 + IMPOSTOR_ROLE_MS + 10);
    const leftView = viewOf(left, crewOf(state)[0]!);
    expect(leftView.stage).toEqual({ kind: "watching" });
    expect(leftView.word).toBeNull();
    expect(leftView.role).toBeNull();
  });

  it("reveals the impostor, the word, the votes and the guess to everyone", () => {
    const voting = giveClues(setup());
    const impostor = impostorOf(voting);
    const guessing = catchImpostor(voting);
    const pick = roundOf(guessing).options.indexOf("Pineapple");
    const revealed = act(guessing, impostor, { type: "guess", choice: pick });
    expect(revealed.phase).toBe("reveal");
    for (const id of PLAYERS) {
      const view = viewOf(revealed, id);
      expect(view.word).toBe("Pineapple");
      expect(view.stage).toMatchObject({
        kind: "reveal",
        last: false,
        word: "Pineapple",
        impostorId: impostor,
        accusedId: impostor,
        outcome: "guessed",
        guess: "Pineapple",
        guessedRight: true,
        endsAt: revealed.phaseEndsAt,
      });
      const stage = view.stage as Extract<ImpostorView["stage"], { kind: "reveal" }>;
      expect(stage.votes).toHaveLength(4);
      expect(stage.tally[0]).toEqual({ playerId: impostor, votes: 3 });
      expect(stage.clues).toHaveLength(4);
      expect(view.history).toHaveLength(1);
    }
    // Someone outside the game watches, and the word is out by now.
    expect(viewOf(revealed, "nobody").stage).toEqual({ kind: "watching" });
    expect(viewOf(revealed, "nobody").word).toBe("Pineapple");
  });
});

describe("impostor clues", () => {
  it("takes turns in the seeded order, each on its own clock", () => {
    const state = toClues(setup());
    const round = roundOf(state);
    const start = T0 + IMPOSTOR_ROLE_MS;
    expect(state.phaseEndsAt).toBe(start + SETTINGS.clueSeconds * 1000);
    const [first, second] = round.order;
    expect(viewOf(state, second!).stage).toMatchObject({
      kind: "clues",
      order: round.order,
      turnPlayerId: first,
      turnIndex: 0,
      turnEndsAt: start + SETTINGS.clueSeconds * 1000,
      clues: [],
    });
    expect(rejection(state, second!, { type: "clue", text: "yellow" })).toBe("It's not your turn.");

    const at = start + 4000;
    const next = act(state, first!, { type: "clue", text: "  Tropical " }, at);
    // Typed clues show to everyone as they arrive, tidied.
    for (const id of PLAYERS) {
      expect(viewOf(next, id).stage).toMatchObject({
        kind: "clues",
        turnPlayerId: second,
        turnIndex: 1,
        turnEndsAt: at + SETTINGS.clueSeconds * 1000,
        clues: [{ playerId: first, text: "Tropical", status: "typed" }],
      });
    }
    expect(impostorGame.nextWakeAt(next)).toBe(at + SETTINGS.clueSeconds * 1000);
  });

  it("ends a turn without a clue when its time runs out", () => {
    const state = toClues(setup());
    const [first, second] = roundOf(state).order;
    const timedOut = tick(state, state.phaseEndsAt);
    expect(roundOf(timedOut).clues).toEqual([{ playerId: first, text: null, status: "missed" }]);
    expect(turnOf(timedOut)).toBe(second);
    expect(timedOut.phaseEndsAt).toBe(state.phaseEndsAt + SETTINGS.clueSeconds * 1000);
    // A wake long after catches up on every turn that ran out, then opens the vote.
    const late = tick(state, state.phaseEndsAt + 4 * SETTINGS.clueSeconds * 1000);
    expect(late.phase).toBe("vote");
    expect(roundOf(late).clues.map((c) => c.status)).toEqual([
      "missed",
      "missed",
      "missed",
      "missed",
    ]);
  });

  it("opens the vote once everyone has given a clue", () => {
    const voting = giveClues(setup());
    const lastClueAt = voting.phaseEndsAt - SETTINGS.voteSeconds * 1000;
    expect(voting.phaseEndsAt).toBe(lastClueAt + SETTINGS.voteSeconds * 1000);
    const view = viewOf(voting, PLAYERS[0]!);
    expect(view.stage).toMatchObject({ kind: "vote", voted: [] });
    const stage = view.stage as Extract<ImpostorView["stage"], { kind: "vote" }>;
    expect(stage.clues.map((c) => c.text)).toEqual(["hint0", "hint1", "hint2", "hint3"]);
    expect([...stage.candidates].sort()).toEqual([...PLAYERS].sort());
  });

  it("takes one word of up to 24 letters, and no repeats", () => {
    const state = toClues(setup());
    const first = turnOf(state);
    const clue = (text: string) => rejection(state, first, { type: "clue", text });
    expect(clue("")).toBe("Type a clue first.");
    expect(clue("   ")).toBe("Type a clue first.");
    expect(clue("two words")).toBe("Clues are one word.");
    expect(clue("a".repeat(IMPOSTOR_CLUE_MAX_LENGTH + 1))).toBe("Keep it to 24 characters.");
    expect(clue("<script>")).toBe("Clues are one word: letters and numbers only.");
    expect(clue("---")).toBe("Clues are one word: letters and numbers only.");
    expect(act(state, first, { type: "clue", text: "a".repeat(24) }).phase).toBe("clues");
    expect(act(state, first, { type: "clue", text: "ice-cold" }).phase).toBe("clues");
    expect(act(state, first, { type: "clue", text: "Café" }).phase).toBe("clues");

    const once = act(state, first, { type: "clue", text: "Sweet" });
    expect(rejection(once, turnOf(once), { type: "clue", text: "SWEET" })).toBe(
      "Someone already said that. Try another.",
    );
    expect(rejection(state, first, { type: "done" })).toBe("Type your clue.");
    expect(clueProblem("Juicy")).toBeNull();
  });

  it("stops the crew from saying the word, but never tells the impostor it's the word", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7]) {
      let state = toClues(setup(PLAYERS, {}, seed));
      const impostor = impostorOf(state);
      let n = 0;
      while (state.phase === "clues") {
        const who = turnOf(state);
        if (who === impostor) {
          state = act(state, who, { type: "clue", text: "Pineapple" });
          expect(roundOf(state).clues.at(-1)).toEqual({
            playerId: impostor,
            text: "Pineapple",
            status: "typed",
          });
          continue;
        }
        for (const text of ["pineapples", "PINEAPPLEs", "Pineápples"]) {
          expect(rejection(state, who, { type: "clue", text })).toBe(
            "That gives the word away. Try another clue.",
          );
        }
        state = act(state, who, { type: "clue", text: `pass${n++}` });
      }
    }
  });

  it("stops a crew member saying one of a two-word word's words", () => {
    const words = WORDS.map((w, i) => (i === 0 ? { ...w, word: "Ice cream" } : w));
    let state = toClues(
      impostorGame.setup({
        settings: SETTINGS,
        players: PLAYERS.map((id) => ({ id, nickname: id })),
        content: words,
        seed: 7,
        now: T0,
      }),
    );
    while (turnOf(state) === impostorOf(state)) {
      state = act(state, turnOf(state), { type: "clue", text: "hmm" });
    }
    expect(rejection(state, turnOf(state), { type: "clue", text: "cream" })).toBe(
      "That gives the word away. Try another clue.",
    );
    expect(rejection(state, turnOf(state), { type: "clue", text: "icecream" })).toBe(
      "That gives the word away. Try another clue.",
    );
    expect(act(state, turnOf(state), { type: "clue", text: "cold" }).phase).toBe("clues");
  });

  it("hands typed clues to the room for the blocked-words check", () => {
    expect(impostorGame.typedText?.({ type: "clue", text: "  Sweet " })).toBe("Sweet");
    expect(impostorGame.typedText?.({ type: "done" })).toBeNull();
    expect(impostorGame.typedText?.({ type: "vote", playerId: "ada" })).toBeNull();

    // In a room: only a running Impostor game's clue counts as typed text.
    const room = {
      ...createRoomState("ABC234", T0, { id: "impostor", settings: SETTINGS }),
      hostId: "ada",
      players: PLAYERS.map((id, i) => ({
        id,
        nickname: id,
        sessionToken: `t${i}`,
        joinedAt: T0,
        lastSeenAt: T0,
        account: null,
        guestId: null,
        avatar: null,
      })),
    };
    expect(typedTextOf(room, { type: "clue", text: "word" })).toBeNull();
    const started = startGame(room, "ada", new Set(PLAYERS), T0, 7, () => WORDS);
    if (!started.ok) throw new Error(started.error);
    expect(typedTextOf(started.state, { type: "clue", text: " Rude " })).toBe("Rude");
    expect(typedTextOf(started.state, { type: "clue" })).toBeNull();
    expect(typedTextOf(started.state, { type: "vote", playerId: "bola" })).toBeNull();
  });

  it("in spoken mode, highlights whose turn it is and moves on when they're done", () => {
    const state = toClues(setup(PLAYERS, { clues: "spoken" }));
    const [first, second] = roundOf(state).order;
    expect(viewOf(state, second!).clueMode).toBe("spoken");
    expect(viewOf(state, second!).stage).toMatchObject({ kind: "clues", turnPlayerId: first });
    expect(rejection(state, first!, { type: "clue", text: "yellow" })).toBe(
      "Say your clue out loud.",
    );
    expect(rejection(state, second!, { type: "done" })).toBe("It's not your turn.");
    const done = act(state, first!, { type: "done" });
    expect(roundOf(done).clues).toEqual([{ playerId: first, text: null, status: "spoken" }]);
    expect(turnOf(done)).toBe(second);
    // The timer ends a spoken turn too.
    const timedOut = tick(done, done.phaseEndsAt);
    expect(roundOf(timedOut).clues.at(-1)).toEqual({
      playerId: second,
      text: null,
      status: "missed",
    });
    expect(giveClues(timedOut).phase).toBe("vote");
  });

  it("refuses clues and votes out of their phase", () => {
    const role = setup();
    expect(rejection(role, turnOf(role), { type: "clue", text: "hello" }, T0 + 10)).toBe(
      "It's not time for clues.",
    );
    expect(rejection(role, "ada", { type: "vote", playerId: "bola" }, T0 + 10)).toBe(
      "It's not time to vote.",
    );
    expect(rejection(role, "ada", { type: "guess", choice: 0 }, T0 + 10)).toBe(
      "There's nothing to guess right now.",
    );
  });
});

describe("impostor votes", () => {
  it("can't vote for yourself or someone outside the round, and can change your mind", () => {
    const voting = giveClues(setup());
    const [a, b, c] = crewOf(voting);
    expect(rejection(voting, a!, { type: "vote", playerId: a! })).toBe(
      "You can't vote for yourself.",
    );
    expect(rejection(voting, a!, { type: "vote", playerId: "nobody" })).toBe(
      "They're not in this round.",
    );
    const changed = vote(voting, { [a!]: b!, [b!]: c! });
    const again = act(changed, a!, { type: "vote", playerId: c! });
    expect(roundOf(again).votes).toHaveLength(2);
    expect(viewOf(again, a!).myVote).toBe(c);
    expect(again.phase).toBe("vote");
  });

  it("closes as soon as everyone has voted, or when time runs out", () => {
    const voting = giveClues(setup());
    const caught = catchImpostor(voting);
    expect(caught.phase).toBe("guess");
    expect(caught.phaseEndsAt).toBe(voting.phaseEndsAt - 1000 + IMPOSTOR_GUESS_MS);

    const [a] = crewOf(voting);
    const one = act(voting, a!, { type: "vote", playerId: impostorOf(voting) });
    const timedOut = tick(one, one.phaseEndsAt);
    // One vote is still the most votes: the impostor is caught.
    expect(timedOut.phase).toBe("guess");
    expect(roundOf(timedOut).accusedId).toBe(impostorOf(voting));
  });

  it("lets the impostor escape on a tie, with nobody accused", () => {
    const voting = giveClues(setup());
    const impostor = impostorOf(voting);
    const [a, b, c] = crewOf(voting);
    const tied = vote(voting, { [a!]: impostor, [b!]: impostor, [c!]: a!, [impostor]: a! });
    expect(tied.phase).toBe("reveal");
    const round = roundOf(tied);
    expect(round.accusedId).toBeNull();
    expect(round.outcome).toBe("escaped");
    // Crew who voted for the impostor still score; so does the impostor, for escaping.
    expect(round.points).toEqual({
      [a!]: CREW_VOTE_POINTS,
      [b!]: CREW_VOTE_POINTS,
      [c!]: 0,
      [impostor]: IMPOSTOR_ESCAPE_POINTS,
    });
  });

  it("lets the impostor escape when nobody votes, or the vote lands on someone else", () => {
    const voting = giveClues(setup());
    const silent = tick(voting, voting.phaseEndsAt);
    expect(roundOf(silent).outcome).toBe("escaped");
    expect(roundOf(silent).points[impostorOf(voting)]).toBe(IMPOSTOR_ESCAPE_POINTS);

    const impostor = impostorOf(voting);
    const [a, b, c] = crewOf(voting);
    const wrong = vote(voting, { [a!]: b!, [b!]: c!, [c!]: b!, [impostor]: b! });
    expect(roundOf(wrong).accusedId).toBe(b);
    expect(roundOf(wrong).outcome).toBe("escaped");
    expect(viewOf(wrong, a!).stage).toMatchObject({
      kind: "reveal",
      accusedId: b,
      impostorId: impostor,
      outcome: "escaped",
      guess: null,
      guessedRight: false,
    });
  });
});

describe("impostor last chance", () => {
  it("lets the caught impostor pick the word from eight", () => {
    const guessing = catchImpostor(giveClues(setup()));
    const impostor = impostorOf(guessing);
    const [a] = crewOf(guessing);
    expect(rejection(guessing, a!, { type: "guess", choice: 0 })).toBe(
      "There's nothing to guess right now.",
    );
    expect(rejection(guessing, impostor, { type: "guess", choice: 8 })).toBe(
      "That isn't one of the choices.",
    );
    expect(rejection(guessing, impostor, { type: "guess", choice: -1 })).toBe(
      "That isn't one of the choices.",
    );
    const options = roundOf(guessing).options;
    const right = act(guessing, impostor, { type: "guess", choice: options.indexOf("Pineapple") });
    expect(roundOf(right).outcome).toBe("guessed");
    expect(roundOf(right).points[impostor]).toBe(IMPOSTOR_GUESS_POINTS);
    expect(viewOf(right, impostor).myGuess).toBe(options.indexOf("Pineapple"));

    const wrongPick = options.findIndex((o) => o !== "Pineapple");
    const wrong = act(guessing, impostor, { type: "guess", choice: wrongPick });
    expect(roundOf(wrong).outcome).toBe("caught");
    expect(roundOf(wrong).points[impostor]).toBe(0);
    expect(viewOf(wrong, a!).stage).toMatchObject({
      kind: "reveal",
      guess: options[wrongPick],
      guessedRight: false,
      outcome: "caught",
    });
  });

  it("counts running out of time as a miss", () => {
    const guessing = catchImpostor(giveClues(setup()));
    const missed = tick(guessing, guessing.phaseEndsAt);
    expect(missed.phase).toBe("reveal");
    expect(roundOf(missed).outcome).toBe("caught");
    expect(roundOf(missed).guess).toBeNull();
    expect(missed.phaseEndsAt).toBe(guessing.phaseEndsAt + IMPOSTOR_REVEAL_MS);
  });
});

describe("impostor scoring and the end", () => {
  it("scores the crew who voted right, and adds the rounds up", () => {
    // Round one: caught, no guess. Every crew member voted right.
    const caught = tick(catchImpostor(giveClues(setup(PLAYERS, { rounds: 3 }))), T0 + 600_000);
    const first = caught.rounds[0]!;
    for (const id of PLAYERS) {
      expect(first.points[id]).toBe(id === first.impostorId ? 0 : CREW_VOTE_POINTS);
    }
    // A wake long after plays the other rounds out on their timers: nobody acts, the impostor
    // escapes each time.
    expect(caught.finishedAt).not.toBeNull();
    expect(caught.rounds).toHaveLength(3);
    expect(caught.rounds.slice(1).every((r) => r.outcome === "escaped")).toBe(true);
    const standings = viewOf(caught, "ada").standings;
    const total = (id: string) => caught.rounds.reduce((sum, r) => sum + (r.points[id] ?? 0), 0);
    for (const row of standings) expect(row.points).toBe(total(row.playerId));
    expect(standings.reduce((sum, row) => sum + row.points, 0)).toBe(
      3 * CREW_VOTE_POINTS + 2 * IMPOSTOR_ESCAPE_POINTS,
    );
  });

  it("moves from the reveal to the next round, and finishes after the last", () => {
    const s = catchImpostor(giveClues(setup(PLAYERS, { rounds: 3 })));
    const reveal = tick(s, s.phaseEndsAt);
    expect(reveal.phase).toBe("reveal");
    const next = tick(reveal, reveal.phaseEndsAt);
    expect(next.phase).toBe("role");
    expect(roundOf(next).index).toBe(1);
    expect(next.phaseEndsAt).toBe(reveal.phaseEndsAt + IMPOSTOR_ROLE_MS);
    expect(viewOf(next, "ada").history).toHaveLength(1);

    const done = playAll(next);
    expect(impostorGame.isFinished(done)).toBe(true);
    expect(impostorGame.nextWakeAt(done)).toBeNull();
    expect(viewOf(done, "ada").stage).toEqual({ kind: "done", endedEarly: false });
    expect(viewOf(done, "ada").final).toBe(true);
    expect(rejection(done, "ada", { type: "done" })).toBe("The game is over.");
  });

  it("marks the last round's reveal", () => {
    let s = setup(PLAYERS, { rounds: 3 });
    for (let round = 0; round < 3; round++) {
      s = catchImpostor(giveClues(s));
      s = tick(s, s.phaseEndsAt);
      expect(s.phase).toBe("reveal");
      expect(viewOf(s, "ada").stage).toMatchObject({ kind: "reveal", last: round === 2 });
      s = tick(s, s.phaseEndsAt);
    }
    expect(impostorGame.isFinished(s)).toBe(true);
  });

  it("summarizes points, correct votes and placings, sharing equal places", () => {
    const done = playAll(setup());
    const summary = impostorGame.summarize(done);
    expect(summary).toMatchObject({
      category: "mixed",
      difficulty: null,
      mode: null,
      rounds: 8,
    });
    expect(summary.players).toHaveLength(4);
    // The vote always caught the impostor, who never guessed: every round paid each crew
    // member, and with two impostor turns each everyone ends level.
    for (const p of summary.players) {
      expect(p.score).toBe(6 * CREW_VOTE_POINTS);
      expect(p.correct).toBe(6);
      expect(p.placing).toBe(1);
    }
    const standings = viewOf(done, "ada").standings;
    expect(standings.every((s) => s.impostorRounds === 2 && s.escapes === 0)).toBe(true);
  });

  it("ranks by points, with the leavers last", () => {
    let s = giveClues(setup([...PLAYERS, "efe"], { rounds: 3 }));
    const impostor = impostorOf(s);
    const [a, b, c, d] = crewOf(s);
    // Two votes each for the impostor and for c: a tie, so the impostor escapes.
    s = vote(s, { [a!]: impostor, [b!]: impostor, [c!]: d!, [d!]: c!, [impostor]: c! });
    expect(roundOf(s).outcome).toBe("escaped");
    s = impostorGame.onPlayerLeft(s, a!, s.phaseEndsAt - 10);
    const standings = viewOf(s, b!).standings;
    expect(standings[0]).toMatchObject({
      playerId: impostor,
      rank: 1,
      points: IMPOSTOR_ESCAPE_POINTS,
    });
    expect(standings[1]).toMatchObject({ playerId: b, rank: 2, points: CREW_VOTE_POINTS });
    expect(standings.at(-1)).toMatchObject({ playerId: a, left: true, points: CREW_VOTE_POINTS });
    const rest = standings.filter((r) => r.playerId === c || r.playerId === d);
    expect(rest.every((r) => r.rank === 3 && r.points === 0)).toBe(true);

    const done = playAll(tick(s, s.phaseEndsAt));
    const summary = impostorGame.summarize(done);
    expect(summary.players.map((p) => p.playerId)).not.toContain(a);
    expect(summary.players).toHaveLength(4);
  });
});

describe("impostor leaving and joining", () => {
  it("ends the round as a crew win when the impostor leaves", () => {
    const clues = toClues(setup([...PLAYERS, "efe"]));
    const impostor = impostorOf(clues);
    const at = clues.phaseEndsAt - 5000;
    const left = impostorGame.onPlayerLeft(clues, impostor, at);
    expect(left.phase).toBe("reveal");
    expect(left.phaseEndsAt).toBe(at + IMPOSTOR_REVEAL_MS);
    expect(roundOf(left).outcome).toBe("left");
    expect(Object.values(roundOf(left).points).every((p) => p === 0)).toBe(true);
    const crew = crewOf(clues)[0]!;
    expect(viewOf(left, crew).stage).toMatchObject({
      kind: "reveal",
      impostorId: impostor,
      outcome: "left",
      word: "Pineapple",
    });
    // And the game moves on with everyone else.
    const next = tick(left, left.phaseEndsAt);
    expect(next.phase).toBe("role");
    expect(roundOf(next).order).not.toContain(impostor);
    expect(roundOf(next).order).toHaveLength(4);
  });

  it("ends the round when the impostor leaves during the vote or the last chance", () => {
    const voting = giveClues(setup([...PLAYERS, "efe"]));
    expect(roundOf(impostorGame.onPlayerLeft(voting, impostorOf(voting), T0)).outcome).toBe("left");
    const guessing = catchImpostor(voting);
    expect(guessing.phase).toBe("guess");
    expect(roundOf(impostorGame.onPlayerLeft(guessing, impostorOf(guessing), T0)).outcome).toBe(
      "left",
    );
  });

  it("skips the turn of a clue-giver who leaves", () => {
    const state = toClues(setup([...PLAYERS, "efe"]));
    const [first, second, third] = roundOf(state).order;
    const impostor = impostorOf(state);
    const leaver = first === impostor ? second! : first!;
    let s = state;
    if (first === impostor) s = act(s, first, { type: "clue", text: "hmm" });
    const at = s.phaseEndsAt - 3000;
    const left = impostorGame.onPlayerLeft(s, leaver, at);
    expect(roundOf(left).clues.at(-1)).toEqual({ playerId: leaver, text: null, status: "skipped" });
    expect(turnOf(left)).toBe(first === impostor ? third : second);
    expect(left.phaseEndsAt).toBe(at + SETTINGS.clueSeconds * 1000);
  });

  it("skips a later turn of someone who has gone, and leaves them out of the vote", () => {
    const state = toClues(setup([...PLAYERS, "efe"]));
    const order = roundOf(state).order;
    const later = order.slice(1).find((id) => id !== impostorOf(state))!;
    const left = impostorGame.onPlayerLeft(state, later, T0 + IMPOSTOR_ROLE_MS + 10);
    expect(turnOf(left)).toBe(order[0]);
    const voting = giveClues(left);
    const clue = roundOf(voting).clues.find((c) => c.playerId === later);
    expect(clue).toEqual({ playerId: later, text: null, status: "skipped" });
    const stage = viewOf(voting, order[0]!).stage as Extract<
      ImpostorView["stage"],
      { kind: "vote" }
    >;
    expect(stage.candidates).not.toContain(later);
    expect(
      rejection(voting, order[0] === later ? order[1]! : order[0]!, {
        type: "vote",
        playerId: later,
      }),
    ).toBe("They're not in this round.");
  });

  it("closes the vote when the last one still to vote leaves", () => {
    const voting = giveClues(setup([...PLAYERS, "efe"]));
    const impostor = impostorOf(voting);
    const [a, b, c, d] = crewOf(voting);
    const almost = vote(voting, { [a!]: impostor, [b!]: impostor, [c!]: impostor, [impostor]: a! });
    expect(almost.phase).toBe("vote");
    const left = impostorGame.onPlayerLeft(almost, d!, almost.phaseEndsAt - 100);
    expect(left.phase).toBe("guess");
  });

  it("brings late joiners in from the next round", () => {
    const state = toClues(setup());
    const joined = impostorGame.onPlayerJoined(state, { id: "efe", nickname: "EFE" }, T0);
    expect(rejection(joined, "efe", { type: "vote", playerId: "ada" })).toBe(
      "You're in from the next round.",
    );
    expect(roundOf(joined).order).not.toContain("efe");
    const voting = giveClues(joined);
    // The round's vote doesn't wait for them.
    const caught = catchImpostor(voting);
    expect(caught.phase).toBe("guess");
    const reveal = tick(caught, caught.phaseEndsAt);
    // They see the reveal with everyone.
    expect(viewOf(reveal, "efe").stage).toMatchObject({ kind: "reveal" });
    const next = tick(reveal, reveal.phaseEndsAt);
    expect(roundOf(next).order).toContain("efe");
    expect(viewOf(next, "efe").role).not.toBeNull();
    // Joining twice changes nothing.
    expect(impostorGame.onPlayerJoined(joined, { id: "efe", nickname: "EFE" }, T0)).toEqual(joined);
  });

  it("lets someone who left come back into the round they started", () => {
    const state = toClues(setup([...PLAYERS, "efe"]));
    const crew = crewOf(state).at(-1)!;
    const left = impostorGame.onPlayerLeft(state, crew, T0 + IMPOSTOR_ROLE_MS + 10);
    expect(viewOf(left, crew).stage).toEqual({ kind: "watching" });
    const back = impostorGame.onPlayerJoined(left, { id: crew, nickname: "BACK" }, T0);
    expect(viewOf(back, crew).role).toBe("crew");
    expect(viewOf(back, crew).word).toBe("Pineapple");
  });

  it("ends the game when fewer than three are left", () => {
    const state = toClues(setup());
    const [a, b] = crewOf(state);
    const one = impostorGame.onPlayerLeft(state, a!, T0 + IMPOSTOR_ROLE_MS + 10);
    expect(impostorGame.isFinished(one)).toBe(false);
    const two = impostorGame.onPlayerLeft(one, b!, T0 + IMPOSTOR_ROLE_MS + 20);
    expect(impostorGame.isFinished(two)).toBe(true);
    expect(two.endedEarly).toBe(true);
    expect(impostorGame.nextWakeAt(two)).toBeNull();
    const remaining = PLAYERS.find((id) => id !== a && id !== b && id !== impostorOf(state))!;
    expect(viewOf(two, remaining).stage).toEqual({ kind: "done", endedEarly: true });
    // The unfinished round is left out of the summary.
    const summary = impostorGame.summarize(two);
    expect(summary.rounds).toBe(0);
    expect(summary.players.map((p) => p.playerId).sort()).toEqual(
      [remaining, impostorOf(state)].sort(),
    );
    // Leaving after the end changes nothing.
    expect(impostorGame.onPlayerLeft(two, remaining, T0 + 99_999)).toBe(two);
  });

  it("ends the game when the impostor's leaving takes it below three", () => {
    const state = toClues(setup());
    const [a] = crewOf(state);
    const one = impostorGame.onPlayerLeft(state, a!, T0 + IMPOSTOR_ROLE_MS + 10);
    const two = impostorGame.onPlayerLeft(one, impostorOf(state), T0 + IMPOSTOR_ROLE_MS + 20);
    expect(two.finishedAt).not.toBeNull();
    expect(two.endedEarly).toBe(true);
  });
});
