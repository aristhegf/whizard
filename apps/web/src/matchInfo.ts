import {
  JIGSAW_LEVELS,
  JIGSAW_PICTURES,
  LEVEL_NAMES,
  LOGIC_SIZES,
  QUIZ_CATEGORIES,
} from "@whizard/game-core";
import type { GameBest, MatchRecord } from "@whizard/protocol";
import { CATALOG } from "./catalog";

// How a finished game reads on the profile pages: its name, art, level, day and result.

/** A game's name and picture, from the catalogue. */
export function gameInfo(id: string): { name: string; art: string } {
  const game = CATALOG.find((g) => g.id === id);
  return { name: game?.name ?? "Game", art: game?.art ?? "/art/games/quiz.webp" };
}

export const topicName = (id: string | null) =>
  QUIZ_CATEGORIES.find((c) => c.id === id)?.name ?? null;

/** A level as players know it: "Medium", or a Logic grid with its size, "Medium 6×6". */
export function levelName(game: string, difficulty: string | null): string | null {
  if (!difficulty) return null;
  if (game === "logic") {
    const grid = difficulty.replace("x", "×");
    const size = LOGIC_SIZES.find((s) => `${s.size}x${s.size}` === difficulty);
    return size ? `${size.name} ${grid}` : grid;
  }
  // Jigsaws from before levels were stored by pieces per side, which isn't a level.
  if (game === "jigsaw") return JIGSAW_LEVELS.find((l) => l.id === difficulty)?.name ?? null;
  return (
    LEVEL_NAMES[difficulty as keyof typeof LEVEL_NAMES] ??
    difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
  );
}

/** "Bible Quiz · Medium", "Spot It · Auto", "Logic · Medium 6×6", "Jigsaw · Medium". */
export function matchTitle(match: Pick<MatchRecord, "game" | "category" | "difficulty">): string {
  const level = levelName(match.game, match.difficulty);
  const topic = match.game === "quiz" ? topicName(match.category) : null;
  const name = topic ? `${topic} Quiz` : gameInfo(match.game).name;
  if (level) return `${name} · ${level}`;
  if (match.game === "jigsaw") {
    const picture =
      match.category === "photo"
        ? "Your photo"
        : JIGSAW_PICTURES.find((p) => p.id === match.category)?.name;
    if (picture) return `${name} · ${picture}`;
  }
  return name;
}

export const ordinal = (n: number) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

const startOfDay = (at: number) => new Date(at).setHours(0, 0, 0, 0);
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** When a game was, in this device's days: "Today", "Yesterday", "Mon", "3 Mar". */
export function dayLabel(at: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return weekday.format(at);
  return new Date(at).getFullYear() === new Date(now).getFullYear()
    ? dayMonth.format(at)
    : dayMonthYear.format(at);
}

/** A time as a clock shows it: "2:14", or "1:02:05" past an hour. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const s = String(seconds % 60).padStart(2, "0");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}:${s}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${s}`;
}

/** Puzzles with a finish line. Only a solo game times one player: others wait for the last. */
const TIMED_GAMES = new Set(["jigsaw", "connections", "logic"]);

/** How long a solo puzzle took to solve, or null if it wasn't one or wasn't solved. */
export function solveTime(match: MatchRecord): number | null {
  const solved = match.rounds > 0 && match.myCorrect === match.rounds;
  return TIMED_GAMES.has(match.game) && match.players.length === 1 && solved
    ? match.finishedAt - match.startedAt
    : null;
}

/** "Solo", or who else played: "with Tolu, Kemi +2". */
export function withWhom(match: MatchRecord): string {
  const others = match.players.filter((p) => !p.isMe);
  if (others.length === 0) return "Solo";
  const names = others.slice(0, 2).map((p) => p.nickname);
  return `with ${names.join(", ")}${others.length > 2 ? ` +${others.length - 2}` : ""}`;
}

export const formatPoints = (points: number) => points.toLocaleString("en-US");

/** A time as the game writes it: "241 ms", or "4.32 s". */
export const formatMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;

/** A game's best, as its label and value: "Best topic", "Bible 81%"; "Fastest", "2:14". */
export function bestOf(
  game: string,
  best: GameBest,
): { label: string; value: string; on?: string } {
  if (best.kind === "accuracy") {
    const topic = topicName(best.category ?? null) ?? "Quiz";
    return { label: "Best topic", value: `${topic} ${Math.round(best.value * 100)}%` };
  }
  if (game === "reaction" && best.kind === "time") {
    return { label: "Fastest reaction", value: formatMs(best.value) };
  }
  if (best.kind === "time") {
    const level = levelName(game, best.difficulty ?? null);
    // Logic's level already says its size; the grid alone is enough after "on".
    const on = game === "logic" ? best.difficulty?.replace("x", "×") : level;
    return { label: "Fastest", value: clock(best.value), ...(on ? { on } : {}) };
  }
  return { label: "Best score", value: formatPoints(best.value) };
}
