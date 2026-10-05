import { z } from "zod";
import { seededRng } from "../../random";
import type { GameModule, Rejection } from "../types";
import {
  DEFAULT_REACTION_SETTINGS,
  reactionSettingsSchema,
  type ReactionSettings,
} from "./settings";

/**
 * Reaction: WAIT… then TAP! Every round the same signal reaches everyone at the same server
 * moment (the client reveals it against its clock offset, as the quiz's first question does);
 * the fastest legitimate tap wins the round. A tap before the signal is a false start and costs
 * the round; nobody who misses the window scores for it. Everyone plays every round together,
 * so the room's tick drives the countdown, the window and the pause between rounds.
 */

/** "Get ready" before each round, the same moment for everyone. */
export const REACTION_COUNTDOWN_MS = 3000;
/** How long a round's times stay up before the next round gets ready. */
export const REACTION_PAUSE_MS = 3000;
/** The wait after the countdown, in milliseconds: never instant, never guessable. */
const WAIT_MIN_MS = 1500;
const WAIT_MAX_MS = 4000;
/**
 * A tap this long before the signal is a false start. The client reveals the signal from its
 * own estimate of the server clock, so a little slack keeps an honest fast tap honest.
 */
export const EARLY_TOLERANCE_MS = 100;
/**
 * How much slower than the server's own measurement a client may claim to have reacted: the
 * network delay on a slow connection, without allowing impossible times.
 */
export const NETWORK_ALLOWANCE_MS = 250;
/**
 * The server keeps the window open this long past its end, so a tap made in time still lands
 * after the network's round trip. The client locks the pad at the window itself.
 */
const ARRIVAL_GRACE_MS = 400;

export const reactionActionSchema = z.object({
  type: z.literal("tap"),
  /** Milliseconds from the signal to the tap, measured on the player's own screen. */
  clientElapsedMs: z.number(),
});

export type ReactionAction = z.infer<typeof reactionActionSchema>;

/** One round for one player: their time, a false start, or nothing at all. */
export interface ReactionRecord {
  /** The reaction time credited for the round, or null if they never tapped legitimately. */
  ms: number | null;
  falseStart: boolean;
}

interface ReactionPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** The first round this player takes part in. Late joiners start on the next round. */
  inFrom: number;
  /** By round index. */
  records: (ReactionRecord | null)[];
}

export interface ReactionState {
  settings: ReactionSettings;
  players: ReactionPlayer[];
  round: number;
  /** Countdown to the round, the wait for the signal, or the times after it. */
  phase: "countdown" | "wait" | "result";
  /** When the countdown ends and the wait begins. */
  roundStartsAt: number;
  /** When the pad lights up. */
  signalAt: number;
  /** When the server closes the round's window (grace included). */
  roundEndsAt: number;
  /** When the times move on. Null outside the result phase. */
  resultEndsAt: number | null;
  /** The wait after the countdown for each round, from the room's seed. */
  delays: number[];
  finishedAt: number | null;
}

export interface ReactionStanding {
  playerId: string;
  nickname: string;
  rank: number;
  /** Their total time across the rounds they played, misses as the full window. */
  totalMs: number;
  /** Where they rank: their average round, so a late joiner isn't judged on rounds they never
   * played. Null until they have a record. */
  avgMs: number | null;
  /** Points for the history: the window off every round's time, bottomed at zero. */
  points: number;
  /** The fastest tap they got away with, or null if they never had one. */
  bestMs: number | null;
  /** Rounds they have a record for. */
  played: number;
  falseStarts: number;
  left: boolean;
}

/** One round's times, fastest first, for the result screen. */
export interface ReactionRoundTime {
  playerId: string;
  ms: number | null;
  falseStart: boolean;
}

export type ReactionStage =
  | { kind: "countdown"; round: number; startsAt: number; signalAt: number }
  | { kind: "wait"; round: number; signalAt: number; endsAt: number }
  | { kind: "result"; round: number; endsAt: number; times: ReactionRoundTime[] }
  /** Joined mid-round: they're in from the next one. */
  | { kind: "queued" }
  | { kind: "watching" }
  | { kind: "done" };

export interface ReactionView {
  game: "reaction";
  rounds: number;
  windowMs: number;
  stage: ReactionStage;
  /** This player's record for the current round, once they have one. */
  myTap: ReactionRecord | null;
  me: ReactionStanding | null;
  standings: ReactionStanding[];
  playerCount: number;
  final: boolean;
}

const reject = (message: string): Rejection => ({ rejected: message });

const windowMsOf = (state: ReactionState) => state.settings.tapSeconds * 1000;

const active = (state: ReactionState) => state.players.filter((p) => !p.left);

/** Taking part in this round: in the game, and joined before it started. */
const inRound = (p: ReactionPlayer, round: number) => !p.left && p.inFrom <= round;

function withRecord(p: ReactionPlayer, round: number, record: ReactionRecord): ReactionPlayer {
  const records = [...p.records];
  records[round] = record;
  return { ...p, records };
}

const recordOf = (p: ReactionPlayer, round: number): ReactionRecord | null =>
  p.records[round] ?? null;

/** Every player still in has tapped (or false-started) this round. */
const allTapped = (state: ReactionState) =>
  active(state).every((p) => p.inFrom > state.round || !!recordOf(p, state.round));

/** The round is over: give anyone still without a record the window they never used. */
function startResult(state: ReactionState, at: number): ReactionState {
  const players = state.players.map((p) =>
    inRound(p, state.round) && !recordOf(p, state.round)
      ? withRecord(p, state.round, { ms: null, falseStart: false })
      : p,
  );
  return { ...state, players, phase: "result", resultEndsAt: at + REACTION_PAUSE_MS };
}

/** The round's countdown starts at `startsAt`, with its wait and window worked out. */
function beginRound(state: ReactionState, round: number, startsAt: number): ReactionState {
  const delay = state.delays[round] ?? WAIT_MIN_MS;
  return {
    ...state,
    round,
    phase: "countdown",
    roundStartsAt: startsAt,
    signalAt: startsAt + delay,
    roundEndsAt: startsAt + delay + windowMsOf(state) + ARRIVAL_GRACE_MS,
    resultEndsAt: null,
  };
}

/** Points for a round: the window less their time, so a miss or a false start scores nothing. */
const pointsOf = (record: ReactionRecord | null, windowMs: number) =>
  Math.max(0, windowMs - (record?.ms ?? windowMs));

// Views ------------------------------------------------------------------------------------

/** Everyone, best first: the lowest average round, misses counting as the full window. */
export function standingsOf(state: ReactionState): ReactionStanding[] {
  const windowMs = windowMsOf(state);
  const totals = new Map<
    string,
    Omit<ReactionStanding, "playerId" | "nickname" | "rank" | "left">
  >();
  for (const p of state.players) {
    const total: Omit<ReactionStanding, "playerId" | "nickname" | "rank" | "left"> = {
      totalMs: 0,
      avgMs: null,
      points: 0,
      bestMs: null,
      played: 0,
      falseStarts: 0,
    };
    for (let round = 0; round < state.settings.rounds; round++) {
      const record = recordOf(p, round);
      if (!record) continue;
      total.played++;
      total.totalMs += record.ms ?? windowMs;
      total.points += pointsOf(record, windowMs);
      if (record.falseStart) total.falseStarts++;
      else if (record.ms !== null)
        total.bestMs = total.bestMs === null ? record.ms : Math.min(total.bestMs, record.ms);
    }
    if (total.played > 0) total.avgMs = total.totalMs / total.played;
    totals.set(p.id, total);
  }
  const rows = [...state.players].sort((a, b) => {
    const ta = totals.get(a.id)!;
    const tb = totals.get(b.id)!;
    return (
      Number(a.left) - Number(b.left) ||
      Number(ta.avgMs === null) - Number(tb.avgMs === null) ||
      (ta.avgMs ?? Number.MAX_SAFE_INTEGER) - (tb.avgMs ?? Number.MAX_SAFE_INTEGER) ||
      (ta.bestMs ?? Number.MAX_SAFE_INTEGER) - (tb.bestMs ?? Number.MAX_SAFE_INTEGER) ||
      a.nickname.localeCompare(b.nickname)
    );
  });
  return rows.map((p, i) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    ...totals.get(p.id)!,
    left: p.left,
  }));
}

function viewFor(state: ReactionState, playerId: string): ReactionView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const me = standings.find((s) => s.playerId === playerId) ?? null;
  const windowMs = windowMsOf(state);

  let stage: ReactionStage;
  if (state.finishedAt !== null) {
    stage = { kind: "done" };
  } else if (!player || player.left) {
    stage = { kind: "watching" };
  } else if (player.inFrom > state.round) {
    stage = { kind: "queued" };
  } else if (state.phase === "countdown") {
    stage = {
      kind: "countdown",
      round: state.round,
      startsAt: state.roundStartsAt,
      signalAt: state.signalAt,
    };
  } else if (state.phase === "wait") {
    stage = {
      kind: "wait",
      round: state.round,
      signalAt: state.signalAt,
      endsAt: state.signalAt + windowMs,
    };
  } else {
    const times = state.players
      .filter((p) => inRound(p, state.round) && recordOf(p, state.round))
      .map((p) => {
        const record = recordOf(p, state.round)!;
        return { playerId: p.id, ms: record.ms, falseStart: record.falseStart };
      })
      .sort(
        (a, b) =>
          (a.ms ?? Number.MAX_SAFE_INTEGER) - (b.ms ?? Number.MAX_SAFE_INTEGER) ||
          Number(b.falseStart) - Number(a.falseStart),
      );
    stage = { kind: "result", round: state.round, endsAt: state.resultEndsAt ?? 0, times };
  }

  return {
    game: "reaction",
    rounds: state.settings.rounds,
    windowMs,
    stage,
    myTap: player && !player.left ? recordOf(player, state.round) : null,
    me,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
  };
}

// Module ----------------------------------------------------------------------------------

export const reactionGame: GameModule<
  ReactionSettings,
  unknown,
  ReactionState,
  ReactionAction,
  ReactionView
> = {
  id: "reaction",
  name: "Reaction",
  minPlayers: 1,
  maxPlayers: 20,
  settingsSchema: reactionSettingsSchema,
  defaultSettings: DEFAULT_REACTION_SETTINGS,
  actionSchema: reactionActionSchema,

  // Every wait comes from the room's seed; nothing comes from the content bank.
  contentNeeded: () => null,

  setup({ settings, players, seed, now }) {
    const rng = seededRng(seed);
    const delays = Array.from({ length: settings.rounds }, () =>
      Math.round(WAIT_MIN_MS + rng() * (WAIT_MAX_MS - WAIT_MIN_MS)),
    );
    const state: ReactionState = {
      settings,
      players: players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        left: false,
        inFrom: 0,
        records: Array.from({ length: settings.rounds }, () => null),
      })),
      round: 0,
      phase: "countdown",
      roundStartsAt: now + REACTION_COUNTDOWN_MS,
      signalAt: 0,
      roundEndsAt: 0,
      resultEndsAt: null,
      delays,
      finishedAt: null,
    };
    return beginRound(state, 0, now + REACTION_COUNTDOWN_MS);
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return reject("The game is over.");
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return reject("You're watching this game.");
    if (player.inFrom > state.round) return reject("You're in from the next round.");
    if (state.phase === "result") return reject("That round is over.");
    if (recordOf(player, state.round)) return reject("You've already tapped.");

    // Too soon is a false start and costs the round; anything else is a reaction to time.
    const falseStart = now < state.signalAt - EARLY_TOLERANCE_MS;
    const serverMs = Math.max(0, now - state.signalAt);
    const floor = Math.max(0, serverMs - NETWORK_ALLOWANCE_MS);
    const ms = falseStart ? null : Math.min(Math.max(action.clientElapsedMs, floor), serverMs);
    const next: ReactionState = {
      ...state,
      players: state.players.map((p) =>
        p.id === playerId ? withRecord(p, state.round, { ms, falseStart }) : p,
      ),
    };
    // The round ends as soon as everyone still in has tapped.
    return allTapped(next) ? startResult(next, now) : next;
  },

  onPlayerJoined(state, player) {
    if (state.finishedAt !== null) return state;
    const known = state.players.find((p) => p.id === player.id);
    if (known) {
      // Back after leaving. A round already on without their tap is one they missed.
      const missed =
        state.phase !== "countdown" && known.inFrom <= state.round && !recordOf(known, state.round);
      const restored: ReactionPlayer = {
        ...known,
        left: false,
        records: missed
          ? [...known.records].map((r, i) =>
              i === state.round ? { ms: null, falseStart: false } : r,
            )
          : known.records,
      };
      return { ...state, players: state.players.map((p) => (p.id === player.id ? restored : p)) };
    }
    // Mid-round, a newcomer waits for the next one; in the countdown they're straight in.
    const joined: ReactionPlayer = {
      id: player.id,
      nickname: player.nickname,
      left: false,
      inFrom: state.phase === "countdown" ? state.round : state.round + 1,
      records: Array.from({ length: state.settings.rounds }, () => null),
    };
    return { ...state, players: [...state.players, joined] };
  },

  onPlayerLeft(state, playerId, now) {
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    const next: ReactionState = { ...state, players };
    if (active(next).length === 0) return { ...next, finishedAt: now };
    // The round can still end on everyone else's taps.
    if (next.phase !== "result" && allTapped(next)) return startResult(next, now);
    return next;
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    if (state.phase === "countdown") {
      return now >= state.roundStartsAt ? { ...state, phase: "wait" } : state;
    }
    if (state.phase === "wait") {
      return now >= state.roundEndsAt ? startResult(state, now) : state;
    }
    if (state.resultEndsAt === null || now < state.resultEndsAt) return state;
    const next = state.round + 1;
    if (next >= state.settings.rounds) return { ...state, finishedAt: now, resultEndsAt: null };
    return beginRound(state, next, now + REACTION_COUNTDOWN_MS);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    if (state.phase === "countdown") return state.roundStartsAt;
    if (state.phase === "wait") return state.roundEndsAt;
    return state.resultEndsAt;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    const rounds = state.settings.rounds;
    return {
      category: null,
      difficulty: null,
      mode: null,
      rounds,
      players: stayed.map((s, i) => ({
        playerId: s.playerId,
        placing: i + 1,
        // Scaled to a whole game, so a late joiner's score reads like everyone else's.
        score: s.played > 0 ? Math.round((s.points / s.played) * rounds) : 0,
        correct: null,
      })),
    };
  },

  viewFor,
};
