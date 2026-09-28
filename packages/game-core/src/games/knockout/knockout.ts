import type { GamePlayer, GameSummary, Rejection } from "../types";
import { autoLevels, type Level, type LevelChoice } from "../levels";

/*
 * Elimination, for every game that has it: everyone plays the same item (a question, a word, a
 * grid) at the same time. The game is split into rounds; at the end of each, the lowest scores
 * are knocked out. Each round cuts about the same share of the players still in, so a big group
 * loses several at once early on and a small one loses one at a time, always landing on two.
 * The two finalists start again from zero for a short final, with sudden death if it's level.
 *
 * A game brings its items and decides what a move is worth; this file owns everything else.
 */

export const ELIMINATION_MIN_PLAYERS = 3;
/** Items in the final, before any sudden death. */
export const FINAL_QUESTIONS = 3;
/** At most this many knock-out rounds, however many play. */
export const MAX_ROUNDS = 6;
/** Extra items drawn for sudden death and tie-breaks. */
export const SPARE_QUESTIONS = 5;
/** "Get ready" before the first item. */
export const START_COUNTDOWN_MS = 3000;
/** How long the answer shows after each item. */
export const REVEAL_MS = 3500;
/** How long a round's knock-outs show, before the next round. */
export const CUT_MS = 6000;
/** How long the finalists are introduced before the final. */
export const FINAL_INTRO_MS = 5000;

type Phase = "question" | "reveal" | "cut" | "final";

/** What a player did with one item. Games add their own details. */
export interface KnockoutRecord {
  index: number;
  correct: boolean;
  points: number;
  elapsedMs: number;
}

export interface KnockoutPlayer<R extends KnockoutRecord, Guess> {
  id: string;
  nickname: string;
  left: boolean;
  /** Joined after the start: watches, doesn't play. */
  spectator: boolean;
  score: number;
  correctCount: number;
  totalTimeMs: number;
  /** One per item the player is done with. */
  answers: R[];
  /** Wrong tries on the current item, for games that allow more than one. */
  tried: Guess[];
  /** The round (0-based) they were knocked out in, or null while still in. */
  outRound: number | null;
  /** 1 for the first knocked out, 2 for the next and so on; later is a better placing. */
  outOrder: number | null;
  /** Points and time in the final, which starts from zero. */
  finalScore: number;
  finalTimeMs: number;
}

export interface KnockoutState<Settings, Item, R extends KnockoutRecord, Guess> {
  mode: "elimination";
  settings: Settings;
  items: Item[];
  /** The items the host asked for; the rest are spares. */
  planned: number;
  /** For each round, the item index it ends before: [2, 4, 6] is three rounds of two. */
  roundEnds: number[];
  players: KnockoutPlayer<R, Guess>[];
  index: number;
  phase: Phase;
  /** When the current item appears. */
  startsAt: number;
  /** When the current phase ends: the item's deadline, or the end of a reveal. */
  phaseEndsAt: number;
  /** The round being played, 0-based. */
  round: number;
  /** The item index the final started at, or null before it. */
  finalStart: number | null;
  lastCut: { round: number; out: string[]; tieKept: boolean } | null;
  knockedOut: number;
  winnerId: string | null;
  finishedAt: number | null;
}

// The numbers ---------------------------------------------------------------------------------

/**
 * When each knock-out round ends. The items before the final are split as evenly as they go
 * between the rounds, and there are never more rounds than players to knock out.
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

/**
 * The level of every item an Elimination game draws: `planned` for the rounds and the final,
 * then the spares. Auto blends each knock-out round from easy towards hard, and the final and
 * sudden death are hard.
 */
export function knockoutLevelPlan(choice: LevelChoice, players: number, planned: number): Level[] {
  if (choice !== "auto") return Array<Level>(planned + SPARE_QUESTIONS).fill(choice);
  const ends = planRounds(Math.max(players, ELIMINATION_MIN_PLAYERS), planned);
  const sizes = ends.map((end, i) => end - (i === 0 ? 0 : ends[i - 1]!));
  const final = Math.max(0, planned - ends[ends.length - 1]!);
  // The final is the last stage, so it comes out all hard.
  const levels = autoLevels(final > 0 ? [...sizes, final] : sizes).slice(0, planned);
  return [...levels, ...Array<Level>(SPARE_QUESTIONS).fill("hard")];
}

// Helpers -------------------------------------------------------------------------------------

type AnyState = KnockoutState<unknown, unknown, KnockoutRecord, unknown>;
type AnyPlayer = KnockoutPlayer<KnockoutRecord, unknown>;

const inFinal = (state: AnyState) => state.finalStart !== null;

/** Players still competing: not knocked out, not gone, not watching. */
export function contenders<P extends AnyPlayer>(state: { players: P[] }): P[] {
  return state.players.filter((p) => !p.left && !p.spectator && p.outRound === null);
}

export const answered = (player: AnyPlayer, index: number) =>
  player.answers.some((a) => a.index === index);

/** Best first, for cuts: more points, then the faster player. */
function byScore(a: AnyPlayer, b: AnyPlayer): number {
  return b.score - a.score || a.totalTimeMs - b.totalTimeMs;
}

function byFinal(a: AnyPlayer, b: AnyPlayer): number {
  return (
    b.finalScore - a.finalScore ||
    a.finalTimeMs - b.finalTimeMs ||
    byScore(a, b) ||
    a.nickname.localeCompare(b.nickname)
  );
}

function withRecord<P extends AnyPlayer>(state: AnyState, player: P, record: KnockoutRecord): P {
  const final = inFinal(state);
  return {
    ...player,
    answers: [...player.answers, record],
    tried: [],
    score: player.score + record.points,
    correctCount: player.correctCount + (record.correct ? 1 : 0),
    totalTimeMs: player.totalTimeMs + record.elapsedMs,
    finalScore: player.finalScore + (final ? record.points : 0),
    finalTimeMs: player.finalTimeMs + (final ? record.elapsedMs : 0),
  };
}

// Moving through the game ---------------------------------------------------------------------

/** Game-specific pieces the engine needs while it runs. */
export interface KnockoutRules<Settings, Item, R extends KnockoutRecord, Guess> {
  limitMs(settings: Settings): number;
  /** What someone who didn't finish an item in time gets for it. */
  timedOut(item: Item, index: number, tried: Guess[], limitMs: number): R;
}

export function knockoutEngine<Settings, Item, R extends KnockoutRecord, Guess>(
  rules: KnockoutRules<Settings, Item, R, Guess>,
) {
  type State = KnockoutState<Settings, Item, R, Guess>;
  type Player = KnockoutPlayer<R, Guess>;
  const limitMs = (state: State) => rules.limitMs(state.settings);

  function finish(state: State, at: number): State {
    const left = contenders(state).sort(inFinal(state) ? byFinal : byScore);
    return {
      ...state,
      phase: "reveal",
      phaseEndsAt: at,
      winnerId: left[0]?.id ?? null,
      finishedAt: at,
    };
  }

  function nextItem(state: State, at: number): State {
    const index = state.index + 1;
    if (index >= state.items.length) return finish(state, at);
    const players = state.players.map((p) => (p.tried.length > 0 ? { ...p, tried: [] } : p));
    return {
      ...state,
      players,
      index,
      phase: "question",
      startsAt: at,
      phaseEndsAt: at + limitMs(state),
    };
  }

  function startFinal(state: State, at: number): State {
    if (state.index + 1 >= state.items.length) return finish(state, at);
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
  function cut(state: State, at: number): State {
    const ranked = contenders(state).sort(byScore);
    const roundsLeft = Math.max(1, state.roundEnds.length - state.round);
    let keep = keepCount(ranked.length, roundsLeft);
    // A tie on points and time at the line keeps both, unless there's nothing left to break it.
    let tieKept = false;
    const itemsLeft = state.items.length - state.index - 1;
    while (
      keep < ranked.length &&
      itemsLeft > FINAL_QUESTIONS &&
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
    // Ties kept too many for the last round: one more one-item round.
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

  /** Time's up, or everyone still in is done: everyone sees the answer. */
  function closeItem(state: State, at: number): State {
    const item = state.items[state.index]!;
    const players = state.players.map((p) =>
      p.left || p.spectator || p.outRound !== null || answered(p, state.index)
        ? p
        : withRecord(state, p, rules.timedOut(item, state.index, p.tried, limitMs(state))),
    );
    return { ...state, players, phase: "reveal", phaseEndsAt: at + REVEAL_MS };
  }

  function afterReveal(state: State, at: number): State {
    const alive = contenders(state);
    if (alive.length <= 1) return finish(state, at);
    if (inFinal(state)) {
      const played = state.index + 1 - state.finalStart!;
      if (played < FINAL_QUESTIONS) return nextItem(state, at);
      const [first, second] = [...alive].sort(byFinal);
      const level = first!.finalScore === second!.finalScore;
      // Sudden death while it's level and there are items left.
      if (level && state.index + 1 < state.items.length) return nextItem(state, at);
      return finish(state, at);
    }
    if (alive.length === 2) return startFinal(state, at);
    const roundEnd = state.roundEnds[state.round];
    if (roundEnd !== undefined && state.index + 1 >= roundEnd) return cut(state, at);
    return nextItem(state, at);
  }

  function afterCut(state: State, at: number): State {
    if (contenders(state).length <= 2) return startFinal(state, at);
    return nextItem(state, at);
  }

  const allDone = (state: State) => contenders(state).every((p) => answered(p, state.index));

  return {
    setup(args: {
      settings: Settings;
      players: GamePlayer[];
      items: Item[];
      planned: number;
      now: number;
    }): State {
      const { settings, players, items, now } = args;
      const planned = Math.min(args.planned, items.length);
      const startsAt = now + START_COUNTDOWN_MS;
      return {
        mode: "elimination",
        settings,
        items,
        planned,
        roundEnds: planRounds(players.length, planned),
        players: players.map((p) => newPlayer<R, Guess>(p, false)),
        index: 0,
        phase: "question",
        startsAt,
        phaseEndsAt: startsAt + rules.limitMs(settings),
        round: 0,
        finalStart: null,
        lastCut: null,
        knockedOut: 0,
        winnerId: null,
        finishedAt: items.length === 0 ? now : null,
      };
    },

    /** Everything that was due by `now`, in order. */
    tick(state: State, now: number): State {
      let s = state;
      for (let guard = 0; guard < 100 && s.finishedAt === null && now >= s.phaseEndsAt; guard++) {
        const at = s.phaseEndsAt;
        if (s.phase === "question") s = closeItem(s, at);
        else if (s.phase === "reveal") s = afterReveal(s, at);
        else if (s.phase === "cut") s = afterCut(s, at);
        else s = nextItem(s, at);
      }
      return s;
    },

    /**
     * A move on the current item. `decide` gets the player, the item and the time since it
     * appeared, and returns a rejection, a wrong try to remember, or the player's record for
     * the item (they're done with it).
     */
    move(
      state: State,
      playerId: string,
      index: number,
      now: number,
      decide: (player: Player, item: Item, elapsedMs: number) => Rejection | { miss: Guess } | R,
    ): State | Rejection {
      if (state.finishedAt !== null) return { rejected: "The game is over." };
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.left || player.spectator) {
        return { rejected: "You're watching this game." };
      }
      if (player.outRound !== null) return { rejected: "You've been knocked out. Enjoy the show!" };
      if (state.phase !== "question" || index !== state.index) {
        return { rejected: "That one has closed." };
      }
      if (now < state.startsAt - 1000) return { rejected: "That one hasn't started." };
      if (answered(player, state.index)) return { rejected: "You're done with this one." };
      const outcome = decide(player, state.items[state.index]!, now - state.startsAt);
      if ("rejected" in outcome) return outcome;
      const updated: Player =
        "miss" in outcome
          ? { ...player, tried: [...player.tried, outcome.miss] }
          : withRecord(state, player, outcome);
      const next = {
        ...state,
        players: state.players.map((p) => (p.id === playerId ? updated : p)),
      };
      // Everyone still in is done: no need to wait for the clock.
      return allDone(next) ? closeItem(next, now) : next;
    },

    join(state: State, player: GamePlayer): State {
      if (state.finishedAt !== null || state.players.some((p) => p.id === player.id)) return state;
      return { ...state, players: [...state.players, newPlayer<R, Guess>(player, true)] };
    },

    leave(state: State, playerId: string, now: number): State {
      const next = {
        ...state,
        players: state.players.map((p) => (p.id === playerId ? { ...p, left: true } : p)),
      };
      if (next.finishedAt !== null) return next;
      if (contenders(next).length <= 1) return finish(next, now);
      if (next.phase === "question" && allDone(next)) return closeItem(next, now);
      return next;
    },

    nextWakeAt: (state: State): number | null =>
      state.finishedAt === null ? state.phaseEndsAt : null,

    limitMs,
  };
}

function newPlayer<R extends KnockoutRecord, Guess>(
  player: GamePlayer,
  spectator: boolean,
): KnockoutPlayer<R, Guess> {
  return {
    id: player.id,
    nickname: player.nickname,
    left: false,
    spectator,
    score: 0,
    correctCount: 0,
    totalTimeMs: 0,
    answers: [],
    tried: [],
    outRound: null,
    outOrder: null,
    finalScore: 0,
    finalTimeMs: 0,
  };
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
export function eliminationStandings(state: AnyState): EliminationStanding[] {
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

/** The stages every Elimination game shares; games fill in the item and its answer. */
export type KnockoutStage<ItemStage, RevealStage, DoneStage> =
  | ({
      kind: "question";
      index: number;
      startsAt: number;
      deadline: number;
      /** Whether you're still in: otherwise you watch. */
      playing: boolean;
      answeredCount: number;
      aliveCount: number;
    } & ItemStage)
  | ({ kind: "reveal"; playing: boolean; until: number } & RevealStage)
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
  | ({ kind: "done"; winner: { playerId: string; nickname: string } | null } & DoneStage);

/** What every Elimination view has, whatever the game. */
export interface KnockoutViewBase<Stage> {
  mode: "elimination";
  timed: true;
  timeLimitMs: number;
  /** Players who started. */
  playerCount: number;
  aliveCount: number;
  /** 1-based round and how many there are; null in the final. */
  round: number | null;
  rounds: number;
  /** Item number in the game, 1-based. */
  questionNumber: number;
  inFinal: boolean;
  suddenDeath: boolean;
  /** The finalists' scores in the final, which started from zero. */
  finalScores: { playerId: string; nickname: string; score: number }[] | null;
  stage: Stage;
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

/**
 * A player's view. `item` gives what the current item looks like to them, `reveal` its answer
 * and how they did, and `done` their own review at the end.
 */
export function knockoutView<
  Settings,
  Item,
  R extends KnockoutRecord,
  Guess,
  ItemStage,
  RevealStage,
  DoneStage,
>(
  state: KnockoutState<Settings, Item, R, Guess>,
  playerId: string,
  limitMs: number,
  parts: {
    item(item: Item, player: KnockoutPlayer<R, Guess> | undefined): ItemStage;
    reveal(item: Item, index: number, player: KnockoutPlayer<R, Guess> | undefined): RevealStage;
    done(player: KnockoutPlayer<R, Guess> | undefined): DoneStage;
  },
): KnockoutViewBase<KnockoutStage<ItemStage, RevealStage, DoneStage>> {
  const player = state.players.find((p) => p.id === playerId);
  const standings = eliminationStandings(state);
  const mine = standings.find((s) => s.playerId === playerId);
  const final = inFinal(state);
  const alive = contenders(state);
  const playing = !!player && alive.some((p) => p.id === player.id);

  let stage: KnockoutStage<ItemStage, RevealStage, DoneStage>;
  if (state.finishedAt !== null) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    stage = {
      kind: "done",
      winner: winner ? { playerId: winner.id, nickname: winner.nickname } : null,
      ...parts.done(player),
    };
  } else if (state.phase === "cut" && state.lastCut) {
    const out = state.lastCut.out.flatMap((id) => {
      const p = state.players.find((x) => x.id === id);
      return p ? [{ playerId: p.id, nickname: p.nickname }] : [];
    });
    stage = {
      kind: "cut",
      round: state.lastCut.round + 1,
      out,
      tieKept: state.lastCut.tieKept,
      next: alive.length <= 2 ? "final" : "round",
      until: state.phaseEndsAt,
    };
  } else if (state.phase === "final") {
    stage = {
      kind: "final",
      finalists: alive.map((p) => ({ playerId: p.id, nickname: p.nickname, score: p.score })),
      until: state.phaseEndsAt,
    };
  } else if (state.phase === "reveal") {
    stage = {
      kind: "reveal",
      playing,
      until: state.phaseEndsAt,
      ...parts.reveal(state.items[state.index]!, state.index, player),
    };
  } else {
    stage = {
      kind: "question",
      index: state.index,
      startsAt: state.startsAt,
      deadline: state.phaseEndsAt,
      playing,
      answeredCount: alive.filter((p) => answered(p, state.index)).length,
      aliveCount: alive.length,
      ...parts.item(state.items[state.index]!, player),
    };
  }

  return {
    mode: "elimination",
    timed: true,
    timeLimitMs: limitMs,
    playerCount: state.players.filter((p) => !p.spectator).length,
    aliveCount: alive.length,
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
    stage,
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

/** The placings for match history, best first. */
export function knockoutPlacings(state: AnyState): GameSummary["players"] {
  const stayed = eliminationStandings(state).filter((s) => s.status !== "left");
  return stayed.map((s, i) => ({
    playerId: s.playerId,
    placing: i + 1,
    score: s.score,
    correct: state.players.find((p) => p.id === s.playerId)?.correctCount ?? null,
  }));
}
