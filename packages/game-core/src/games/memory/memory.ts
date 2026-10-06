import { z } from "zod";
import { seededRng } from "../../random";
import type { GameModule, Rejection } from "../types";
import { DEFAULT_MEMORY_SETTINGS, memorySettingsSchema, type MemorySettings } from "./settings";

/**
 * Memory: everyone sees the same set of items for the same server-timed moment, then the
 * question comes — which item was NOT shown, what was in position 4, how many animals? The
 * reveal and the question are timed by room's tick, so every screen shows the items for exactly
 * as long, and a right answer scores more the faster it arrives. Everything (the sets, the
 * questions and their order) is generated from the room's seed, so no content bank is needed.
 */

/** "Get ready" before each round, the same moment for everyone. */
export const MEMORY_COUNTDOWN_MS = 3000;
/** How long a question stays open: the window every answer's speed is measured against. */
export const MEMORY_ANSWER_MS = 10_000;
/** How long the right answer and everyone's answers stay up. */
export const MEMORY_RESULT_MS = 3000;
/**
 * A client may count its answer this much faster than the server measured it: the network
 * delay on a slow connection, without allowing impossible times (as the quiz allows).
 */
export const MEMORY_ANSWER_ALLOWANCE_MS = 1500;
/** Items on screen each round. */
export const MEMORY_SET_SIZE = 6;
/** Points for a right answer: the full window scores the floor, an instant answer the top. */
const POINTS_MIN = 500;
const POINTS_MAX = 1000;

export const memoryActionSchema = z.object({
  type: z.literal("answer"),
  /** Which choice was picked, by its index in the question's choices. */
  choice: z.number().int(),
  /** Milliseconds from the question appearing to the answer, measured on the player's screen. */
  clientElapsedMs: z.number(),
});

export type MemoryAction = z.infer<typeof memoryActionSchema>;

/** What one round asked, generated from the room's seed before the game starts. */
export type MemoryQuestionType = "gone" | "position" | "count";

export type MemoryKind = "animals" | "fruits" | "instruments" | "vehicles";

export interface MemoryItem {
  id: string;
  emoji: string;
  name: string;
  /** Which count question asks about it: "How many animals…". */
  kind: MemoryKind;
}

/** One round: the items that were shown and the question about them. */
export interface MemoryRound {
  /** The items on screen, in order (positions 1 to 6). */
  items: MemoryItem[];
  type: MemoryQuestionType;
  /** What everyone reads once the items are gone. */
  question: string;
  /** The choices as they read: "🐱 Cat", or "3". */
  choices: string[];
  correct: number;
}

/** One round for one player: their answer, or nothing if they never gave one. */
export interface MemoryRecord {
  /** The choice they picked, or null if the round passed without one. */
  choice: number | null;
  correct: boolean;
  /** How long the answer took on their screen, or null if they never answered. */
  usedMs: number | null;
  points: number;
}

interface MemoryPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** The first round this player takes part in. Late joiners start on the next round. */
  inFrom: number;
  /** By round index. */
  records: (MemoryRecord | null)[];
}

export interface MemoryState {
  settings: MemorySettings;
  players: MemoryPlayer[];
  round: number;
  /** Countdown to the round, the reveal, the question, or the answers after it. */
  phase: "countdown" | "reveal" | "question" | "result";
  /** When the countdown ends and the items appear. */
  roundStartsAt: number;
  /** When the items go and the question appears. */
  questionStartsAt: number;
  /** When the question closes without everyone having answered. */
  questionEndsAt: number;
  /** When the answers move on. Null outside the result phase. */
  resultEndsAt: number | null;
  /** Every round's set and question, from the room's seed. */
  rounds: MemoryRound[];
  finishedAt: number | null;
}

export interface MemoryStanding {
  playerId: string;
  nickname: string;
  rank: number;
  /** Points across the rounds they played. */
  points: number;
  /** Right answers across the rounds they played. */
  correct: number;
  /** Total answer time, for drawing level scores apart. */
  totalMs: number;
  /** Rounds they have a record for. */
  played: number;
  left: boolean;
}

/** One player's answer as the result screen shows it. */
export interface MemoryAnswer {
  playerId: string;
  choice: number | null;
  correct: boolean;
  /** What it scored: its speed bonus, or 0 for wrong and unanswered. */
  points: number;
}

export type MemoryStage =
  | { kind: "countdown"; round: number; startsAt: number; endsAt: number; items: MemoryItem[] }
  | { kind: "reveal"; round: number; startsAt: number; endsAt: number; items: MemoryItem[] }
  | {
      kind: "question";
      round: number;
      question: string;
      choices: string[];
      startsAt: number;
      deadline: number;
    }
  | {
      kind: "result";
      round: number;
      question: string;
      choices: string[];
      correct: number;
      endsAt: number;
      answers: MemoryAnswer[];
    }
  /** Joined mid-round: they're in from the next one. */
  | { kind: "queued" }
  | { kind: "watching" }
  | { kind: "done" };

export interface MemoryView {
  game: "memory";
  rounds: number;
  /** Seconds the items stay on screen, for the reveal's timer. */
  revealMs: number;
  stage: MemoryStage;
  /** This player's answer for the current round, once they have one. */
  myAnswer: MemoryRecord | null;
  me: MemoryStanding | null;
  standings: MemoryStanding[];
  playerCount: number;
  final: boolean;
}

const reject = (message: string): Rejection => ({ rejected: message });

// The items -----------------------------------------------------------------------------

const KIND_PLURALS: readonly MemoryKind[] = ["animals", "fruits", "instruments", "vehicles"];

const ITEMS: (MemoryItem & { kind: MemoryKind })[] = [
  { id: "cat", emoji: "🐱", name: "Cat", kind: "animals" },
  { id: "parrot", emoji: "🦜", name: "Parrot", kind: "animals" },
  { id: "dog", emoji: "🐶", name: "Dog", kind: "animals" },
  { id: "rabbit", emoji: "🐰", name: "Rabbit", kind: "animals" },
  { id: "apple", emoji: "🍎", name: "Apple", kind: "fruits" },
  { id: "banana", emoji: "🍌", name: "Banana", kind: "fruits" },
  { id: "grapes", emoji: "🍇", name: "Grapes", kind: "fruits" },
  { id: "strawberry", emoji: "🍓", name: "Strawberry", kind: "fruits" },
  { id: "guitar", emoji: "🎸", name: "Guitar", kind: "instruments" },
  { id: "piano", emoji: "🎹", name: "Piano", kind: "instruments" },
  { id: "drum", emoji: "🥁", name: "Drum", kind: "instruments" },
  { id: "trumpet", emoji: "🎺", name: "Trumpet", kind: "instruments" },
  { id: "car", emoji: "🚗", name: "Car", kind: "vehicles" },
  { id: "bus", emoji: "🚌", name: "Bus", kind: "vehicles" },
  { id: "bike", emoji: "🚲", name: "Bike", kind: "vehicles" },
  { id: "boat", emoji: "⛵", name: "Boat", kind: "vehicles" },
];

/** Fisher–Yates with the round's rng, on a copy. */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const label = (item: { emoji: string; name: string }) => `${item.emoji} ${item.name}`;

/** One round's set and question, from the room's seed. The question type turns by round. */
function makeRound(rng: () => number, round: number): MemoryRound {
  const items = shuffled(ITEMS, rng).slice(0, MEMORY_SET_SIZE);
  const type: MemoryQuestionType = (["gone", "position", "count"] as const)[round % 3]!;

  if (type === "gone") {
    const absent = shuffled(
      ITEMS.filter((i) => !items.some((shown) => shown.id === i.id)),
      rng,
    )[0]!;
    const shown = shuffled(items, rng).slice(0, 3);
    const choices = shuffled([absent, ...shown], rng);
    return {
      items,
      type,
      question: "Which one was NOT shown?",
      choices: choices.map(label),
      correct: choices.findIndex((c) => c.id === absent.id),
    };
  }

  if (type === "position") {
    const at = Math.floor(rng() * items.length);
    const answer = items[at]!;
    const distractors = shuffled(
      items.filter((i) => i.id !== answer.id),
      rng,
    ).slice(0, 3);
    const choices = shuffled([answer, ...distractors], rng);
    return {
      items,
      type,
      question: `What was in position ${at + 1}?`,
      choices: choices.map(label),
      correct: choices.findIndex((c) => c.id === answer.id),
    };
  }

  const present = KIND_PLURALS.filter((kind) => items.some((i) => i.kind === kind));
  const kind = present[Math.floor(rng() * present.length)]!;
  const count = items.filter((i) => i.kind === kind).length;
  const numbers = [count];
  for (const n of shuffled(
    [0, 1, 2, 3, 4, 5, 6].filter((n) => n !== count),
    rng,
  )) {
    if (numbers.length === 4) break;
    numbers.push(n);
  }
  const choices = shuffled(numbers, rng);
  return {
    items,
    type,
    question: `How many ${kind} did you see?`,
    choices: choices.map(String),
    correct: choices.indexOf(count),
  };
}

// Rounds ---------------------------------------------------------------------------------

const active = (state: MemoryState) => state.players.filter((p) => !p.left);

/** Taking part in this round: in the game, and joined before it started. */
const inRound = (p: MemoryPlayer, round: number) => !p.left && p.inFrom <= round;

const recordOf = (p: MemoryPlayer, round: number): MemoryRecord | null => p.records[round] ?? null;

function withRecord(p: MemoryPlayer, round: number, record: MemoryRecord): MemoryPlayer {
  const records = [...p.records];
  records[round] = record;
  return { ...p, records };
}

/** The round ends as soon as everyone still in has answered. */
const allAnswered = (state: MemoryState) =>
  active(state).every((p) => p.inFrom > state.round || !!recordOf(p, state.round));

function startResult(state: MemoryState, at: number): MemoryState {
  return { ...state, phase: "result", resultEndsAt: at + MEMORY_RESULT_MS };
}

function beginRound(state: MemoryState, round: number, startsAt: number): MemoryState {
  return {
    ...state,
    round,
    phase: "countdown",
    roundStartsAt: startsAt,
    questionStartsAt: startsAt + state.settings.revealSeconds * 1000,
    questionEndsAt: startsAt + state.settings.revealSeconds * 1000 + MEMORY_ANSWER_MS,
    resultEndsAt: null,
  };
}

export function standingsOf(state: MemoryState): MemoryStanding[] {
  const totals = new Map<string, Omit<MemoryStanding, "playerId" | "nickname" | "rank" | "left">>();
  for (const p of state.players) {
    const total = { points: 0, correct: 0, totalMs: 0, played: 0 };
    for (let round = 0; round < state.settings.rounds; round++) {
      const record = recordOf(p, round);
      if (!record) continue;
      total.played++;
      total.points += record.points;
      if (record.correct) total.correct++;
      total.totalMs += record.usedMs ?? MEMORY_ANSWER_MS;
    }
    totals.set(p.id, total);
  }
  const rows = [...state.players].sort((a, b) => {
    const ta = totals.get(a.id)!;
    const tb = totals.get(b.id)!;
    return (
      Number(a.left) - Number(b.left) ||
      tb.points - ta.points ||
      tb.correct - ta.correct ||
      ta.totalMs - tb.totalMs ||
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

function viewFor(state: MemoryState, playerId: string): MemoryView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = standingsOf(state);
  const me = standings.find((s) => s.playerId === playerId) ?? null;
  const revealMs = state.settings.revealSeconds * 1000;
  const round = state.rounds[state.round]!;

  let stage: MemoryStage;
  if (state.finishedAt !== null) {
    stage = { kind: "done" };
  } else if (!player || player.left) {
    stage = { kind: "watching" };
  } else if (player.inFrom > state.round) {
    stage = { kind: "queued" };
  } else if (state.phase === "countdown") {
    // The items ride along with the countdown, so each screen shows them at `startsAt` on its
    // own clock, exactly together (as the quiz reveals its first question). Both stages carry
    // the full window, so the screen keeps running on its own clock when the server confirms it.
    stage = {
      kind: "countdown",
      round: state.round,
      startsAt: state.roundStartsAt,
      endsAt: state.questionStartsAt,
      items: round.items,
    };
  } else if (state.phase === "reveal") {
    stage = {
      kind: "reveal",
      round: state.round,
      startsAt: state.roundStartsAt,
      endsAt: state.questionStartsAt,
      items: round.items,
    };
  } else if (state.phase === "question") {
    stage = {
      kind: "question",
      round: state.round,
      question: round.question,
      choices: round.choices,
      startsAt: state.questionStartsAt,
      deadline: state.questionEndsAt,
    };
  } else {
    stage = {
      kind: "result",
      round: state.round,
      question: round.question,
      choices: round.choices,
      correct: round.correct,
      endsAt: state.resultEndsAt ?? 0,
      answers: state.players
        .filter((p) => inRound(p, state.round))
        .map((p) => {
          const record = recordOf(p, state.round);
          return {
            playerId: p.id,
            choice: record?.choice ?? null,
            correct: record?.correct ?? false,
            points: record?.points ?? 0,
          };
        }),
    };
  }

  return {
    game: "memory",
    rounds: state.settings.rounds,
    revealMs,
    stage,
    myAnswer: player && !player.left ? recordOf(player, state.round) : null,
    me,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
  };
}

// Module ---------------------------------------------------------------------------------

export const memoryGame: GameModule<
  MemorySettings,
  unknown,
  MemoryState,
  MemoryAction,
  MemoryView
> = {
  id: "memory",
  name: "Memory",
  minPlayers: 1,
  maxPlayers: 12,
  settingsSchema: memorySettingsSchema,
  defaultSettings: DEFAULT_MEMORY_SETTINGS,
  actionSchema: memoryActionSchema,

  // Every set and question comes from the room's seed; nothing comes from the content bank.
  contentNeeded: () => null,

  setup({ settings, players, seed, now }) {
    const rng = seededRng(seed);
    const state: MemoryState = {
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
      roundStartsAt: now + MEMORY_COUNTDOWN_MS,
      questionStartsAt: 0,
      questionEndsAt: 0,
      resultEndsAt: null,
      rounds: Array.from({ length: settings.rounds }, (_, round) => makeRound(rng, round)),
      finishedAt: null,
    };
    return beginRound(state, 0, now + MEMORY_COUNTDOWN_MS);
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return reject("The game is over.");
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return reject("You're watching this game.");
    if (player.inFrom > state.round) return reject("You're in from the next round.");
    if (state.phase !== "question") return reject("That question is over.");
    if (recordOf(player, state.round)) return reject("You've already answered.");

    const question = state.rounds[state.round]!;
    if (action.choice < 0 || action.choice >= question.choices.length) {
      return reject("That isn't one of the choices.");
    }

    // The client measures on its own screen; the server clamps it to what could have happened.
    const correct = action.choice === question.correct;
    const serverMs = Math.max(0, now - state.questionStartsAt);
    const floor = Math.max(0, serverMs - MEMORY_ANSWER_ALLOWANCE_MS);
    const usedMs = Math.min(Math.max(action.clientElapsedMs, floor), serverMs);
    const speed = 1 - Math.min(usedMs, MEMORY_ANSWER_MS) / MEMORY_ANSWER_MS;
    const record: MemoryRecord = {
      choice: action.choice,
      correct,
      usedMs,
      points: correct ? POINTS_MIN + Math.round((POINTS_MAX - POINTS_MIN) * speed) : 0,
    };
    const next: MemoryState = {
      ...state,
      players: state.players.map((p) =>
        p.id === playerId ? withRecord(p, state.round, record) : p,
      ),
    };
    return allAnswered(next) ? startResult(next, now) : next;
  },

  onPlayerJoined(state, player) {
    if (state.finishedAt !== null) return state;
    const known = state.players.find((p) => p.id === player.id);
    if (known) {
      // Back after leaving. A round already on without their answer is one they missed.
      const missed =
        state.phase !== "countdown" && known.inFrom <= state.round && !recordOf(known, state.round);
      const restored: MemoryPlayer = {
        ...known,
        left: false,
        records: missed
          ? [...known.records].map((r, i) =>
              i === state.round ? { choice: null, correct: false, usedMs: null, points: 0 } : r,
            )
          : known.records,
      };
      return { ...state, players: state.players.map((p) => (p.id === player.id ? restored : p)) };
    }
    // Mid-round, a newcomer waits for the next one; in the countdown they're straight in.
    const joined: MemoryPlayer = {
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
    const next: MemoryState = { ...state, players };
    if (active(next).length === 0) return { ...next, finishedAt: now };
    // The round can still end on everyone else's answers.
    if (next.phase !== "result" && allAnswered(next)) return startResult(next, now);
    return next;
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    if (state.phase === "countdown") {
      return now >= state.roundStartsAt ? { ...state, phase: "reveal" } : state;
    }
    if (state.phase === "reveal") {
      return now >= state.questionStartsAt ? { ...state, phase: "question" } : state;
    }
    if (state.phase === "question") {
      if (now < state.questionEndsAt && !allAnswered(state)) return state;
      return startResult(state, now);
    }
    if (state.resultEndsAt === null || now < state.resultEndsAt) return state;
    const next = state.round + 1;
    if (next >= state.settings.rounds) return { ...state, finishedAt: now, resultEndsAt: null };
    return beginRound(state, next, now + MEMORY_COUNTDOWN_MS);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    if (state.phase === "countdown") return state.roundStartsAt;
    if (state.phase === "reveal") return state.questionStartsAt;
    if (state.phase === "question") return state.questionEndsAt;
    return state.resultEndsAt;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: null,
      difficulty: null,
      mode: null,
      rounds: state.settings.rounds,
      players: stayed.map((s, i) => ({
        playerId: s.playerId,
        placing: i + 1,
        score: s.points,
        correct: s.correct,
      })),
    };
  },

  viewFor,
};
