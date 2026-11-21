import { z } from "zod";
import type { GameModule, GamePlayer, Rejection } from "../types";
import {
  DEFAULT_MOST_LIKELY_TO_SETTINGS,
  mostLikelyToSettingsSchema,
  type MostLikelyToContentRequest,
  type MostLikelyToPrompt,
  type MostLikelyToSettings,
} from "./settings";

/**
 * Most Likely To: a prompt comes up ("Most likely to forget their own birthday") and everyone
 * votes for one player, themselves included. The vote is timed by the room's tick and closes
 * as soon as everyone has voted; then the reveal shows how many votes each player got, the
 * round's winner (or winners, on a tie) and, unless the room keeps votes anonymous, who voted
 * for whom. A vote for a player who ends up with the most votes reads the room and scores, so
 * the game has an overall winner. The prompts come from the content bank, one pack per game,
 * drawn from the room's seed without repeats.
 */

/** "Get ready" before the first prompt, the same moment for everyone. */
export const MOST_LIKELY_TO_COUNTDOWN_MS = 3000;
/** How long the tally and the winners stay up before the next prompt. */
export const MOST_LIKELY_TO_REVEAL_MS = 6000;
/** Points for a vote that read the room: one for a player who ended with the most votes. */
export const MOST_LIKELY_TO_READ_POINTS = 1000;

export const mostLikelyToActionSchema = z.object({
  type: z.literal("vote"),
  /** The player voted for, by id. Voting for yourself is allowed. */
  target: z.string().min(1).max(64),
});

export type MostLikelyToAction = z.infer<typeof mostLikelyToActionSchema>;

interface MostLikelyToPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** The first round this player votes in and can be voted for. Late joiners wait a round. */
  inFrom: number;
}

/** A counted vote. */
export interface MostLikelyToVote {
  voterId: string;
  targetId: string;
}

/** How one round went, fixed when its vote closed. */
export interface MostLikelyToRoundResult {
  prompt: MostLikelyToPrompt;
  /** Who could be voted for when the vote closed. */
  candidates: string[];
  /** The votes that counted, in the order they came in. */
  votes: MostLikelyToVote[];
  /** Players with the most votes: more than one on a tie, none if nobody voted. */
  winners: string[];
  /** Voters who voted for one of the winners and scored. */
  readers: string[];
}

export interface MostLikelyToState {
  settings: MostLikelyToSettings;
  /** One per round, in order. Fewer than the setting asks for only if the pack ran short. */
  prompts: MostLikelyToPrompt[];
  players: MostLikelyToPlayer[];
  round: number;
  /** The countdown to the first prompt, a vote, or the reveal after it. */
  phase: "countdown" | "vote" | "reveal";
  /** When the vote opens. */
  voteStartsAt: number;
  /** When the vote closes without everyone having voted. */
  voteEndsAt: number;
  /** When the reveal moves on. Null outside the reveal. */
  revealEndsAt: number | null;
  /** This round's votes, by voter. Hidden from everyone but the voter until the reveal. */
  votes: Record<string, string>;
  /** Every closed round, in order. */
  results: MostLikelyToRoundResult[];
  finishedAt: number | null;
}

export interface MostLikelyToStanding {
  playerId: string;
  nickname: string;
  /** Equal points share a rank. Players who left rank after everyone still in. */
  rank: number;
  points: number;
  /** Rounds where their vote went to a winner. */
  reads: number;
  /** Rounds they topped (ties included). */
  crowned: number;
  /** Votes they received across the game. */
  votesReceived: number;
  /** Rounds they voted in. */
  voted: number;
  left: boolean;
}

export interface MostLikelyToCandidate {
  playerId: string;
  nickname: string;
}

/** One player's line in the reveal. */
export interface MostLikelyToTally {
  playerId: string;
  nickname: string;
  votes: number;
  /** Who voted for them, or null when votes are anonymous. */
  voters: string[] | null;
  winner: boolean;
}

/** A closed round as the history shows it: never who voted for whom. */
export interface MostLikelyToRecap {
  round: number;
  prompt: MostLikelyToPrompt;
  winners: MostLikelyToCandidate[];
  /** The winners' vote count; 0 if nobody voted. */
  topVotes: number;
  totalVotes: number;
}

export type MostLikelyToStage =
  | { kind: "countdown"; round: number; startsAt: number }
  | {
      kind: "vote";
      round: number;
      prompt: MostLikelyToPrompt;
      startsAt: number;
      deadline: number;
      /** Who can be voted for this round. */
      candidates: MostLikelyToCandidate[];
      /** Who has voted so far: never who for. */
      voted: string[];
      /** How many players vote this round. */
      voters: number;
    }
  | {
      kind: "reveal";
      round: number;
      prompt: MostLikelyToPrompt;
      endsAt: number;
      /** Every candidate, most votes first. */
      tally: MostLikelyToTally[];
      winners: string[];
      topVotes: number;
      totalVotes: number;
      /** Who scored this round, or null when votes are anonymous (it would give votes away). */
      readers: string[] | null;
    }
  | { kind: "done" };

export interface MostLikelyToView {
  game: "most-likely-to";
  rounds: number;
  voteMs: number;
  anonymousVotes: boolean;
  pack: MostLikelyToSettings["pack"];
  stage: MostLikelyToStage;
  /**
   * This player in the game: voting, waiting for the next round (joined mid-round), gone
   * (left the game), or watching (never in it).
   */
  status: "playing" | "queued" | "left" | "watching";
  /** Whether a vote from this player would count right now. */
  canVote: boolean;
  /** This player's own vote this round, once cast (and through the reveal). */
  myVote: string | null;
  /** What this player scored in the round being revealed. */
  myPoints: number | null;
  me: MostLikelyToStanding | null;
  standings: MostLikelyToStanding[];
  /** The rounds so far, for an end-of-game recap. */
  history: MostLikelyToRecap[];
  playerCount: number;
  final: boolean;
}

const reject = (message: string): Rejection => ({ rejected: message });

// Rounds -----------------------------------------------------------------------------------

const active = (state: MostLikelyToState) => state.players.filter((p) => !p.left);

/** Voting this round and up for votes: in the game, and in it since before the round began. */
const inRound = (p: MostLikelyToPlayer, round: number) => !p.left && p.inFrom <= round;

const roundPlayers = (state: MostLikelyToState) =>
  state.players.filter((p) => inRound(p, state.round));

/** The vote closes as soon as everyone taking part has voted. */
const allVoted = (state: MostLikelyToState) =>
  roundPlayers(state).every((p) => state.votes[p.id] !== undefined);

/** Closes the vote: counts it, fixes the round's result and starts the reveal. */
function startReveal(state: MostLikelyToState, at: number): MostLikelyToState {
  const candidates = roundPlayers(state).map((p) => p.id);
  const votes = Object.entries(state.votes)
    .filter(([voter, target]) => candidates.includes(voter) && candidates.includes(target))
    .map(([voterId, targetId]) => ({ voterId, targetId }));
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.targetId, (counts.get(v.targetId) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const winners = top > 0 ? candidates.filter((id) => counts.get(id) === top) : [];
  const readers = votes.filter((v) => winners.includes(v.targetId)).map((v) => v.voterId);
  const result: MostLikelyToRoundResult = {
    prompt: state.prompts[state.round]!,
    candidates,
    votes,
    winners,
    readers,
  };
  return {
    ...state,
    phase: "reveal",
    voteEndsAt: Math.min(state.voteEndsAt, at),
    revealEndsAt: at + MOST_LIKELY_TO_REVEAL_MS,
    results: [...state.results, result],
  };
}

function beginVote(state: MostLikelyToState, round: number, at: number): MostLikelyToState {
  return {
    ...state,
    round,
    phase: "vote",
    voteStartsAt: at,
    voteEndsAt: at + state.settings.voteSeconds * 1000,
    revealEndsAt: null,
    votes: {},
  };
}

/** Drops a player's own vote and every vote for them from the open round. */
function dropVotes(votes: Record<string, string>, playerId: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(votes).filter(([voter, target]) => voter !== playerId && target !== playerId),
  );
}

export function standingsOf(state: MostLikelyToState): MostLikelyToStanding[] {
  const totals = new Map(
    state.players.map((p) => [
      p.id,
      { points: 0, reads: 0, crowned: 0, votesReceived: 0, voted: 0 },
    ]),
  );
  for (const result of state.results) {
    for (const vote of result.votes) {
      const voter = totals.get(vote.voterId);
      if (voter) voter.voted++;
      const target = totals.get(vote.targetId);
      if (target) target.votesReceived++;
    }
    for (const id of result.readers) {
      const reader = totals.get(id);
      if (!reader) continue;
      reader.reads++;
      reader.points += MOST_LIKELY_TO_READ_POINTS;
    }
    for (const id of result.winners) {
      const winner = totals.get(id);
      if (winner) winner.crowned++;
    }
  }
  const rows = [...state.players].sort((a, b) => {
    const ta = totals.get(a.id)!;
    const tb = totals.get(b.id)!;
    return (
      Number(a.left) - Number(b.left) ||
      tb.points - ta.points ||
      tb.crowned - ta.crowned ||
      a.nickname.localeCompare(b.nickname)
    );
  });
  return rows.map((p) => {
    const total = totals.get(p.id)!;
    // Equal points share a rank, counted among players in the same group (still in, or left).
    const ahead = rows.filter(
      (o) => o.left === p.left && totals.get(o.id)!.points > total.points,
    ).length;
    const before = p.left ? rows.filter((o) => !o.left).length : 0;
    return {
      playerId: p.id,
      nickname: p.nickname,
      rank: before + ahead + 1,
      ...total,
      left: p.left,
    };
  });
}

function nicknameOf(state: MostLikelyToState, id: string): string {
  return state.players.find((p) => p.id === id)?.nickname ?? "";
}

const candidateOf = (state: MostLikelyToState, id: string): MostLikelyToCandidate => ({
  playerId: id,
  nickname: nicknameOf(state, id),
});

function recapOf(state: MostLikelyToState, result: MostLikelyToRoundResult, round: number) {
  const totalVotes = result.votes.length;
  const topVotes =
    result.winners.length > 0
      ? result.votes.filter((v) => v.targetId === result.winners[0]).length
      : 0;
  return {
    round,
    prompt: result.prompt,
    winners: result.winners.map((id) => candidateOf(state, id)),
    topVotes,
    totalVotes,
  } satisfies MostLikelyToRecap;
}

function viewFor(state: MostLikelyToState, playerId: string): MostLikelyToView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const me = standings.find((s) => s.playerId === playerId) ?? null;
  const anonymous = state.settings.anonymousVotes;
  const finished = state.finishedAt !== null;

  const status: MostLikelyToView["status"] = !player
    ? "watching"
    : player.left
      ? "left"
      : player.inFrom > state.round
        ? "queued"
        : "playing";

  let stage: MostLikelyToStage;
  let myVote: string | null = null;
  let myPoints: number | null = null;
  if (finished) {
    stage = { kind: "done" };
  } else if (state.phase === "countdown") {
    stage = { kind: "countdown", round: state.round, startsAt: state.voteStartsAt };
  } else if (state.phase === "vote") {
    const voters = roundPlayers(state);
    stage = {
      kind: "vote",
      round: state.round,
      prompt: state.prompts[state.round]!,
      startsAt: state.voteStartsAt,
      deadline: state.voteEndsAt,
      candidates: voters.map((p) => ({ playerId: p.id, nickname: p.nickname })),
      // Only who has voted, in a fixed order, never who for.
      voted: voters.filter((p) => state.votes[p.id] !== undefined).map((p) => p.id),
      voters: voters.length,
    };
    myVote = state.votes[playerId] ?? null;
  } else {
    const result = state.results[state.round]!;
    const tally: MostLikelyToTally[] = result.candidates
      .map((id) => {
        const votes = result.votes.filter((v) => v.targetId === id);
        return {
          playerId: id,
          nickname: nicknameOf(state, id),
          votes: votes.length,
          voters: anonymous ? null : votes.map((v) => v.voterId),
          winner: result.winners.includes(id),
        };
      })
      .sort((a, b) => b.votes - a.votes || a.nickname.localeCompare(b.nickname));
    const recap = recapOf(state, result, state.round);
    stage = {
      kind: "reveal",
      round: state.round,
      prompt: result.prompt,
      endsAt: state.revealEndsAt ?? 0,
      tally,
      winners: result.winners,
      topVotes: recap.topVotes,
      totalVotes: recap.totalVotes,
      readers: anonymous ? null : result.readers,
    };
    myVote = result.votes.find((v) => v.voterId === playerId)?.targetId ?? null;
    if (result.candidates.includes(playerId)) {
      myPoints = result.readers.includes(playerId) ? MOST_LIKELY_TO_READ_POINTS : 0;
    }
  }

  return {
    game: "most-likely-to",
    rounds: state.prompts.length,
    voteMs: state.settings.voteSeconds * 1000,
    anonymousVotes: anonymous,
    pack: state.settings.pack,
    stage,
    status,
    canVote:
      !finished &&
      state.phase === "vote" &&
      !!player &&
      inRound(player, state.round) &&
      state.votes[playerId] === undefined,
    myVote,
    myPoints,
    me,
    standings,
    history: state.results.map((r, i) => recapOf(state, r, i)),
    playerCount: state.players.length,
    final: finished,
  };
}

/** The prompts the room drew, as they arrived, without anything malformed or repeated. */
function promptsFrom(content: unknown, settings: MostLikelyToSettings): MostLikelyToPrompt[] {
  if (!Array.isArray(content)) return [];
  const seen = new Set<string>();
  const out: MostLikelyToPrompt[] = [];
  for (const item of content) {
    const prompt = item as Partial<MostLikelyToPrompt> | null;
    if (!prompt || typeof prompt.id !== "string" || typeof prompt.text !== "string") continue;
    if (seen.has(prompt.id)) continue;
    seen.add(prompt.id);
    out.push({ id: prompt.id, pack: prompt.pack ?? settings.pack, text: prompt.text });
  }
  return out;
}

// Module -----------------------------------------------------------------------------------

export const mostLikelyToGame: GameModule<
  MostLikelyToSettings,
  unknown,
  MostLikelyToState,
  MostLikelyToAction,
  MostLikelyToView
> = {
  id: "most-likely-to",
  name: "Most Likely To",
  minPlayers: 3,
  maxPlayers: 20,
  settingsSchema: mostLikelyToSettingsSchema,
  defaultSettings: DEFAULT_MOST_LIKELY_TO_SETTINGS,
  actionSchema: mostLikelyToActionSchema,

  contentNeeded: (settings): MostLikelyToContentRequest => ({
    kind: "most-likely-to-prompts",
    pack: settings.pack,
    count: settings.rounds,
  }),

  setup({ settings, players, content, now }) {
    const prompts = promptsFrom(content, settings).slice(0, settings.rounds);
    const startsAt = now + MOST_LIKELY_TO_COUNTDOWN_MS;
    return {
      settings,
      prompts,
      players: players.map((p: GamePlayer) => ({
        id: p.id,
        nickname: p.nickname,
        left: false,
        inFrom: 0,
      })),
      round: 0,
      phase: "countdown",
      voteStartsAt: startsAt,
      voteEndsAt: startsAt + settings.voteSeconds * 1000,
      revealEndsAt: null,
      votes: {},
      results: [],
      // Nothing to play without prompts (the room refuses to start then anyway).
      finishedAt: prompts.length === 0 ? now : null,
    };
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return reject("The game is over.");
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return reject("You're watching this game.");
    if (player.inFrom > state.round) return reject("You can vote from the next round.");
    if (state.phase === "countdown") return reject("The vote hasn't opened yet.");
    if (state.phase !== "vote") return reject("That vote is over.");
    if (state.votes[playerId] !== undefined) return reject("You've already voted.");
    const target = state.players.find((p) => p.id === action.target);
    if (!target || !inRound(target, state.round)) {
      return reject("You can only vote for someone playing this round.");
    }
    const next: MostLikelyToState = { ...state, votes: { ...state.votes, [playerId]: target.id } };
    return allVoted(next) ? startReveal(next, now) : next;
  },

  onPlayerJoined(state, player) {
    if (state.finishedAt !== null) return state;
    const known = state.players.find((p) => p.id === player.id);
    if (known) {
      // Back after leaving: in again straight away, able to vote if this round's vote is open.
      return {
        ...state,
        players: state.players.map((p) => (p.id === player.id ? { ...p, left: false } : p)),
      };
    }
    // Before the first prompt a newcomer is straight in; otherwise from the next round.
    const joined: MostLikelyToPlayer = {
      id: player.id,
      nickname: player.nickname,
      left: false,
      inFrom: state.phase === "countdown" ? state.round : state.round + 1,
    };
    return { ...state, players: [...state.players, joined] };
  },

  onPlayerLeft(state, playerId, now) {
    if (state.finishedAt !== null) return state;
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    // An open vote forgets theirs and every vote for them; a revealed round stands as counted.
    const votes = state.phase === "reveal" ? state.votes : dropVotes(state.votes, playerId);
    const next: MostLikelyToState = { ...state, players, votes };
    if (active(next).length === 0) return { ...next, finishedAt: now };
    // The vote can still close on everyone else's.
    if (next.phase === "vote" && allVoted(next)) return startReveal(next, now);
    return next;
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    if (state.phase === "countdown") {
      return now >= state.voteStartsAt ? { ...state, phase: "vote" } : state;
    }
    if (state.phase === "vote") {
      if (now < state.voteEndsAt && !allVoted(state)) return state;
      return startReveal(state, now);
    }
    if (state.revealEndsAt === null || now < state.revealEndsAt) return state;
    const next = state.round + 1;
    if (next >= state.prompts.length) return { ...state, finishedAt: now, revealEndsAt: null };
    return beginVote(state, next, now);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    if (state.phase === "countdown") return state.voteStartsAt;
    if (state.phase === "vote") return state.voteEndsAt;
    return state.revealEndsAt;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: state.settings.pack,
      difficulty: null,
      mode: null,
      rounds: state.results.length,
      players: stayed.map((s) => ({
        playerId: s.playerId,
        // Equal points share the placing, so a tie at the top is a shared win.
        placing: 1 + stayed.filter((o) => o.points > s.points).length,
        score: s.points,
        correct: s.reads,
      })),
    };
  },

  viewFor,
};
