import { seededRng } from "../../random";
import type { GamePlayer, GameSummary, Rejection } from "../types";
import {
  EARLY_TOLERANCE_MS,
  itemResults,
  prepare,
  type AnswerRecord,
  type PreparedQuestion,
  type QuizReviewItem,
} from "./common";
import { creditedElapsed, pointsFor } from "./scoring";
import type { QuizQuestion, QuizSettings } from "./settings";

/*
 * Elimination: everyone answers the same question at the same time. The game is split into
 * rounds; at the end of each, the lowest scores are knocked out. Each round cuts about the same
 * share of the players still in, so a big group loses several at once early on and a small one
 * loses one at a time, always landing on two. The two finalists start again from zero for a
 * short final, with sudden-death questions if it's still level.
 */

export const ELIMINATION_MIN_PLAYERS = 3;
/** Questions in the final, before any sudden death. */
export const FINAL_QUESTIONS = 3;
/** At most this many knock-out rounds, however many play. */
export const MAX_ROUNDS = 6;
/** Extra questions drawn for sudden death and tie-breaks. */
export const SPARE_QUESTIONS = 5;
/** "Get ready" before the first question. */
export const START_COUNTDOWN_MS = 3000;
/** How long the right answer shows after each question. */
export const REVEAL_MS = 3500;
/** How long a round's knock-outs show, before the next round. */
export const CUT_MS = 6000;
/** How long the finalists are introduced before the final. */
export const FINAL_INTRO_MS = 5000;

type Phase = "question" | "reveal" | "cut" | "final";

export interface EliminationPlayer {
  id: string;
  nickname: string;
  left: boolean;
  /** Joined after the start: watches, doesn't play. */
  spectator: boolean;
  score: number;
  correctCount: number;
  totalTimeMs: number;
  answers: AnswerRecord[];
  /** The round (0-based) they were knocked out in, or null while still in. */
  outRound: number | null;
  /** 1 for the first knocked out, 2 for the next and so on; later is a better placing. */
  outOrder: number | null;
  /** Points and time in the final, which starts from zero. */
  finalScore: number;
  finalTimeMs: number;
}

export interface EliminationState {
  mode: "elimination";
  settings: QuizSettings;
  questions: PreparedQuestion[];
  /** The questions the host asked for; the rest are spares. */
  planned: number;
  /** For each round, the question index it ends before: [2, 4, 6] is three rounds of two. */
  roundEnds: number[];
  players: EliminationPlayer[];
  index: number;
  phase: Phase;
  /** When the current question appears. */
  startsAt: number;
  /** When the current phase ends: the question's deadline, or the end of a reveal. */
  phaseEndsAt: number;
  /** The round being played, 0-based. */
  round: number;
  /** The question index the final started at, or null before it. */
  finalStart: number | null;
  lastCut: { round: number; out: string[]; tieKept: boolean } | null;
  knockedOut: number;
  winnerId: string | null;
  finishedAt: number | null;
}

// The numbers ---------------------------------------------------------------------------------

/**
 * When each knock-out round ends. The questions before the final are split as evenly as they
 * go between the rounds, and there are never more rounds than players to knock out.
 */
export function planRounds(players: number, questions: number): number[] {
  const before = Math.max(1, questions - FINAL_QUESTIONS);
  const rounds = Math.max(1, Math.min(players - 2, MAX_ROUNDS, before));
  const ends: number[] = [];
  let at = 0;
  for (let i = 0; i < rounds; i++) {
    at += Math.floor(before / rounds) + (i < before % rounds ? 1 : 0);
    ends.push(at);
  }
  return ends;
}

/**
 * How many stay in after a round, with `alive` still playing and `roundsLeft` rounds to go,
 * this one included. Each round keeps the same share of players, so the field shrinks
 * geometrically to two; every round cuts at least one, and leaves enough for later rounds to
 * cut one each.
 */
export function keepCount(alive: number, roundsLeft: number): number {
  if (alive <= 2) return alive;
  if (roundsLeft <= 1) return 2;
  const target = Math.round(2 * Math.pow(alive / 2, (roundsLeft - 1) / roundsLeft));
  const leaveForLater = 2 + (roundsLeft - 1);
  return Math.min(alive - 1, Math.max(target, leaveForLater, 2));
}

// Helpers -------------------------------------------------------------------------------------

const limitMs = (state: EliminationState) => state.settings.timeLimitSeconds * 1000;
const inFinal = (state: EliminationState) => state.finalStart !== null;

/** Players still competing: not knocked out, not gone, not watching. */
export function contenders(state: EliminationState): EliminationPlayer[] {
  return state.players.filter((p) => !p.left && !p.spectator && p.outRound === null);
}

const answered = (player: EliminationPlayer, index: number) =>
  player.answers.some((a) => a.index === index);

/** Best first, for cuts: more points, then the faster answerer. */
function byScore(a: EliminationPlayer, b: EliminationPlayer): number {
  return b.score - a.score || a.totalTimeMs - b.totalTimeMs;
}

function byFinal(a: EliminationPlayer, b: EliminationPlayer): number {
  return (
    b.finalScore - a.finalScore ||
    a.finalTimeMs - b.finalTimeMs ||
    byScore(a, b) ||
    a.nickname.localeCompare(b.nickname)
  );
}

function update(state: EliminationState, players: EliminationPlayer[]): EliminationState {
  return { ...state, players };
}

function record(
  state: EliminationState,
  player: EliminationPlayer,
  answer: AnswerRecord,
): EliminationPlayer {
  const final = inFinal(state);
  return {
    ...player,
    answers: [...player.answers, answer],
    score: player.score + answer.points,
    correctCount: player.correctCount + (answer.correct ? 1 : 0),
    totalTimeMs: player.totalTimeMs + answer.elapsedMs,
    finalScore: player.finalScore + (final ? answer.points : 0),
    finalTimeMs: player.finalTimeMs + (final ? answer.elapsedMs : 0),
  };
}

// Moving through the game ---------------------------------------------------------------------

function finish(state: EliminationState, at: number): EliminationState {
  const left = contenders(state).sort(inFinal(state) ? byFinal : byScore);
  return {
    ...state,
    phase: "reveal",
    phaseEndsAt: at,
    winnerId: left[0]?.id ?? null,
    finishedAt: at,
  };
}

function nextQuestion(state: EliminationState, at: number): EliminationState {
  const index = state.index + 1;
  if (index >= state.questions.length) return finish(state, at);
  return { ...state, index, phase: "question", startsAt: at, phaseEndsAt: at + limitMs(state) };
}

function startFinal(state: EliminationState, at: number): EliminationState {
  if (state.index + 1 >= state.questions.length) return finish(state, at);
  const players = state.players.map((p) => ({ ...p, finalScore: 0, finalTimeMs: 0 }));
  return {
    ...state,
    players,
    finalStart: state.index + 1,
    phase: "final",
    phaseEndsAt: at + FINAL_INTRO_MS,
  };
}

/** The end of a round: the lowest scores are knocked out. */
function cut(state: EliminationState, at: number): EliminationState {
  const ranked = contenders(state).sort(byScore);
  const roundsLeft = Math.max(1, state.roundEnds.length - state.round);
  let keep = keepCount(ranked.length, roundsLeft);
  // A tie on points and time at the line keeps both, unless there's nothing left to break it.
  let tieKept = false;
  const questionsLeft = state.questions.length - state.index - 1;
  while (
    keep < ranked.length &&
    questionsLeft > FINAL_QUESTIONS &&
    byScore(ranked[keep - 1]!, ranked[keep]!) === 0
  ) {
    keep++;
    tieKept = true;
  }
  const out = ranked.slice(keep);
  let order = state.knockedOut;
  const outIds = new Map<string, number>();
  // The best of those knocked out goes last, so they place highest.
  for (const p of [...out].reverse()) outIds.set(p.id, ++order);
  const players = state.players.map((p) =>
    outIds.has(p.id) ? { ...p, outRound: state.round, outOrder: outIds.get(p.id)! } : p,
  );
  let roundEnds = state.roundEnds;
  // Ties kept too many for the last round: one more one-question round.
  if (state.round + 1 >= roundEnds.length && keep > 2) {
    roundEnds = [...roundEnds, state.index + 2];
  }
  return {
    ...state,
    players,
    roundEnds,
    phase: "cut",
    phaseEndsAt: at + CUT_MS,
    lastCut: { round: state.round, out: out.map((p) => p.id), tieKept },
    knockedOut: order,
    round: state.round + 1,
  };
}

/** Time's up, or everyone still in has answered: everyone sees the right answer. */
function closeQuestion(state: EliminationState, at: number): EliminationState {
  const players = state.players.map((p) =>
    p.left || p.spectator || p.outRound !== null || answered(p, state.index)
      ? p
      : record(state, p, {
          index: state.index,
          choice: null,
          correct: false,
          points: 0,
          elapsedMs: limitMs(state),
        }),
  );
  return { ...state, players, phase: "reveal", phaseEndsAt: at + REVEAL_MS };
}

function afterReveal(state: EliminationState, at: number): EliminationState {
  const alive = contenders(state);
  if (alive.length <= 1) return finish(state, at);
  if (inFinal(state)) {
    const played = state.index + 1 - state.finalStart!;
    if (played < FINAL_QUESTIONS) return nextQuestion(state, at);
    const [first, second] = [...alive].sort(byFinal);
    const level = first!.finalScore === second!.finalScore;
    // Sudden death while it's level and there are questions left.
    if (level && state.index + 1 < state.questions.length) return nextQuestion(state, at);
    return finish(state, at);
  }
  if (alive.length === 2) return startFinal(state, at);
  const roundEnd = state.roundEnds[state.round];
  if (roundEnd !== undefined && state.index + 1 >= roundEnd) return cut(state, at);
  return nextQuestion(state, at);
}

function afterCut(state: EliminationState, at: number): EliminationState {
  if (contenders(state).length <= 2) return startFinal(state, at);
  return nextQuestion(state, at);
}

/** Everything that was due by `now`, in order. */
export function tickElimination(state: EliminationState, now: number): EliminationState {
  let s = state;
  for (let guard = 0; guard < 100 && s.finishedAt === null && now >= s.phaseEndsAt; guard++) {
    const at = s.phaseEndsAt;
    if (s.phase === "question") s = closeQuestion(s, at);
    else if (s.phase === "reveal") s = afterReveal(s, at);
    else if (s.phase === "cut") s = afterCut(s, at);
    else s = nextQuestion(s, at);
  }
  return s;
}

// The module's hooks --------------------------------------------------------------------------

export function setupElimination(args: {
  settings: QuizSettings;
  players: GamePlayer[];
  content: QuizQuestion[];
  seed: number;
  now: number;
}): EliminationState {
  const { settings, players, content, seed, now } = args;
  const rng = seededRng(seed);
  const questions = content.map((q) => prepare(q, rng));
  const planned = Math.min(settings.count, questions.length);
  const startsAt = now + START_COUNTDOWN_MS;
  return {
    mode: "elimination",
    settings,
    questions,
    planned,
    roundEnds: planRounds(players.length, planned),
    players: players.map((p) => newPlayer(p, false)),
    index: 0,
    phase: "question",
    startsAt,
    phaseEndsAt: startsAt + settings.timeLimitSeconds * 1000,
    round: 0,
    finalStart: null,
    lastCut: null,
    knockedOut: 0,
    winnerId: null,
    finishedAt: questions.length === 0 ? now : null,
  };
}

function newPlayer(player: GamePlayer, spectator: boolean): EliminationPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    left: false,
    spectator,
    score: 0,
    correctCount: 0,
    totalTimeMs: 0,
    answers: [],
    outRound: null,
    outOrder: null,
    finalScore: 0,
    finalTimeMs: 0,
  };
}

export function answerElimination(
  state: EliminationState,
  playerId: string,
  action: { index: number; choice: number; clientElapsedMs: number },
  now: number,
): EliminationState | Rejection {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.left || player.spectator) return { rejected: "You're watching this game." };
  if (player.outRound !== null) return { rejected: "You've been knocked out. Enjoy the show!" };
  if (state.phase !== "question" || action.index !== state.index) {
    return { rejected: "That question has closed." };
  }
  if (now < state.startsAt - EARLY_TOLERANCE_MS)
    return { rejected: "That question hasn't started." };
  if (answered(player, state.index)) return { rejected: "You've answered this one." };
  const question = state.questions[state.index]!;
  if (action.choice >= question.choices.length)
    return { rejected: "That isn't one of the choices." };
  const elapsedMs = creditedElapsed(action.clientElapsedMs, now - state.startsAt, limitMs(state));
  const correct = action.choice === question.correctChoice;
  const updated = record(state, player, {
    index: state.index,
    choice: action.choice,
    correct,
    elapsedMs,
    points: pointsFor(correct, elapsedMs, limitMs(state), state.settings.difficulty),
  });
  const next = update(
    state,
    state.players.map((p) => (p.id === playerId ? updated : p)),
  );
  // Everyone still in has answered: no need to wait for the clock.
  return contenders(next).every((p) => answered(p, next.index)) ? closeQuestion(next, now) : next;
}

export function joinElimination(state: EliminationState, player: GamePlayer): EliminationState {
  if (state.finishedAt !== null || state.players.some((p) => p.id === player.id)) return state;
  return { ...state, players: [...state.players, newPlayer(player, true)] };
}

export function leaveElimination(
  state: EliminationState,
  playerId: string,
  now: number,
): EliminationState {
  const next = update(
    state,
    state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p)),
  );
  if (next.finishedAt !== null) return next;
  const alive = contenders(next);
  if (alive.length <= 1) return finish(next, now);
  if (next.phase === "question" && alive.every((p) => answered(p, next.index))) {
    return closeQuestion(next, now);
  }
  return next;
}

export function nextWakeElimination(state: EliminationState): number | null {
  return state.finishedAt === null ? state.phaseEndsAt : null;
}

// Views ---------------------------------------------------------------------------------------

export type EliminationStatus = "in" | "finalist" | "winner" | "runner-up" | "out" | "left";

export interface EliminationStanding {
  playerId: string;
  nickname: string;
  rank: number;
  score: number;
  status: EliminationStatus;
  /** 1-based round they were knocked out in. */
  outRound: number | null;
}

/** Everyone who played, best placing first: the winner, the finalists, then knock-outs. */
export function eliminationStandings(state: EliminationState): EliminationStanding[] {
  const playing = state.players.filter((p) => !p.spectator);
  const alive = contenders(state).sort(inFinal(state) ? byFinal : byScore);
  const out = playing
    .filter((p) => !p.left && p.outRound !== null)
    .sort((a, b) => b.outOrder! - a.outOrder!);
  const gone = playing.filter((p) => p.left && p.outRound === null);
  const done = state.finishedAt !== null;
  const rows = [...alive, ...out, ...gone];
  return rows.map((p, i) => ({
    playerId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    score: p.score,
    status: p.left
      ? "left"
      : p.outRound !== null
        ? "out"
        : done
          ? p.id === state.winnerId
            ? "winner"
            : "runner-up"
          : inFinal(state)
            ? "finalist"
            : "in",
    outRound: p.outRound === null ? null : p.outRound + 1,
  }));
}

export type EliminationStage =
  | {
      kind: "question";
      index: number;
      prompt: string;
      choices: string[];
      startsAt: number;
      deadline: number;
      /** Whether you're still in: otherwise you watch. */
      playing: boolean;
      myChoice: number | null;
      answeredCount: number;
      aliveCount: number;
    }
  | ({ kind: "reveal"; playing: boolean; until: number } & QuizReviewItem)
  | {
      kind: "cut";
      /** 1-based. */
      round: number;
      out: { playerId: string; nickname: string }[];
      tieKept: boolean;
      next: "round" | "final";
      until: number;
    }
  | {
      kind: "final";
      finalists: { playerId: string; nickname: string; score: number }[];
      until: number;
    }
  | {
      kind: "done";
      winner: { playerId: string; nickname: string } | null;
      review: QuizReviewItem[];
    };

export interface EliminationView {
  game: "quiz";
  mode: "elimination";
  timed: true;
  timeLimitMs: number;
  /** Players who started. */
  playerCount: number;
  aliveCount: number;
  /** 1-based round and how many there are; null in the final. */
  round: number | null;
  rounds: number;
  /** Question number in the game, 1-based. */
  questionNumber: number;
  inFinal: boolean;
  suddenDeath: boolean;
  /** The finalists' scores in the final, which started from zero. */
  finalScores: { playerId: string; nickname: string; score: number }[] | null;
  stage: EliminationStage;
  me: {
    score: number;
    correctCount: number;
    status: EliminationStatus | "watching";
    outRound: number | null;
    rank: number | null;
  } | null;
  standings: EliminationStanding[];
  final: boolean;
}

function reviewItem(state: EliminationState, player: EliminationPlayer | undefined, index: number) {
  const question = state.questions[index]!;
  const answer = player?.answers.find((a) => a.index === index);
  return {
    index,
    questionId: question.id,
    prompt: question.prompt,
    choices: question.choices,
    myChoice: answer?.choice ?? null,
    correctChoice: question.correctChoice,
    correct: answer?.correct ?? false,
    points: answer?.points ?? 0,
    explanation: question.explanation,
    reference: question.reference,
  };
}

function stageFor(
  state: EliminationState,
  player: EliminationPlayer | undefined,
): EliminationStage {
  const alive = contenders(state);
  const playing = !!player && alive.some((p) => p.id === player.id);
  if (state.finishedAt !== null) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return {
      kind: "done",
      winner: winner ? { playerId: winner.id, nickname: winner.nickname } : null,
      review: player ? player.answers.map((a) => reviewItem(state, player, a.index)) : [],
    };
  }
  if (state.phase === "cut" && state.lastCut) {
    const out = state.lastCut.out.flatMap((id) => {
      const p = state.players.find((x) => x.id === id);
      return p ? [{ playerId: p.id, nickname: p.nickname }] : [];
    });
    return {
      kind: "cut",
      round: state.lastCut.round + 1,
      out,
      tieKept: state.lastCut.tieKept,
      next: alive.length <= 2 ? "final" : "round",
      until: state.phaseEndsAt,
    };
  }
  if (state.phase === "final") {
    return {
      kind: "final",
      finalists: alive.map((p) => ({ playerId: p.id, nickname: p.nickname, score: p.score })),
      until: state.phaseEndsAt,
    };
  }
  if (state.phase === "reveal") {
    return {
      kind: "reveal",
      playing,
      until: state.phaseEndsAt,
      ...reviewItem(state, player, state.index),
    };
  }
  const question = state.questions[state.index]!;
  return {
    kind: "question",
    index: state.index,
    prompt: question.prompt,
    choices: question.choices,
    startsAt: state.startsAt,
    deadline: state.phaseEndsAt,
    playing,
    myChoice: player?.answers.find((a) => a.index === state.index)?.choice ?? null,
    answeredCount: alive.filter((p) => answered(p, state.index)).length,
    aliveCount: alive.length,
  };
}

export function viewElimination(state: EliminationState, playerId: string): EliminationView {
  const player = state.players.find((p) => p.id === playerId);
  const standings = eliminationStandings(state);
  const mine = standings.find((s) => s.playerId === playerId);
  const final = inFinal(state);
  return {
    game: "quiz",
    mode: "elimination",
    timed: true,
    timeLimitMs: limitMs(state),
    playerCount: state.players.filter((p) => !p.spectator).length,
    aliveCount: contenders(state).length,
    // While a round's knock-outs show, it's still that round.
    round: final
      ? null
      : state.phase === "cut" && state.lastCut
        ? state.lastCut.round + 1
        : Math.min(state.round, state.roundEnds.length - 1) + 1,
    rounds: state.roundEnds.length,
    questionNumber: state.index + 1,
    inFinal: final,
    suddenDeath: final && state.index - state.finalStart! >= FINAL_QUESTIONS,
    finalScores: final
      ? contenders(state)
          .sort(byFinal)
          .map((p) => ({ playerId: p.id, nickname: p.nickname, score: p.finalScore }))
      : null,
    stage: stageFor(state, player),
    me: player
      ? {
          score: player.score,
          correctCount: player.correctCount,
          status: player.spectator ? "watching" : (mine?.status ?? "left"),
          outRound: player.outRound === null ? null : player.outRound + 1,
          rank: mine?.rank ?? null,
        }
      : null,
    standings,
    final: state.finishedAt !== null,
  };
}

export function summarizeElimination(state: EliminationState): GameSummary {
  const stayed = eliminationStandings(state).filter((s) => s.status !== "left");
  return {
    category: state.settings.category,
    difficulty: state.settings.difficulty,
    mode: "elimination",
    rounds: state.index + 1,
    players: stayed.map((s, i) => ({
      playerId: s.playerId,
      placing: i + 1,
      score: s.score,
      correct: state.players.find((p) => p.id === s.playerId)?.correctCount ?? null,
    })),
    items: itemResults(state.questions.slice(0, state.index + 1), state.players),
  };
}
