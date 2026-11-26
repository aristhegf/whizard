import { describe, expect, it } from "vitest";
import { gameModule, isGameId } from "../registry";
import {
  MOST_LIKELY_TO_COUNTDOWN_MS,
  MOST_LIKELY_TO_READ_POINTS,
  MOST_LIKELY_TO_REVEAL_MS,
  mostLikelyToGame,
  type MostLikelyToState,
  type MostLikelyToView,
} from "./mostLikelyTo";
import {
  DEFAULT_MOST_LIKELY_TO_SETTINGS,
  mostLikelyToSettingsSchema,
  type MostLikelyToPrompt,
  type MostLikelyToSettings,
} from "./settings";

const T0 = 1_000_000;
const SETTINGS: MostLikelyToSettings = {
  rounds: 5,
  voteSeconds: 20,
  pack: "classic",
  anonymousVotes: false,
};
const VOTE_MS = SETTINGS.voteSeconds * 1000;

const PROMPTS: MostLikelyToPrompt[] = Array.from({ length: 15 }, (_, i) => ({
  id: `mlt-classic-${String(i + 1).padStart(3, "0")}`,
  pack: "classic",
  text: `do thing number ${i + 1}`,
}));

function setup(
  ids: string[] = ["ada", "bo", "cy"],
  settings: MostLikelyToSettings = SETTINGS,
  content: unknown[] = PROMPTS,
): MostLikelyToState {
  return mostLikelyToGame.setup({
    settings,
    players: ids.map((id) => ({ id, nickname: id.toUpperCase() })),
    content,
    seed: 7,
    now: T0,
  });
}

const tick = (state: MostLikelyToState, now: number) => mostLikelyToGame.tick(state, now);

/** A vote, as the room runs it: a tick first, then the action, throwing on a rejection. */
function vote(state: MostLikelyToState, voter: string, target: string, now?: number) {
  const at = now ?? state.voteStartsAt + 1000;
  const result = mostLikelyToGame.onAction(tick(state, at), voter, { type: "vote", target }, at);
  if ("rejected" in result) throw new Error(result.rejected);
  return result;
}

function rejection(state: MostLikelyToState, voter: string, target: string, now?: number) {
  const at = now ?? state.voteStartsAt + 1000;
  const result = mostLikelyToGame.onAction(tick(state, at), voter, { type: "vote", target }, at);
  return "rejected" in result ? result.rejected : null;
}

const viewOf = (state: MostLikelyToState, playerId: string): MostLikelyToView =>
  mostLikelyToGame.viewFor(state, playerId);

/** Through the countdown to the first open vote. */
const toVote = (state: MostLikelyToState) => tick(state, state.voteStartsAt);

/** Casts these votes in order; the round closes early once everyone has voted. */
function castAll(state: MostLikelyToState, votes: Record<string, string>): MostLikelyToState {
  let s = state;
  for (const [voter, target] of Object.entries(votes)) s = vote(s, voter, target);
  return s;
}

/** From the reveal to the next round's open vote (or the end). */
const nextRound = (state: MostLikelyToState) => tick(state, state.revealEndsAt!);

describe("most likely to: settings and registration", () => {
  it("is registered as most-likely-to, for 3 to 20 players", () => {
    expect(isGameId("most-likely-to")).toBe(true);
    expect(gameModule("most-likely-to").id).toBe("most-likely-to");
    expect(mostLikelyToGame.minPlayers).toBe(3);
    expect(mostLikelyToGame.maxPlayers).toBe(20);
  });

  it("defaults to 10 Classic rounds, 20 seconds to vote, names shown", () => {
    expect(DEFAULT_MOST_LIKELY_TO_SETTINGS).toEqual({
      rounds: 10,
      voteSeconds: 20,
      pack: "classic",
      anonymousVotes: false,
    });
    expect(mostLikelyToSettingsSchema.parse(DEFAULT_MOST_LIKELY_TO_SETTINGS)).toEqual(
      DEFAULT_MOST_LIKELY_TO_SETTINGS,
    );
    expect(mostLikelyToGame.defaultSettings).toBe(DEFAULT_MOST_LIKELY_TO_SETTINGS);
  });

  it("takes only the offered choices", () => {
    const ok = (s: object) => mostLikelyToSettingsSchema.safeParse(s).success;
    for (const rounds of [5, 10, 15]) expect(ok({ ...SETTINGS, rounds })).toBe(true);
    for (const voteSeconds of [10, 15, 20, 30]) expect(ok({ ...SETTINGS, voteSeconds })).toBe(true);
    for (const pack of ["classic", "family", "work", "couples"]) {
      expect(ok({ ...SETTINGS, pack })).toBe(true);
    }
    expect(ok({ ...SETTINGS, anonymousVotes: true })).toBe(true);

    expect(ok({ ...SETTINGS, rounds: 7 })).toBe(false);
    expect(ok({ ...SETTINGS, rounds: "10" })).toBe(false);
    expect(ok({ ...SETTINGS, voteSeconds: 25 })).toBe(false);
    expect(ok({ ...SETTINGS, pack: "spicy" })).toBe(false);
    expect(ok({ ...SETTINGS, anonymousVotes: "yes" })).toBe(false);
    expect(ok({ rounds: 10, voteSeconds: 20, anonymousVotes: false })).toBe(false);
  });

  it("asks the content bank for one prompt per round from the pack", () => {
    expect(mostLikelyToGame.contentNeeded({ ...SETTINGS, pack: "work", rounds: 15 }, 4)).toEqual({
      kind: "most-likely-to-prompts",
      pack: "work",
      count: 15,
    });
  });

  it("only accepts vote actions with a target", () => {
    const parse = (a: unknown) => mostLikelyToGame.actionSchema.safeParse(a).success;
    expect(parse({ type: "vote", target: "ada" })).toBe(true);
    expect(parse({ type: "vote" })).toBe(false);
    expect(parse({ type: "vote", target: "" })).toBe(false);
    expect(parse({ type: "answer", choice: 1 })).toBe(false);
  });
});

describe("most likely to: setup", () => {
  it("starts on a countdown with one prompt per round, in the order drawn", () => {
    const state = setup();
    expect(state.phase).toBe("countdown");
    expect(state.voteStartsAt).toBe(T0 + MOST_LIKELY_TO_COUNTDOWN_MS);
    expect(state.voteEndsAt).toBe(T0 + MOST_LIKELY_TO_COUNTDOWN_MS + VOTE_MS);
    expect(state.prompts).toEqual(PROMPTS.slice(0, 5));
    expect(mostLikelyToGame.nextWakeAt(state)).toBe(state.voteStartsAt);

    const view = viewOf(state, "ada");
    expect(view.stage).toEqual({ kind: "countdown", round: 0, startsAt: state.voteStartsAt });
    expect(view.status).toBe("playing");
    expect(view.canVote).toBe(false);
    expect(view.rounds).toBe(5);
    expect(view.voteMs).toBe(VOTE_MS);
    // The countdown never shows a prompt, and no view ever lists the prompts to come.
    expect(JSON.stringify(view)).not.toContain("do thing");
  });

  it("drops repeated or malformed prompts and plays fewer rounds if the pack ran short", () => {
    const content = [PROMPTS[0], PROMPTS[0], null, { id: 3 }, PROMPTS[1], PROMPTS[2]];
    const state = setup(undefined, SETTINGS, content);
    expect(state.prompts.map((p) => p.id)).toEqual([
      PROMPTS[0]!.id,
      PROMPTS[1]!.id,
      PROMPTS[2]!.id,
    ]);
    expect(viewOf(state, "ada").rounds).toBe(3);
  });

  it("has nothing to play without prompts", () => {
    expect(mostLikelyToGame.isFinished(setup(undefined, SETTINGS, []))).toBe(true);
  });
});

describe("most likely to: voting", () => {
  it("opens the vote after the countdown and refuses votes before it", () => {
    const state = setup();
    expect(rejection(state, "ada", "bo", T0 + 100)).toBe("The vote hasn't opened yet.");
    const open = toVote(state);
    expect(open.phase).toBe("vote");
    expect(mostLikelyToGame.nextWakeAt(open)).toBe(open.voteEndsAt);
    const view = viewOf(open, "ada");
    expect(view.canVote).toBe(true);
    expect(view.stage).toMatchObject({
      kind: "vote",
      round: 0,
      prompt: PROMPTS[0],
      startsAt: open.voteStartsAt,
      deadline: open.voteEndsAt,
      voted: [],
      voters: 3,
      candidates: [
        { playerId: "ada", nickname: "ADA" },
        { playerId: "bo", nickname: "BO" },
        { playerId: "cy", nickname: "CY" },
      ],
    });
  });

  it("records a vote, allows voting for yourself, and allows one vote each", () => {
    let s = toVote(setup());
    s = vote(s, "ada", "ada");
    expect(s.votes).toEqual({ ada: "ada" });
    expect(viewOf(s, "ada").myVote).toBe("ada");
    expect(viewOf(s, "ada").canVote).toBe(false);
    expect(rejection(s, "ada", "bo")).toBe("You've already voted.");
  });

  it("refuses votes for someone not in the game, or from someone not in it", () => {
    const s = toVote(setup());
    expect(rejection(s, "ada", "zed")).toBe("You can only vote for someone playing this round.");
    expect(rejection(s, "zed", "ada")).toBe("You're watching this game.");
  });

  it("closes early once everyone has voted", () => {
    let s = toVote(setup());
    const at = s.voteStartsAt + 2000;
    s = vote(s, "ada", "bo", at);
    s = vote(s, "bo", "cy", at);
    expect(s.phase).toBe("vote");
    s = vote(s, "cy", "bo", at);
    expect(s.phase).toBe("reveal");
    expect(s.revealEndsAt).toBe(at + MOST_LIKELY_TO_REVEAL_MS);
    expect(mostLikelyToGame.nextWakeAt(s)).toBe(s.revealEndsAt);
    expect(rejection(s, "ada", "bo", at + 10)).toBe("That vote is over.");
  });

  it("closes on time with the votes it has", () => {
    let s = toVote(setup());
    s = vote(s, "ada", "bo");
    expect(tick(s, s.voteEndsAt - 1).phase).toBe("vote");
    s = tick(s, s.voteEndsAt);
    expect(s.phase).toBe("reveal");
    expect(s.results[0]).toMatchObject({
      votes: [{ voterId: "ada", targetId: "bo" }],
      winners: ["bo"],
      readers: ["ada"],
    });
  });
});

describe("most likely to: the reveal", () => {
  it("shows the tally, the winner, who voted for whom and who scored", () => {
    const s = castAll(toVote(setup()), { ada: "bo", bo: "cy", cy: "bo" });
    const view = viewOf(s, "cy");
    expect(view.stage).toEqual({
      kind: "reveal",
      round: 0,
      prompt: PROMPTS[0],
      endsAt: s.revealEndsAt,
      tally: [
        { playerId: "bo", nickname: "BO", votes: 2, voters: ["ada", "cy"], winner: true },
        { playerId: "cy", nickname: "CY", votes: 1, voters: ["bo"], winner: false },
        { playerId: "ada", nickname: "ADA", votes: 0, voters: [], winner: false },
      ],
      winners: ["bo"],
      topVotes: 2,
      totalVotes: 3,
      readers: ["ada", "cy"],
    });
    expect(view.myVote).toBe("bo");
    expect(view.myPoints).toBe(MOST_LIKELY_TO_READ_POINTS);
    expect(viewOf(s, "bo").myPoints).toBe(0);
    expect(view.history).toEqual([
      {
        round: 0,
        prompt: PROMPTS[0],
        winners: [{ playerId: "bo", nickname: "BO" }],
        topVotes: 2,
        totalVotes: 3,
      },
    ]);
  });

  it("crowns every player on a tie, and everyone who voted for one of them scores", () => {
    const s = castAll(toVote(setup(["ada", "bo", "cy", "di"])), {
      ada: "bo",
      bo: "cy",
      cy: "bo",
      di: "cy",
    });
    expect(s.results[0]!.winners).toEqual(["bo", "cy"]);
    expect(s.results[0]!.readers).toEqual(["ada", "bo", "cy", "di"]);
    const stage = viewOf(s, "ada").stage;
    expect(stage.kind === "reveal" && stage.tally.filter((t) => t.winner)).toHaveLength(2);
  });

  it("crowns nobody when nobody voted", () => {
    const s = tick(toVote(setup()), setup().voteEndsAt);
    expect(s.results[0]).toMatchObject({ votes: [], winners: [], readers: [] });
    const stage = viewOf(s, "ada").stage;
    expect(stage).toMatchObject({ kind: "reveal", winners: [], topVotes: 0, totalVotes: 0 });
    expect(viewOf(s, "ada").myPoints).toBe(0);
  });

  it("hides who voted for whom when votes are anonymous", () => {
    const anon = { ...SETTINGS, anonymousVotes: true };
    const s = castAll(toVote(setup(undefined, anon)), { ada: "bo", bo: "cy", cy: "bo" });
    const view = viewOf(s, "ada");
    expect(view.anonymousVotes).toBe(true);
    expect(view.stage).toMatchObject({
      kind: "reveal",
      winners: ["bo"],
      topVotes: 2,
      totalVotes: 3,
      readers: null,
    });
    const stage = view.stage;
    if (stage.kind !== "reveal") throw new Error("not the reveal");
    expect(stage.tally.map((t) => [t.playerId, t.votes, t.voters])).toEqual([
      ["bo", 2, null],
      ["cy", 1, null],
      ["ada", 0, null],
    ]);
    // Each player still sees their own vote and what it scored.
    expect(view.myVote).toBe("bo");
    expect(view.myPoints).toBe(MOST_LIKELY_TO_READ_POINTS);
    expect(viewOf(s, "bo").myVote).toBe("cy");
    // Nothing in another player's view names who voted for whom.
    const json = JSON.stringify(viewOf(s, "cy"));
    expect(json).not.toContain("voterId");
    expect(json).not.toContain("targetId");
  });

  it("moves to the next prompt after the reveal, and ends after the last", () => {
    let s = castAll(toVote(setup()), { ada: "bo", bo: "bo", cy: "bo" });
    expect(tick(s, s.revealEndsAt! - 1).phase).toBe("reveal");
    const revealEnd = s.revealEndsAt!;
    s = nextRound(s);
    expect(s).toMatchObject({ phase: "vote", round: 1, votes: {}, voteStartsAt: revealEnd });
    expect(s.voteEndsAt).toBe(revealEnd + VOTE_MS);
    expect(viewOf(s, "ada").stage).toMatchObject({ kind: "vote", prompt: PROMPTS[1] });
    for (let round = 1; round < 5; round++) {
      s = nextRound(castAll(s, { ada: "cy", bo: "cy", cy: "cy" }));
    }
    expect(mostLikelyToGame.isFinished(s)).toBe(true);
    expect(mostLikelyToGame.nextWakeAt(s)).toBeNull();
    expect(viewOf(s, "ada")).toMatchObject({ stage: { kind: "done" }, final: true });
    expect(viewOf(s, "ada").history).toHaveLength(5);
    expect(rejection(s, "ada", "bo")).toBe("The game is over.");
  });
});

describe("most likely to: no leaks before the reveal", () => {
  it("shows only who has voted, never who for", () => {
    const open = toVote(setup());
    const forBo = vote(open, "ada", "bo");
    const forCy = vote(open, "ada", "cy");
    // Bo and Cy see exactly the same thing whichever way Ada voted.
    for (const watcher of ["bo", "cy"]) {
      expect(viewOf(forBo, watcher)).toEqual(viewOf(forCy, watcher));
    }
    const view = viewOf(forBo, "bo");
    expect(view.stage).toMatchObject({ kind: "vote", voted: ["ada"] });
    expect(view.myVote).toBeNull();
    expect(JSON.stringify(view)).not.toContain('votes":{');

    // Two votes in, the third still sees no difference between them.
    const a = vote(vote(open, "ada", "bo"), "bo", "ada");
    const b = vote(vote(open, "ada", "cy"), "bo", "bo");
    expect(viewOf(a, "cy")).toEqual(viewOf(b, "cy"));
    // A spectator outside the game sees no more.
    expect(viewOf(a, "zed")).toEqual(viewOf(b, "zed"));
    expect(viewOf(a, "zed")).toMatchObject({ status: "watching", canVote: false, myVote: null });
  });

  it("never puts a vote in the standings before the reveal", () => {
    const s = vote(toVote(setup()), "ada", "bo");
    for (const row of viewOf(s, "cy").standings) {
      expect(row).toMatchObject({ points: 0, votesReceived: 0, voted: 0 });
    }
  });
});

describe("most likely to: leaving and joining", () => {
  it("drops votes for a player who leaves, so those voters can vote again", () => {
    let s = toVote(setup(["ada", "bo", "cy", "di"]));
    s = vote(s, "ada", "bo");
    s = vote(s, "cy", "bo");
    s = vote(s, "bo", "di");
    s = mostLikelyToGame.onPlayerLeft(s, "bo", s.voteStartsAt + 2000);
    expect(s.phase).toBe("vote");
    // Bo's own vote went with them, and the votes for Bo are gone.
    expect(s.votes).toEqual({});
    const view = viewOf(s, "ada");
    expect(view.canVote).toBe(true);
    expect(view.stage).toMatchObject({ kind: "vote", voters: 3, voted: [] });
    expect(view.stage.kind === "vote" && view.stage.candidates.map((c) => c.playerId)).toEqual([
      "ada",
      "cy",
      "di",
    ]);
    expect(rejection(s, "ada", "bo")).toBe("You can only vote for someone playing this round.");
    expect(rejection(s, "bo", "ada")).toBe("You're watching this game.");
    expect(viewOf(s, "bo")).toMatchObject({ status: "left", canVote: false });
    s = castAll(s, { ada: "cy", cy: "cy", di: "ada" });
    expect(s.results[0]).toMatchObject({ candidates: ["ada", "cy", "di"], winners: ["cy"] });
  });

  it("closes the vote when the last player who hadn't voted leaves", () => {
    let s = toVote(setup(["ada", "bo", "cy", "di"]));
    s = castAll(s, { ada: "bo", bo: "cy", cy: "bo" });
    expect(s.phase).toBe("vote");
    s = mostLikelyToGame.onPlayerLeft(s, "di", s.voteStartsAt + 3000);
    expect(s.phase).toBe("reveal");
    expect(s.results[0]!.winners).toEqual(["bo"]);
  });

  it("keeps a revealed round as counted when someone leaves during the reveal", () => {
    let s = castAll(toVote(setup()), { ada: "bo", bo: "bo", cy: "ada" });
    s = mostLikelyToGame.onPlayerLeft(s, "bo", s.revealEndsAt! - 100);
    expect(s.results[0]).toMatchObject({ winners: ["bo"], readers: ["ada", "bo"] });
    s = nextRound(s);
    expect(viewOf(s, "ada").stage).toMatchObject({ kind: "vote", voters: 2 });
  });

  it("ends the game when everyone has left", () => {
    let s = toVote(setup());
    for (const id of ["ada", "bo", "cy"]) s = mostLikelyToGame.onPlayerLeft(s, id, T0 + 9000);
    expect(mostLikelyToGame.isFinished(s)).toBe(true);
  });

  it("lets a late joiner vote, and be voted for, from the next round", () => {
    let s = toVote(setup());
    s = vote(s, "ada", "bo");
    s = mostLikelyToGame.onPlayerJoined(s, { id: "eve", nickname: "EVE" }, s.voteStartsAt + 1500);
    expect(viewOf(s, "eve")).toMatchObject({ status: "queued", canVote: false, myVote: null });
    expect(rejection(s, "eve", "ada")).toBe("You can vote from the next round.");
    expect(rejection(s, "bo", "eve")).toBe("You can only vote for someone playing this round.");
    // The round still closes on the players who were in it.
    s = castAll(s, { bo: "bo", cy: "bo" });
    expect(s.phase).toBe("reveal");
    expect(s.results[0]!.candidates).toEqual(["ada", "bo", "cy"]);
    expect(viewOf(s, "eve")).toMatchObject({ status: "queued", myPoints: null });

    s = nextRound(s);
    expect(viewOf(s, "eve")).toMatchObject({ status: "playing", canVote: true });
    expect(viewOf(s, "eve").stage).toMatchObject({ kind: "vote", voters: 4 });
    s = castAll(s, { eve: "eve", ada: "eve", bo: "eve" });
    expect(s.phase).toBe("vote");
    s = vote(s, "cy", "eve");
    expect(s.results[1]).toMatchObject({ winners: ["eve"] });
  });

  it("lets someone who joins during the reveal in from the next round", () => {
    let s = castAll(toVote(setup()), { ada: "bo", bo: "bo", cy: "bo" });
    s = mostLikelyToGame.onPlayerJoined(s, { id: "eve", nickname: "EVE" }, s.revealEndsAt! - 10);
    expect(viewOf(s, "eve").status).toBe("queued");
    s = nextRound(s);
    expect(viewOf(s, "eve")).toMatchObject({ status: "playing", canVote: true });
  });

  it("lets someone who joins during the countdown straight in", () => {
    let s = mostLikelyToGame.onPlayerJoined(setup(), { id: "eve", nickname: "EVE" }, T0 + 500);
    s = toVote(s);
    expect(viewOf(s, "eve")).toMatchObject({ status: "playing", canVote: true });
  });

  it("lets a player who left come back and vote again in the open round", () => {
    let s = toVote(setup());
    s = vote(s, "ada", "bo");
    s = mostLikelyToGame.onPlayerLeft(s, "ada", s.voteStartsAt + 500);
    s = mostLikelyToGame.onPlayerJoined(s, { id: "ada", nickname: "ADA" }, s.voteStartsAt + 800);
    expect(viewOf(s, "ada")).toMatchObject({ status: "playing", canVote: true, myVote: null });
    s = castAll(s, { ada: "cy", bo: "cy", cy: "cy" });
    expect(s.results[0]!.winners).toEqual(["cy"]);
  });

  it("ignores joins and leaves once the game is over", () => {
    let s = toVote(setup(["ada", "bo", "cy"], { ...SETTINGS, rounds: 5 }, PROMPTS.slice(0, 1)));
    s = nextRound(castAll(s, { ada: "bo", bo: "bo", cy: "bo" }));
    expect(mostLikelyToGame.isFinished(s)).toBe(true);
    expect(mostLikelyToGame.onPlayerJoined(s, { id: "eve", nickname: "EVE" }, T0)).toBe(s);
    expect(mostLikelyToGame.onPlayerLeft(s, "ada", T0)).toBe(s);
  });
});

describe("most likely to: scoring and the summary", () => {
  /** Ada reads the room twice, Bo once, Cy never. */
  function played(): MostLikelyToState {
    let s = toVote(setup(["ada", "bo", "cy"], { ...SETTINGS, rounds: 5 }, PROMPTS.slice(0, 3)));
    s = nextRound(castAll(s, { ada: "bo", bo: "bo", cy: "ada" })); // bo wins: ada, bo read
    s = nextRound(castAll(s, { ada: "cy", bo: "ada", cy: "cy" })); // cy wins: ada, cy read
    s = nextRound(castAll(s, { ada: "ada", bo: "bo", cy: "cy" })); // three-way tie: all read
    return s;
  }

  it("scores a vote for a player who ended with the most votes", () => {
    const s = played();
    expect(mostLikelyToGame.isFinished(s)).toBe(true);
    const standings = viewOf(s, "ada").standings;
    expect(standings.map((r) => [r.playerId, r.rank, r.points, r.reads, r.crowned])).toEqual([
      ["ada", 1, 3 * MOST_LIKELY_TO_READ_POINTS, 3, 1],
      ["bo", 2, 2 * MOST_LIKELY_TO_READ_POINTS, 2, 2],
      ["cy", 2, 2 * MOST_LIKELY_TO_READ_POINTS, 2, 2],
    ]);
    expect(standings.find((r) => r.playerId === "bo")).toMatchObject({
      votesReceived: 3,
      voted: 3,
    });
    expect(viewOf(s, "bo").me).toMatchObject({ playerId: "bo", rank: 2 });
  });

  it("summarizes the players who stayed, best first, with shared placings on a tie", () => {
    const summary = mostLikelyToGame.summarize(played());
    expect(summary).toEqual({
      category: "classic",
      difficulty: null,
      mode: null,
      rounds: 3,
      players: [
        { playerId: "ada", placing: 1, score: 300, correct: 3 },
        { playerId: "bo", placing: 2, score: 200, correct: 2 },
        { playerId: "cy", placing: 2, score: 200, correct: 2 },
      ],
    });
  });

  it("leaves out players who left, and shares a win on equal points", () => {
    let s = toVote(
      setup(["ada", "bo", "cy", "di"], { ...SETTINGS, pack: "work" }, PROMPTS.slice(0, 2)),
    );
    s = nextRound(castAll(s, { ada: "cy", bo: "cy", cy: "di", di: "di" })); // tie: all read
    s = mostLikelyToGame.onPlayerLeft(s, "di", s.voteStartsAt + 100);
    s = nextRound(castAll(s, { ada: "ada", bo: "ada", cy: "ada" })); // ada wins: all read
    const summary = mostLikelyToGame.summarize(s);
    expect(summary.category).toBe("work");
    expect(summary.rounds).toBe(2);
    // Equal points: rounds topped, then name, set the order, but the placing is shared.
    expect(summary.players).toEqual([
      { playerId: "ada", placing: 1, score: 200, correct: 2 },
      { playerId: "cy", placing: 1, score: 200, correct: 2 },
      { playerId: "bo", placing: 1, score: 200, correct: 2 },
    ]);
    // In the standings, the player who left ranks after everyone still in.
    expect(viewOf(s, "ada").standings.at(-1)).toMatchObject({
      playerId: "di",
      left: true,
      rank: 4,
    });
  });

  it("counts the rounds actually played when everyone leaves early", () => {
    let s = toVote(setup());
    s = nextRound(castAll(s, { ada: "bo", bo: "bo", cy: "bo" }));
    for (const id of ["ada", "bo", "cy"]) s = mostLikelyToGame.onPlayerLeft(s, id, s.voteStartsAt);
    expect(mostLikelyToGame.summarize(s)).toMatchObject({ rounds: 1, players: [] });
  });
});
