import { z } from "zod";
import { seededRng, shuffled, type Rng } from "../../random";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  DEFAULT_IMPOSTOR_SETTINGS,
  IMPOSTOR_GUESS_OPTIONS,
  impostorCategoryName,
  impostorSettingsSchema,
  type ImpostorCategory,
  type ImpostorClueMode,
  type ImpostorSettings,
  type ImpostorWord,
} from "./settings";

/**
 * Impostor: every round, everyone but one player sees the same secret word; the impostor sees
 * only its category. Players take turns giving a one-word clue (typed, or said out loud in the
 * same room), then everyone votes for who they think the impostor is. A caught impostor gets a
 * last chance: pick the word from eight. All of it is timed by the room's tick, and every
 * player's view holds only what their role may know — the impostor never gets the word, and
 * nobody else learns who the impostor is, or how anyone voted, before the round's reveal.
 */

/** Everyone reads their role card (the word, or "you're the impostor") before the clues start. */
export const IMPOSTOR_ROLE_MS = 6000;
/** How long the caught impostor has to pick the word. */
export const IMPOSTOR_GUESS_MS = 20_000;
/** How long the round's reveal stays up before the next round. */
export const IMPOSTOR_REVEAL_MS = 10_000;
/** The longest typed clue, in characters. */
export const IMPOSTOR_CLUE_MAX_LENGTH = 24;
/** Fewer active players than this and the game ends: three is the least a vote means anything. */
export const IMPOSTOR_MIN_ACTIVE = 3;

/** A crew member who voted for the impostor. */
export const CREW_VOTE_POINTS = 1000;
/** The impostor, when the vote didn't land on them. */
export const IMPOSTOR_ESCAPE_POINTS = 1500;
/** The caught impostor, for picking the word on their last chance. */
export const IMPOSTOR_GUESS_POINTS = 750;

export const impostorActionSchema = z.discriminatedUnion("type", [
  /** A typed clue, on your turn. */
  z.object({ type: z.literal("clue"), text: z.string().max(200) }),
  /** Spoken clues: you've said yours out loud. */
  z.object({ type: z.literal("done") }),
  /** Who you think the impostor is. You can change it until the vote closes. */
  z.object({ type: z.literal("vote"), playerId: z.string() }),
  /** The caught impostor's pick, by its index in the round's options. */
  z.object({ type: z.literal("guess"), choice: z.number().int() }),
]);

export type ImpostorAction = z.infer<typeof impostorActionSchema>;

export type ImpostorPhase = "role" | "clues" | "vote" | "guess" | "reveal";
export type ImpostorRole = "crew" | "impostor";

/**
 * How a turn went: a typed clue, a spoken one (marked done), a turn that ran out of time, or
 * one skipped because the player had left.
 */
export type ImpostorClueStatus = "typed" | "spoken" | "missed" | "skipped";

export interface ImpostorClue {
  playerId: string;
  /** The typed clue; null for spoken, missed and skipped turns. */
  text: string | null;
  status: ImpostorClueStatus;
}

export interface ImpostorVote {
  voterId: string;
  suspectId: string;
}

/**
 * How a round ended: the impostor was caught and missed the word, caught but picked the word,
 * escaped the vote (a wrong accusation, a tie or no votes), or left the game (a crew win).
 */
export type ImpostorOutcome = "caught" | "guessed" | "escaped" | "left";

/** One round, as the server keeps it. Never sent whole: views take only what a player may see. */
export interface ImpostorRound {
  index: number;
  wordId: string;
  category: ImpostorCategory;
  word: string;
  /** The last chance's choices: the word and seven others from the category, shuffled. */
  options: string[];
  impostorId: string;
  /** Everyone taking part this round, in clue order. */
  order: string[];
  /** Whose clue it is, by index in `order`; `order.length` once the clues are done. */
  turn: number;
  clues: ImpostorClue[];
  votes: ImpostorVote[];
  /** Who the vote landed on; null on a tie or no votes. */
  accusedId: string | null;
  /** The caught impostor's pick, by index in `options`. */
  guess: number | null;
  /** Null until the round is decided. */
  outcome: ImpostorOutcome | null;
  /** What each player scored this round, once it's decided. */
  points: Record<string, number>;
}

interface ImpostorPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** The first round this player takes part in. Late joiners start on the next round. */
  inFrom: number;
}

export interface ImpostorState {
  settings: ImpostorSettings;
  seed: number;
  /** One word per round, from the content bank. */
  words: ImpostorWord[];
  players: ImpostorPlayer[];
  /** The rounds so far; the current one is last. */
  rounds: ImpostorRound[];
  phase: ImpostorPhase;
  /** When the role card, the clue turn, the vote, the last chance or the reveal ends. */
  phaseEndsAt: number;
  finishedAt: number | null;
  /** The game ended because too few players were left, not because the rounds ran out. */
  endedEarly: boolean;
}

export interface ImpostorStanding {
  playerId: string;
  nickname: string;
  /** Equal points share a rank. */
  rank: number;
  points: number;
  /** Decided rounds as crew where they voted for the impostor. */
  correctVotes: number;
  /** Decided rounds they were the impostor in. */
  impostorRounds: number;
  /** Of those, the ones where the vote missed them. */
  escapes: number;
  left: boolean;
}

/** A decided round as everyone sees it at the reveal. */
export interface ImpostorRoundResult {
  round: number;
  category: ImpostorCategory;
  categoryName: string;
  word: string;
  impostorId: string;
  outcome: ImpostorOutcome;
  clues: ImpostorClue[];
  votes: ImpostorVote[];
  /** Votes each player got, most first. */
  tally: { playerId: string; votes: number }[];
  accusedId: string | null;
  /** The option the caught impostor picked, or null if they weren't caught or didn't pick. */
  guess: string | null;
  guessedRight: boolean;
  points: { playerId: string; points: number }[];
}

export type ImpostorStage =
  /** The role card: the word (crew) or "you're the impostor", before the first clue. */
  | { kind: "role"; endsAt: number }
  | {
      kind: "clues";
      /** Everyone taking part, in clue order. */
      order: string[];
      /** Whose turn it is. */
      turnPlayerId: string;
      turnIndex: number;
      turnEndsAt: number;
      /** The turns so far, typed clues with their text. */
      clues: ImpostorClue[];
    }
  | {
      kind: "vote";
      endsAt: number;
      clues: ImpostorClue[];
      /** Who can be voted for (everyone still in the round; you can't vote for yourself). */
      candidates: string[];
      /** Who has voted, never for whom. */
      voted: string[];
    }
  | {
      kind: "guess";
      endsAt: number;
      /** The vote caught the impostor: this is them, choosing the word. */
      accusedId: string;
      options: string[];
      clues: ImpostorClue[];
    }
  | ({ kind: "reveal"; endsAt: number; last: boolean } & ImpostorRoundResult)
  /** Joined mid-round: they're in from the next one. */
  | { kind: "queued" }
  | { kind: "watching" }
  | { kind: "done"; endedEarly: boolean };

export interface ImpostorView {
  game: "impostor";
  /** The current round, from 0, and how many the game has. */
  round: number;
  rounds: number;
  clueMode: ImpostorClueMode;
  clueMaxLength: number;
  category: { id: ImpostorCategory; name: string };
  /** This player's role this round; null when they're not in it. */
  role: ImpostorRole | null;
  /** The secret word: crew only, until the reveal shows it to everyone. */
  word: string | null;
  stage: ImpostorStage;
  /** This player's vote this round, until the reveal shows them all. */
  myVote: string | null;
  /** The caught impostor's own pick on their last chance. */
  myGuess: number | null;
  /** Every decided round so far, oldest first. */
  history: ImpostorRoundResult[];
  me: ImpostorStanding | null;
  standings: ImpostorStanding[];
  final: boolean;
}

const reject = (message: string): Rejection => ({ rejected: message });

// Clues ------------------------------------------------------------------------------------

/** Lower case, no accents, letters and digits only: for comparing clues and words. */
export function foldClue(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** A typed clue tidied for checking and showing: trimmed, accents composed. */
export function normalizeClue(text: string): string {
  return text.normalize("NFC").trim();
}

/** Why a typed clue can't be used, or null if it's fine as a clue. */
export function clueProblem(text: string): string | null {
  const clue = normalizeClue(text);
  if (!clue) return "Type a clue first.";
  if (/\s/u.test(clue)) return "Clues are one word.";
  if ([...clue].length > IMPOSTOR_CLUE_MAX_LENGTH) {
    return `Keep it to ${IMPOSTOR_CLUE_MAX_LENGTH} characters.`;
  }
  if (!/^[\p{L}\p{M}\p{N}'’-]+$/u.test(clue) || !foldClue(clue)) {
    return "Clues are one word: letters and numbers only.";
  }
  return null;
}

/** Whether a clue says the word itself (or one of its words): "pizzas" for Pizza. */
function givesAway(clue: string, word: string): boolean {
  const folded = foldClue(clue);
  const whole = foldClue(word);
  if (folded.includes(whole)) return true;
  return word
    .split(/[\s-]+/u)
    .map(foldClue)
    .some((part) => part.length >= 3 && folded === part);
}

// Rounds -----------------------------------------------------------------------------------

/** Each round's own random draws, from the room's seed. */
const roundRng = (seed: number, round: number): Rng =>
  seededRng((seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0);

const current = (state: ImpostorState): ImpostorRound => state.rounds[state.rounds.length - 1]!;

const totalRounds = (state: ImpostorState) => Math.min(state.settings.rounds, state.words.length);

const activePlayers = (state: ImpostorState) => state.players.filter((p) => !p.left);

const isActive = (state: ImpostorState, id: string) =>
  state.players.some((p) => p.id === id && !p.left);

/** Who is still in the current round: taking part from its start, and not gone. */
const inRound = (state: ImpostorState, round: ImpostorRound) =>
  round.order.filter((id) => isActive(state, id));

/**
 * The round's impostor: never last round's when someone else can take it, and among the rest
 * whoever has been the impostor least, picked at random from the seed. Over a game that gives
 * everyone a turn before anyone has a second.
 */
function pickImpostor(state: ImpostorState, order: string[], rng: Rng): string {
  const last = state.rounds.at(-1)?.impostorId ?? null;
  const eligible = order.length > 1 ? order.filter((id) => id !== last) : order;
  const times = (id: string) => state.rounds.filter((r) => r.impostorId === id).length;
  const fewest = Math.min(...eligible.map(times));
  const candidates = eligible.filter((id) => times(id) === fewest);
  return candidates[Math.floor(rng() * candidates.length)]!;
}

function beginRound(state: ImpostorState, index: number, at: number): ImpostorState {
  const rng = roundRng(state.seed, index);
  const word = state.words[index]!;
  // Players in their joining order, so the shuffle depends only on the seed and who's in.
  const order = shuffled(
    state.players.filter((p) => !p.left && p.inFrom <= index).map((p) => p.id),
    rng,
  );
  const impostorId = pickImpostor(state, order, rng);
  const decoys = shuffled(
    word.decoys.filter((d) => foldClue(d) !== foldClue(word.word)),
    rng,
  ).slice(0, IMPOSTOR_GUESS_OPTIONS - 1);
  const round: ImpostorRound = {
    index,
    wordId: word.id,
    category: word.category,
    word: word.word,
    options: shuffled([word.word, ...decoys], rng),
    impostorId,
    order,
    turn: 0,
    clues: [],
    votes: [],
    accusedId: null,
    guess: null,
    outcome: null,
    points: {},
  };
  return {
    ...state,
    rounds: [...state.rounds, round],
    phase: "role",
    phaseEndsAt: at + IMPOSTOR_ROLE_MS,
  };
}

const withRound = (state: ImpostorState, round: ImpostorRound): ImpostorState => ({
  ...state,
  rounds: [...state.rounds.slice(0, -1), round],
});

/**
 * Moves the clues on to the next player still here, from `turn`, recording the ones who left
 * as skipped. Once everyone has had a turn, the vote opens.
 */
function advanceTurn(state: ImpostorState, round: ImpostorRound, at: number): ImpostorState {
  let turn = round.turn;
  const clues = [...round.clues];
  while (turn < round.order.length && !isActive(state, round.order[turn]!)) {
    clues.push({ playerId: round.order[turn]!, text: null, status: "skipped" });
    turn++;
  }
  const next = withRound(state, { ...round, turn, clues });
  if (turn >= round.order.length) {
    return { ...next, phase: "vote", phaseEndsAt: at + next.settings.voteSeconds * 1000 };
  }
  return { ...next, phase: "clues", phaseEndsAt: at + next.settings.clueSeconds * 1000 };
}

/** The current turn ends with this clue (or none), and the next one starts. */
function endTurn(state: ImpostorState, clue: ImpostorClue, at: number): ImpostorState {
  const round = current(state);
  return advanceTurn(state, { ...round, turn: round.turn + 1, clues: [...round.clues, clue] }, at);
}

/** Votes per player, most first; on equal votes, in clue order. */
function tallyOf(round: ImpostorRound): { playerId: string; votes: number }[] {
  const counts = new Map<string, number>();
  for (const v of round.votes) counts.set(v.suspectId, (counts.get(v.suspectId) ?? 0) + 1);
  const position = (id: string) => {
    const i = round.order.indexOf(id);
    return i === -1 ? round.order.length : i;
  };
  return [...counts.entries()]
    .map(([playerId, votes]) => ({ playerId, votes }))
    .sort((a, b) => b.votes - a.votes || position(a.playerId) - position(b.playerId));
}

/** Who the most votes landed on, or null on a tie or with no votes. */
function accusedOf(round: ImpostorRound): string | null {
  const [top, second] = tallyOf(round);
  if (!top || (second && second.votes === top.votes)) return null;
  return top.playerId;
}

function pointsFor(round: ImpostorRound, outcome: ImpostorOutcome): Record<string, number> {
  const points: Record<string, number> = {};
  for (const id of round.order) points[id] = 0;
  if (outcome === "left") return points;
  for (const v of round.votes) {
    if (v.voterId !== round.impostorId && v.suspectId === round.impostorId) {
      points[v.voterId] = CREW_VOTE_POINTS;
    }
  }
  if (outcome === "escaped") points[round.impostorId] = IMPOSTOR_ESCAPE_POINTS;
  if (outcome === "guessed") points[round.impostorId] = IMPOSTOR_GUESS_POINTS;
  return points;
}

/** The round is decided: score it and show the reveal. */
function decide(state: ImpostorState, outcome: ImpostorOutcome, at: number): ImpostorState {
  const round = current(state);
  const decided = { ...round, outcome, points: pointsFor(round, outcome) };
  return { ...withRound(state, decided), phase: "reveal", phaseEndsAt: at + IMPOSTOR_REVEAL_MS };
}

/** The vote closes: a caught impostor gets their last chance; otherwise they've escaped. */
function closeVote(state: ImpostorState, at: number): ImpostorState {
  const round = current(state);
  const accusedId = accusedOf(round);
  const next = withRound(state, { ...round, accusedId });
  if (accusedId !== null && accusedId === round.impostorId) {
    return { ...next, phase: "guess", phaseEndsAt: at + IMPOSTOR_GUESS_MS };
  }
  return decide(next, "escaped", at);
}

const allVoted = (state: ImpostorState) => {
  const round = current(state);
  return inRound(state, round).every((id) => round.votes.some((v) => v.voterId === id));
};

function finish(state: ImpostorState, at: number, endedEarly: boolean): ImpostorState {
  return { ...state, finishedAt: at, endedEarly };
}

/** After the reveal: the next round, or the end of the game. */
function nextRound(state: ImpostorState, at: number): ImpostorState {
  const index = current(state).index + 1;
  if (index >= totalRounds(state)) return finish(state, at, false);
  if (activePlayers(state).length < IMPOSTOR_MIN_ACTIVE) return finish(state, at, true);
  return beginRound(state, index, at);
}

/** One step of the clock, for a deadline that has passed. */
function step(state: ImpostorState, at: number): ImpostorState {
  const round = current(state);
  switch (state.phase) {
    case "role":
      return advanceTurn(state, round, at);
    case "clues":
      return endTurn(
        state,
        { playerId: round.order[round.turn]!, text: null, status: "missed" },
        at,
      );
    case "vote":
      return closeVote(state, at);
    case "guess":
      return decide(state, "caught", at);
    case "reveal":
      return nextRound(state, at);
  }
}

// Standings and views ----------------------------------------------------------------------

export function standingsOf(state: ImpostorState): ImpostorStanding[] {
  const decided = state.rounds.filter((r) => r.outcome !== null);
  const rows = state.players.map((p) => {
    let points = 0;
    let correctVotes = 0;
    let impostorRounds = 0;
    let escapes = 0;
    for (const r of decided) {
      points += r.points[p.id] ?? 0;
      if (r.impostorId === p.id) {
        impostorRounds++;
        if (r.outcome === "escaped") escapes++;
      } else if (r.votes.some((v) => v.voterId === p.id && v.suspectId === r.impostorId)) {
        correctVotes++;
      }
    }
    return { p, points, correctVotes, impostorRounds, escapes };
  });
  rows.sort(
    (a, b) =>
      Number(a.p.left) - Number(b.p.left) ||
      b.points - a.points ||
      b.correctVotes - a.correctVotes ||
      a.p.nickname.localeCompare(b.p.nickname),
  );
  return rows.map((row) => ({
    playerId: row.p.id,
    nickname: row.p.nickname,
    rank:
      1 +
      rows.filter(
        (other) =>
          Number(other.p.left) < Number(row.p.left) ||
          (other.p.left === row.p.left && other.points > row.points),
      ).length,
    points: row.points,
    correctVotes: row.correctVotes,
    impostorRounds: row.impostorRounds,
    escapes: row.escapes,
    left: row.p.left,
  }));
}

function resultOf(round: ImpostorRound): ImpostorRoundResult {
  return {
    round: round.index,
    category: round.category,
    categoryName: impostorCategoryName(round.category),
    word: round.word,
    impostorId: round.impostorId,
    outcome: round.outcome!,
    clues: round.clues,
    votes: round.votes,
    tally: tallyOf(round),
    accusedId: round.accusedId,
    guess: round.guess === null ? null : (round.options[round.guess] ?? null),
    guessedRight: round.outcome === "guessed",
    points: round.order.map((id) => ({ playerId: id, points: round.points[id] ?? 0 })),
  };
}

function viewFor(state: ImpostorState, playerId: string): ImpostorView {
  const round = current(state);
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const decided = round.outcome !== null;
  const taking = !!player && !player.left && round.order.includes(playerId);
  const role: ImpostorRole | null = taking
    ? round.impostorId === playerId
      ? "impostor"
      : "crew"
    : null;

  let stage: ImpostorStage;
  if (state.finishedAt !== null) {
    stage = { kind: "done", endedEarly: state.endedEarly };
  } else if (!player || player.left) {
    stage = { kind: "watching" };
  } else if (!taking && state.phase !== "reveal") {
    stage = { kind: "queued" };
  } else if (state.phase === "role") {
    stage = { kind: "role", endsAt: state.phaseEndsAt };
  } else if (state.phase === "clues") {
    stage = {
      kind: "clues",
      order: round.order,
      turnPlayerId: round.order[round.turn]!,
      turnIndex: round.turn,
      turnEndsAt: state.phaseEndsAt,
      clues: round.clues,
    };
  } else if (state.phase === "vote") {
    stage = {
      kind: "vote",
      endsAt: state.phaseEndsAt,
      clues: round.clues,
      candidates: inRound(state, round),
      voted: round.votes.map((v) => v.voterId),
    };
  } else if (state.phase === "guess") {
    stage = {
      kind: "guess",
      endsAt: state.phaseEndsAt,
      accusedId: round.accusedId!,
      options: round.options,
      clues: round.clues,
    };
  } else {
    stage = {
      kind: "reveal",
      endsAt: state.phaseEndsAt,
      last: round.index + 1 >= totalRounds(state),
      ...resultOf(round),
    };
  }

  // The word goes to the crew; everyone sees it once the round is decided.
  const word = decided || role === "crew" ? round.word : null;
  return {
    game: "impostor",
    round: round.index,
    rounds: totalRounds(state),
    clueMode: state.settings.clues,
    clueMaxLength: IMPOSTOR_CLUE_MAX_LENGTH,
    category: { id: round.category, name: impostorCategoryName(round.category) },
    role,
    word,
    stage,
    myVote: round.votes.find((v) => v.voterId === playerId)?.suspectId ?? null,
    myGuess: role === "impostor" ? round.guess : null,
    history: state.rounds.filter((r) => r.outcome !== null).map(resultOf),
    me: standings.find((s) => s.playerId === playerId) ?? null,
    standings,
    final: state.finishedAt !== null,
  };
}

// Actions ----------------------------------------------------------------------------------

function onAction(
  state: ImpostorState,
  playerId: string,
  action: ImpostorAction,
  now: number,
): ImpostorState | Rejection {
  if (state.finishedAt !== null) return reject("The game is over.");
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.left) return reject("You're watching this game.");
  const round = current(state);
  if (!round.order.includes(playerId)) return reject("You're in from the next round.");

  switch (action.type) {
    case "clue":
    case "done": {
      if (state.phase !== "clues") return reject("It's not time for clues.");
      if (round.order[round.turn] !== playerId) return reject("It's not your turn.");
      if (action.type === "done") {
        if (state.settings.clues !== "spoken") return reject("Type your clue.");
        return endTurn(state, { playerId, text: null, status: "spoken" }, now);
      }
      if (state.settings.clues !== "typed") return reject("Say your clue out loud.");
      const problem = clueProblem(action.text);
      if (problem) return reject(problem);
      const text = normalizeClue(action.text);
      const folded = foldClue(text);
      if (round.clues.some((c) => c.text !== null && foldClue(c.text) === folded)) {
        return reject("Someone already said that. Try another.");
      }
      // Only the crew know the word, so only they are stopped from saying it: telling the
      // impostor their clue was the word would give it to them.
      if (playerId !== round.impostorId && givesAway(text, round.word)) {
        return reject("That gives the word away. Try another clue.");
      }
      return endTurn(state, { playerId, text, status: "typed" }, now);
    }
    case "vote": {
      if (state.phase !== "vote") return reject("It's not time to vote.");
      if (action.playerId === playerId) return reject("You can't vote for yourself.");
      if (!inRound(state, round).includes(action.playerId)) {
        return reject("They're not in this round.");
      }
      const votes = [
        ...round.votes.filter((v) => v.voterId !== playerId),
        { voterId: playerId, suspectId: action.playerId },
      ];
      const next = withRound(state, { ...round, votes });
      return allVoted(next) ? closeVote(next, now) : next;
    }
    case "guess": {
      // Everyone else gets the same answer as the impostor would outside the last chance.
      if (state.phase !== "guess" || round.impostorId !== playerId) {
        return reject("There's nothing to guess right now.");
      }
      if (action.choice < 0 || action.choice >= round.options.length) {
        return reject("That isn't one of the choices.");
      }
      const right = round.options[action.choice] === round.word;
      return decide(
        withRound(state, { ...round, guess: action.choice }),
        right ? "guessed" : "caught",
        now,
      );
    }
  }
}

function onPlayerLeft(state: ImpostorState, playerId: string, now: number): ImpostorState {
  if (state.finishedAt !== null) return state;
  if (!state.players.some((p) => p.id === playerId && !p.left)) return state;
  const next: ImpostorState = {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p)),
  };
  if (activePlayers(next).length < IMPOSTOR_MIN_ACTIVE) return finish(next, now, true);

  const round = current(next);
  if (round.outcome !== null || !round.order.includes(playerId)) return next;
  // Without the impostor there's nothing left to find: the crew win the round.
  if (round.impostorId === playerId) return decide(next, "left", now);
  if (next.phase === "clues" && round.order[round.turn] === playerId) {
    return endTurn(next, { playerId, text: null, status: "skipped" }, now);
  }
  if (next.phase === "vote" && allVoted(next)) return closeVote(next, now);
  return next;
}

function onPlayerJoined(state: ImpostorState, player: GamePlayer): ImpostorState {
  if (state.finishedAt !== null) return state;
  const known = state.players.find((p) => p.id === player.id);
  if (known) {
    // Back after leaving: into the current round if they started it, else the next one.
    if (!known.left) return state;
    return {
      ...state,
      players: state.players.map((p) => (p.id === player.id ? { ...p, left: false } : p)),
    };
  }
  const joined: ImpostorPlayer = {
    id: player.id,
    nickname: player.nickname,
    left: false,
    inFrom: current(state).index + 1,
  };
  return { ...state, players: [...state.players, joined] };
}

// Module -----------------------------------------------------------------------------------

export const impostorGame: GameModule<
  ImpostorSettings,
  ImpostorWord[],
  ImpostorState,
  ImpostorAction,
  ImpostorView
> = {
  id: "impostor",
  name: "Impostor",
  minPlayers: 4,
  maxPlayers: 12,
  settingsSchema: impostorSettingsSchema,
  defaultSettings: DEFAULT_IMPOSTOR_SETTINGS,
  actionSchema: impostorActionSchema,

  contentNeeded: (settings) => ({
    kind: "impostor-words",
    pack: settings.wordPack,
    count: settings.rounds,
  }),

  typedText: (action) => (action.type === "clue" ? normalizeClue(action.text) : null),

  setup({ settings, players, content, seed, now }) {
    const state: ImpostorState = {
      settings,
      seed,
      words: content,
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, left: false, inFrom: 0 })),
      rounds: [],
      phase: "role",
      phaseEndsAt: now,
      finishedAt: null,
      endedEarly: false,
    };
    return beginRound(state, 0, now);
  },

  onAction,
  onPlayerLeft,
  onPlayerJoined,

  tick(state, now) {
    let next = state;
    // A late wake catches up on every deadline that has passed, each from its own time.
    while (next.finishedAt === null && now >= next.phaseEndsAt) {
      next = step(next, next.phaseEndsAt);
    }
    return next;
  },

  nextWakeAt: (state) => (state.finishedAt === null ? state.phaseEndsAt : null),

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: state.settings.wordPack,
      difficulty: null,
      // Typed or spoken clues are a way of playing, not a mode the site's stats count.
      mode: null,
      rounds: state.rounds.filter((r) => r.outcome !== null).length,
      players: stayed.map((s) => ({
        playerId: s.playerId,
        placing: s.rank,
        score: s.points,
        correct: s.correctVotes,
      })),
    };
  },

  viewFor,
};
