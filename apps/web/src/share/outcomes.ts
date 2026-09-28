import type { ShareCard } from "./shareCard";

// Which kind of finish a game was, and what the share picture says about it. Each finish has
// its own headline, mascot, colour and call to action; the picture is drawn in shareCard.ts.

export type Outcome =
  | "winner"
  | "perfect"
  | "speed"
  | "runnerUp"
  | "podium"
  | "crowd"
  | "great"
  | "solid"
  | "bad"
  | "lastStanding"
  | "knockedOut";

export const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

export interface ResultRow {
  playerId: string;
  nickname: string;
  avatar: string | null;
  /** For the bar: points, or pieces placed. Higher is better. */
  value: number;
  /** What's written: "9,240 pts", "2:31". */
  label: string;
  /** Total answer time once the game is over, where the game has one. */
  timeMs?: number | null;
}

export interface ResultFacts {
  /** "Bible Quiz", "Word Rush". */
  title: string;
  /** "Speed · Easy". */
  subtitle: string;
  art: string;
  colors: [string, string];
  /** Everyone who stayed to the end, best first. Empty or one row when solo. */
  rows: ResultRow[];
  me: string;
  /** The sharer's own result, big: "9,240" and "points", or "2:31" and "to finish". */
  score: { value: string; unit: string };
  /** Right answers, for a perfect or a bad game. Null where there's no such thing. */
  correct: { got: number; of: number } | null;
  /** Items answered, to work out time per answer for the speed champion. */
  items: number;
  /** The small facts under a solo score: questions, level, time. */
  facts: { icon: string; value: string; label: string }[];
  /** Elimination: the round the sharer went out in, if they did. */
  elimination?: { outRound: number | null };
  /** Jigsaw: whether the sharer finished. */
  finished?: boolean;
}

const COPY: Record<
  Outcome,
  { headline: string[]; emoji?: string; cta: string; mascot: string; accent: string }
> = {
  winner: {
    headline: ["I WON!"],
    cta: "THINK YOU CAN BEAT ME?",
    mascot: "/art/mascot/podium.webp",
    accent: "#ffd43f",
  },
  lastStanding: {
    headline: ["LAST ONE", "STANDING!"],
    cta: "THINK YOU'D SURVIVE?",
    mascot: "/art/mascot/podium.webp",
    accent: "#ffd43f",
  },
  perfect: {
    headline: ["PERFECT", "SCORE!"],
    emoji: "✨",
    cta: "BET YOU CAN'T DO THIS",
    mascot: "/art/mascot/fly.webp",
    accent: "#ffd43f",
  },
  speed: {
    headline: ["LIGHTNING", "FAST!"],
    emoji: "⚡",
    cta: "CAN YOU KEEP UP?",
    mascot: "/art/mascot/run.webp",
    accent: "#5ce1ff",
  },
  runnerUp: {
    headline: ["SO", "CLOSE!"],
    cta: "CAN YOU BEAT MY SCORE?",
    mascot: "/art/mascot/wave.webp",
    accent: "#d6dcff",
  },
  podium: {
    headline: ["TOP 3", "FINISH!"],
    cta: "CAN YOU BEAT MY SCORE?",
    mascot: "/art/mascot/hero.webp",
    accent: "#ffb36b",
  },
  crowd: {
    headline: [],
    cta: "JOIN THE NEXT GAME",
    mascot: "/art/stats/cta.webp",
    accent: "#ff7ad9",
  },
  great: {
    headline: ["NAILED", "IT!"],
    cta: "CAN YOU BEAT MY SCORE?",
    mascot: "/art/mascot/hero.webp",
    accent: "#ffd43f",
  },
  solid: {
    headline: ["NOT", "BAD!"],
    cta: "CAN YOU BEAT MY SCORE?",
    mascot: "/art/mascot/wave.webp",
    accent: "#ffd43f",
  },
  bad: {
    headline: ["WE DON'T", "TALK ABOUT", "THIS ONE."],
    emoji: "💀",
    cta: "CAN YOU DO BETTER?",
    mascot: "/art/mascot/wave.webp",
    accent: "#b9a7ff",
  },
  knockedOut: {
    headline: ["KNOCKED", "OUT!"],
    emoji: "🥊",
    cta: "THINK YOU'D LAST LONGER?",
    mascot: "/art/mascot/wave.webp",
    accent: "#ff8a98",
  },
};

/** Players in a game this big make it a crowd. */
const CROWD = 6;

/** Which finish this was, the best thing that's true first. */
export function outcomeOf(f: ResultFacts): Outcome {
  const players = f.rows.length;
  const multi = players >= 2;
  const at = f.rows.findIndex((r) => r.playerId === f.me);
  const rank = at >= 0 ? at + 1 : null;
  const ratio = f.correct && f.correct.of > 0 ? f.correct.got / f.correct.of : null;

  if (f.elimination) {
    if (rank === 1) return "lastStanding";
    if (rank === 2) return "runnerUp";
    // Out in the first round of a real knock-out is a bad day.
    if (f.elimination.outRound === 1 && players >= 4) return "bad";
    return "knockedOut";
  }
  if (ratio === 1) return "perfect";
  if (multi && rank === 1) return "winner";
  if (multi && fastest(f) && (ratio === null || ratio >= 0.5)) return "speed";
  if (f.finished === false || (ratio !== null && ratio < 0.4)) return "bad";
  if (multi && rank === 2) return "runnerUp";
  if (multi && rank === 3) return "podium";
  if (players >= CROWD) return "crowd";
  if (ratio !== null && ratio >= 0.8) return "great";
  return "solid";
}

/** Whether the sharer answered fastest on average of everyone with a time. */
function fastest(f: ResultFacts): boolean {
  const mine = f.rows.find((r) => r.playerId === f.me)?.timeMs;
  if (mine == null) return false;
  return f.rows.every((r) => r.playerId === f.me || r.timeMs == null || r.timeMs > mine);
}

/** The leaderboard rows the picture has room for: the top five, or four and the sharer. */
export const BOARD_ROWS = 5;

export function buildCard(f: ResultFacts): ShareCard {
  const outcome = outcomeOf(f);
  const copy = COPY[outcome];
  const players = f.rows.length;
  const at = f.rows.findIndex((r) => r.playerId === f.me);
  const rank = at >= 0 ? at + 1 : null;
  const multi = players >= 2;

  let kicker = "Your score";
  let value = f.score.value;
  let unit = f.score.unit;
  if (outcome === "perfect" && f.correct) {
    kicker = multi && rank === 1 ? "1st place · perfect" : "Every answer right";
    value = `${f.correct.of}/${f.correct.of}`;
    unit = `${f.score.value} ${f.score.unit}`;
  } else if (outcome === "bad" && f.correct) {
    value = `${f.correct.got} / ${f.correct.of}`;
    unit = `${f.score.value} ${f.score.unit}`;
  } else if (outcome === "speed") {
    const mine = f.rows[at]?.timeMs ?? 0;
    kicker = "Fastest player";
    value = `${(mine / Math.max(1, f.items) / 1000).toFixed(1)}s`;
    unit = "per answer";
  } else if (outcome === "lastStanding") {
    kicker = "Winner";
    value = String(players);
    unit = `players, ${players - 1} knocked out`;
  } else if (outcome === "knockedOut" && f.elimination?.outRound) {
    kicker = `${rank ? ordinal(rank) : "Out"} of ${players}`;
    value = `Round ${f.elimination.outRound}`;
    unit = "knocked out in";
  } else if (multi && rank) {
    kicker = `${ordinal(rank)} place`;
  }

  const headline = outcome === "crowd" && rank ? [`#${rank} OF`, `${players}!`] : copy.headline;
  const meBelow = at >= BOARD_ROWS ? f.rows[at] : undefined;
  const top = f.rows.slice(0, meBelow ? BOARD_ROWS - 1 : BOARD_ROWS);
  const shown = top.length + (meBelow ? 1 : 0);

  return {
    outcome,
    accent: copy.accent,
    game: { title: f.title, subtitle: f.subtitle, art: f.art, colors: f.colors },
    headline,
    emoji: copy.emoji,
    kicker,
    crown: multi && rank === 1,
    value,
    unit,
    board: multi
      ? [
          ...top.map((r, i) => ({ ...r, rank: i + 1, me: r.playerId === f.me })),
          ...(meBelow ? [{ ...meBelow, rank: at + 1, me: true }] : []),
        ]
      : [],
    more: multi ? players - shown : 0,
    facts: multi ? [] : f.facts,
    cta: copy.cta,
    mascot: copy.mascot,
    celebrate: outcome !== "bad" && outcome !== "knockedOut",
  };
}
