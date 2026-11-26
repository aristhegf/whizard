import { z } from "zod";
import { creditedElapsed } from "../quiz/scoring";
import type { GameModule, Rejection } from "../types";
import {
  DEFAULT_HOW_WELL_SETTINGS,
  howWellSettingsSchema,
  type HowWellContentRequest,
  type HowWellPack,
  type HowWellQuestion,
  type HowWellSettings,
} from "./settings";

/**
 * How Well Do You Know Me?: each round puts one player in the spotlight — the subject — and asks
 * a multiple-choice question about them ("What's {name}'s ideal Saturday?"). The subject picks
 * their true answer in private while everyone else guesses what they picked, all against the
 * same clock. Then the reveal: the subject's answer and who guessed it. Right guesses score (a
 * little more the faster they came), and the subject scores for everyone who knew them.
 *
 * The subject turns in seat order, so everyone gets their turn before anyone has a second one.
 * Questions come from the content bank, one pack per game, drawn from the room's seed.
 */

/** "Get ready" before each round: who is in the spotlight, the same moment for everyone. */
export const HOW_WELL_INTRO_MS = 3000;
/** How long the subject's answer and everyone's guesses stay up. */
export const HOW_WELL_REVEAL_MS = 6000;
/** A right guess: the whole window scores the floor, an instant one the top. */
export const HOW_WELL_GUESS_POINTS_MIN = 750;
export const HOW_WELL_GUESS_POINTS_MAX = 1000;
/** What the subject scores for each player who guessed their answer. */
export const HOW_WELL_KNOWN_POINTS = 500;
/** Fewer players than this left in the game and it ends: there's nobody to guess. */
export const HOW_WELL_MIN_PLAYERS = 2;

export const howWellActionSchema = z.object({
  type: z.literal("answer"),
  /** Which choice was picked, by its index in the question's choices. */
  choice: z.number().int(),
  /** Milliseconds from the question opening to the answer, measured on the player's screen. */
  clientElapsedMs: z.number(),
});

export type HowWellAction = z.infer<typeof howWellActionSchema>;

/**
 * How a round ended: the subject answered, the subject's time ran out (the round is void), or
 * the subject left the game mid-round (void too).
 */
export type HowWellOutcome = "answered" | "no-answer" | "subject-left";

/** One pick: the subject's own answer, or a guess at it. */
export interface HowWellPick {
  choice: number;
  /** How long it took on the player's screen, as credited. */
  usedMs: number;
}

export interface HowWellRound {
  subjectId: string;
  question: HowWellQuestion;
  /** Everyone's pick so far, by player id. Never sent to anyone before the reveal. */
  picks: Record<string, HowWellPick>;
  /** Set once the round is over. */
  outcome: HowWellOutcome | null;
  /** Who was guessing when the round ended: everyone taking part but the subject. */
  guessers: string[];
  /** What the round scored, by player id, once it is over. */
  points: Record<string, number>;
}

interface HowWellPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** The first round this player takes part in. Late joiners start on the next round. */
  inFrom: number;
  /**
   * Turns in the spotlight counted as already had: someone who joins (or comes back) late
   * takes their place in the current cycle instead of having several turns in a row.
   */
  turnCredit: number;
}

export interface HowWellState {
  settings: HowWellSettings;
  /** In seat order: the order they joined. Players who leave stay in the list, marked. */
  players: HowWellPlayer[];
  /** One per round, drawn for the game. */
  questions: HowWellQuestion[];
  /** Rounds started so far; the last one is the current round. */
  history: HowWellRound[];
  phase: "intro" | "answer" | "reveal";
  /** When the question opens for answers. */
  answerStartsAt: number;
  /** When the question closes without everyone having answered. */
  answerEndsAt: number;
  /** When the reveal moves on. Null outside the reveal. */
  revealEndsAt: number | null;
  finishedAt: number | null;
}

export interface HowWellPerson {
  playerId: string;
  nickname: string;
}

export interface HowWellStanding extends HowWellPerson {
  rank: number;
  points: number;
  /** Right guesses about other players. */
  correct: number;
  /** Rounds they were guessing in, of those that weren't void. */
  guessed: number;
  /** Right guesses other players made about them. */
  known: number;
  /** Rounds they were the subject of. */
  turns: number;
  /** Total guessing time (the whole window for a guess never made), for drawing ties apart. */
  totalMs: number;
  left: boolean;
}

/** One guess as the reveal shows it. */
export interface HowWellGuess {
  playerId: string;
  /** null if they never guessed. */
  choice: number | null;
  correct: boolean;
  points: number;
}

/**
 * This player's part in the round: answering about themselves, guessing, or watching (they
 * joined mid-round and are in from the next one, or they are not in the game).
 */
export type HowWellRole = "subject" | "guesser" | "spectator";

interface HowWellQuestionStage {
  round: number;
  subject: HowWellPerson;
  role: HowWellRole;
  /** With `{name}` for the subject's nickname: see `fillName`. */
  prompt: string;
  choices: string[];
  /** When answers open and close. */
  startsAt: number;
  deadline: number;
  /** Everyone expected to answer this round, the subject included. */
  participants: string[];
  /** Who has answered so far, the subject included. Never what they picked. */
  answered: string[];
}

export type HowWellStage =
  /** Who's in the spotlight. The question rides along to open on every screen at `startsAt`. */
  | ({ kind: "intro" } & HowWellQuestionStage)
  | ({ kind: "answer" } & HowWellQuestionStage)
  | {
      kind: "reveal";
      round: number;
      subject: HowWellPerson;
      role: HowWellRole;
      prompt: string;
      choices: string[];
      outcome: HowWellOutcome;
      /** The subject's answer; null when the round is void. */
      answer: number | null;
      guesses: HowWellGuess[];
      /** What the subject scored: for each player who knew them. */
      subjectPoints: number;
      endsAt: number;
    }
  | { kind: "done" };

export interface HowWellView {
  game: "how-well";
  rounds: number;
  pack: HowWellPack;
  answerMs: number;
  stage: HowWellStage;
  /** This player's own pick in the current round, once they have made one. */
  myAnswer: HowWellPick | null;
  me: HowWellStanding | null;
  standings: HowWellStanding[];
  playerCount: number;
  final: boolean;
}

const reject = (message: string): Rejection => ({ rejected: message });

// Players and turns ------------------------------------------------------------------------

const active = (state: HowWellState) => state.players.filter((p) => !p.left);

/** Taking part in this round: in the game, and joined in time for it. */
const inRound = (p: HowWellPlayer, round: number) => !p.left && p.inFrom <= round;

const currentRound = (state: HowWellState): HowWellRound => state.history.at(-1)!;

const roundCount = (state: HowWellState) => Math.min(state.settings.rounds, state.questions.length);

function turnsHad(state: HowWellState, playerId: string): number {
  return state.history.filter((r) => r.subjectId === playerId).length;
}

/** Turns had, plus any counted for joining late. Lowest goes next. */
const turnScore = (state: HowWellState, p: HowWellPlayer) => turnsHad(state, p.id) + p.turnCredit;

/** The fewest turns anyone still in the game is counted as having had. */
function fewestTurns(state: HowWellState, except: string): number {
  const others = active(state).filter((p) => p.id !== except);
  return others.length === 0 ? 0 : Math.min(...others.map((p) => turnScore(state, p)));
}

/**
 * The next subject: whoever has had the fewest turns, and of them the first in seat order after
 * the last subject. With nobody coming or going it's plain seat order, round and round.
 */
function nextSubject(state: HowWellState, round: number): HowWellPlayer {
  const seats = state.players.length;
  const lastSeat = state.history.length
    ? state.players.findIndex((p) => p.id === currentRound(state).subjectId)
    : -1;
  const after = (p: HowWellPlayer) => (state.players.indexOf(p) - lastSeat - 1 + seats) % seats;
  return state.players
    .filter((p) => inRound(p, round))
    .sort((a, b) => turnScore(state, a) - turnScore(state, b) || after(a) - after(b))[0]!;
}

// Rounds -------------------------------------------------------------------------------------

function beginRound(state: HowWellState, round: number, now: number): HowWellState {
  const subject = nextSubject(state, round);
  const answerStartsAt = now + HOW_WELL_INTRO_MS;
  return {
    ...state,
    history: [
      ...state.history,
      {
        subjectId: subject.id,
        question: state.questions[round]!,
        picks: {},
        outcome: null,
        guessers: [],
        points: {},
      },
    ],
    phase: "intro",
    answerStartsAt,
    answerEndsAt: answerStartsAt + state.settings.answerSeconds * 1000,
    revealEndsAt: null,
  };
}

/** Everyone expected to answer this round: the subject and the guessers still in it. */
function participants(state: HowWellState): string[] {
  const round = state.history.length - 1;
  return state.players.filter((p) => inRound(p, round)).map((p) => p.id);
}

/** The round ends as soon as everyone taking part has answered. */
function allAnswered(state: HowWellState): boolean {
  const { picks } = currentRound(state);
  return participants(state).every((id) => id in picks);
}

/** A right guess scores more the faster it came. */
function guessPoints(usedMs: number, answerMs: number): number {
  const speed = 1 - Math.min(Math.max(usedMs / answerMs, 0), 1);
  return Math.round(
    HOW_WELL_GUESS_POINTS_MIN + (HOW_WELL_GUESS_POINTS_MAX - HOW_WELL_GUESS_POINTS_MIN) * speed,
  );
}

/** Ends the round: scores it and opens the reveal. */
function resolve(state: HowWellState, now: number, voided?: "subject-left"): HowWellState {
  const round = currentRound(state);
  const index = state.history.length - 1;
  const answer = round.picks[round.subjectId];
  const outcome: HowWellOutcome = voided ?? (answer ? "answered" : "no-answer");
  // Everyone who was guessing: those still in the round, and anyone who guessed and then left.
  const guessers = state.players
    .filter((p) => p.id !== round.subjectId)
    .filter((p) => inRound(p, index) || p.id in round.picks)
    .map((p) => p.id);
  const points: Record<string, number> = {};
  if (outcome === "answered") {
    let known = 0;
    for (const id of guessers) {
      const pick = round.picks[id];
      if (!pick || pick.choice !== answer!.choice) continue;
      known++;
      points[id] = guessPoints(pick.usedMs, state.settings.answerSeconds * 1000);
    }
    points[round.subjectId] = known * HOW_WELL_KNOWN_POINTS;
  }
  return {
    ...state,
    history: [...state.history.slice(0, -1), { ...round, outcome, guessers, points }],
    phase: "reveal",
    revealEndsAt: now + HOW_WELL_REVEAL_MS,
  };
}

/** Too few players left to carry on: the game ends where it is. */
const tooFew = (state: HowWellState) => active(state).length < HOW_WELL_MIN_PLAYERS;

// Standings ----------------------------------------------------------------------------------

export function standingsOf(state: HowWellState): HowWellStanding[] {
  const answerMs = state.settings.answerSeconds * 1000;
  const totals = new Map(
    state.players.map((p) => [
      p.id,
      { points: 0, correct: 0, guessed: 0, known: 0, turns: 0, totalMs: 0 },
    ]),
  );
  for (const round of state.history) {
    if (round.outcome === null) continue;
    totals.get(round.subjectId)!.turns++;
    for (const [id, points] of Object.entries(round.points)) totals.get(id)!.points += points;
    if (round.outcome !== "answered") continue;
    const answer = round.picks[round.subjectId]!.choice;
    for (const id of round.guessers) {
      const total = totals.get(id)!;
      const pick = round.picks[id];
      total.guessed++;
      total.totalMs += pick?.usedMs ?? answerMs;
      if (pick?.choice === answer) {
        total.correct++;
        totals.get(round.subjectId)!.known++;
      }
    }
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

// Views --------------------------------------------------------------------------------------

function stageFor(state: HowWellState, playerId: string): HowWellStage {
  const round = state.history.at(-1);
  if (state.finishedAt !== null || !round) return { kind: "done" };
  const player = state.players.find((p) => p.id === playerId);
  const index = state.history.length - 1;
  const subjectPlayer = state.players.find((p) => p.id === round.subjectId)!;
  const subject = { playerId: subjectPlayer.id, nickname: subjectPlayer.nickname };

  if (state.phase === "reveal") {
    const outcome = round.outcome!;
    const answer = outcome === "answered" ? round.picks[round.subjectId]!.choice : null;
    const role: HowWellRole =
      playerId === round.subjectId
        ? "subject"
        : round.guessers.includes(playerId)
          ? "guesser"
          : "spectator";
    return {
      kind: "reveal",
      round: index,
      subject,
      role,
      prompt: round.question.prompt,
      choices: round.question.choices,
      outcome,
      answer,
      guesses: round.guessers.map((id) => {
        const choice = round.picks[id]?.choice ?? null;
        return {
          playerId: id,
          choice,
          correct: answer !== null && choice === answer,
          points: round.points[id] ?? 0,
        };
      }),
      subjectPoints: round.points[round.subjectId] ?? 0,
      endsAt: state.revealEndsAt ?? 0,
    };
  }

  // Before the reveal only who has answered goes out: never the subject's answer or a guess.
  const taking = participants(state);
  return {
    kind: state.phase,
    round: index,
    subject,
    role:
      playerId === round.subjectId
        ? "subject"
        : player && inRound(player, index)
          ? "guesser"
          : "spectator",
    prompt: round.question.prompt,
    choices: round.question.choices,
    startsAt: state.answerStartsAt,
    deadline: state.answerEndsAt,
    participants: taking,
    answered: taking.filter((id) => id in round.picks),
  };
}

function viewFor(state: HowWellState, playerId: string): HowWellView {
  const standings = standingsOf(state);
  const round = state.history.at(-1);
  return {
    game: "how-well",
    rounds: roundCount(state),
    pack: state.settings.pack,
    answerMs: state.settings.answerSeconds * 1000,
    stage: stageFor(state, playerId),
    myAnswer: state.finishedAt === null ? (round?.picks[playerId] ?? null) : null,
    me: standings.find((s) => s.playerId === playerId) ?? null,
    standings,
    playerCount: state.players.length,
    final: state.finishedAt !== null,
  };
}

// Module -------------------------------------------------------------------------------------

export const howWellGame: GameModule<
  HowWellSettings,
  unknown,
  HowWellState,
  HowWellAction,
  HowWellView
> = {
  id: "how-well",
  name: "How Well Do You Know Me?",
  minPlayers: HOW_WELL_MIN_PLAYERS,
  maxPlayers: 20,
  settingsSchema: howWellSettingsSchema,
  defaultSettings: DEFAULT_HOW_WELL_SETTINGS,
  actionSchema: howWellActionSchema,

  contentNeeded: (settings): HowWellContentRequest => ({
    kind: "how-well-questions",
    pack: settings.pack,
    count: settings.rounds,
  }),

  setup({ settings, players, content, now }) {
    const questions = (content as HowWellQuestion[]).slice(0, settings.rounds);
    const state: HowWellState = {
      settings,
      players: players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        left: false,
        inFrom: 0,
        turnCredit: 0,
      })),
      questions,
      history: [],
      phase: "intro",
      answerStartsAt: 0,
      answerEndsAt: 0,
      revealEndsAt: null,
      finishedAt: null,
    };
    if (questions.length === 0 || tooFew(state)) return { ...state, finishedAt: now };
    return beginRound(state, 0, now);
  },

  onAction(state, playerId, action, now) {
    if (state.finishedAt !== null) return reject("The game is over.");
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.left) return reject("You're watching this game.");
    const index = state.history.length - 1;
    const round = currentRound(state);
    if (round.subjectId !== playerId && player.inFrom > index) {
      return reject("You're in from the next round.");
    }
    if (state.phase !== "answer") return reject("Answers aren't open.");
    if (playerId in round.picks) return reject("You've already answered.");
    if (action.choice < 0 || action.choice >= round.question.choices.length) {
      return reject("That isn't one of the choices.");
    }

    const answerMs = state.settings.answerSeconds * 1000;
    const usedMs = creditedElapsed(action.clientElapsedMs, now - state.answerStartsAt, answerMs);
    const next: HowWellState = {
      ...state,
      history: [
        ...state.history.slice(0, -1),
        { ...round, picks: { ...round.picks, [playerId]: { choice: action.choice, usedMs } } },
      ],
    };
    return allAnswered(next) ? resolve(next, now) : next;
  },

  onPlayerJoined(state, player) {
    if (state.finishedAt !== null) return state;
    const known = state.players.find((p) => p.id === player.id);
    if (known) {
      // Back after leaving: straight back into the round if it's still open, and into the
      // rotation at the back of the current cycle rather than owed every turn they missed.
      if (!known.left) return state;
      const owed = fewestTurns(state, known.id) - turnScore(state, known);
      const restored: HowWellPlayer = {
        ...known,
        left: false,
        turnCredit: known.turnCredit + Math.max(0, owed),
      };
      return { ...state, players: state.players.map((p) => (p.id === player.id ? restored : p)) };
    }
    // In the intro a newcomer is straight in; once answers are open they wait for the next round.
    const round = state.history.length - 1;
    const joined: HowWellPlayer = {
      id: player.id,
      nickname: player.nickname,
      left: false,
      inFrom: state.phase === "intro" ? round : round + 1,
      turnCredit: fewestTurns(state, player.id),
    };
    return { ...state, players: [...state.players, joined] };
  },

  onPlayerLeft(state, playerId, now) {
    if (state.finishedAt !== null) return state;
    if (!state.players.some((p) => p.id === playerId && !p.left)) return state;
    const players = state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p));
    const next: HowWellState = { ...state, players };
    if (tooFew(next)) return { ...next, finishedAt: now, revealEndsAt: null };
    if (next.phase === "reveal") return next;
    // The subject gone, the round can't be answered: it's void, and the reveal says why.
    if (currentRound(next).subjectId === playerId) return resolve(next, now, "subject-left");
    // The round can still end on everyone else's answers.
    if (next.phase === "answer" && allAnswered(next)) return resolve(next, now);
    return next;
  },

  tick(state, now) {
    if (state.finishedAt !== null) return state;
    if (state.phase === "intro") {
      if (now < state.answerStartsAt) return state;
      const open: HowWellState = { ...state, phase: "answer" };
      return now >= state.answerEndsAt ? resolve(open, now) : open;
    }
    if (state.phase === "answer") {
      if (now < state.answerEndsAt && !allAnswered(state)) return state;
      return resolve(state, now);
    }
    if (state.revealEndsAt === null || now < state.revealEndsAt) return state;
    const next = state.history.length;
    if (next >= roundCount(state)) return { ...state, finishedAt: now, revealEndsAt: null };
    return beginRound(state, next, now);
  },

  nextWakeAt(state) {
    if (state.finishedAt !== null) return null;
    if (state.phase === "intro") return state.answerStartsAt;
    if (state.phase === "answer") return state.answerEndsAt;
    return state.revealEndsAt;
  },

  isFinished: (state) => state.finishedAt !== null,

  summarize(state) {
    const stayed = standingsOf(state).filter((s) => !s.left);
    return {
      category: state.settings.pack,
      difficulty: null,
      mode: null,
      rounds: state.history.filter((r) => r.outcome !== null).length,
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
