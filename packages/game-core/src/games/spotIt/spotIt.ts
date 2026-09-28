import { z } from "zod";
import { shuffled, type Rng } from "../../random";
import { knockoutLevelPlan } from "../knockout/knockout";
import { LEVEL_POINTS, LEVELS, levelPlan, type Level } from "../levels";
import {
  roundsGame,
  type RoundsKnockoutState,
  type RoundsKnockoutView,
  type RoundsState,
  type RoundsView,
} from "../rounds/rounds";
import { DEFAULT_SPOT_IT_SETTINGS, spotItSettingsSchema, type SpotItSettings } from "./settings";

/** Wrong taps allowed before the round is lost. */
export const SPOT_IT_MAX_MISSES = 3;
export const SPOT_IT_MIN_SIZE = 4;
export const SPOT_IT_MAX_SIZE = 7;

export type SpotItKind = "emoji" | "letter" | "shade" | "rotation";
export const SPOT_IT_KINDS: readonly SpotItKind[] = ["emoji", "letter", "shade", "rotation"];

/** Look-alike pairs, [usual, odd one], from easy to spot to hard. */
export const EMOJI_PAIRS: readonly (readonly [string, string])[][] = [
  [
    ["🍎", "🍏"],
    ["🐶", "🐱"],
    ["🌞", "🌚"],
    ["⚽", "🏀"],
    ["🍋", "🍊"],
  ],
  [
    ["😀", "😃"],
    ["😐", "😑"],
    ["🌕", "🌔"],
    ["🙂", "🙃"],
    ["🐢", "🐊"],
  ],
  [
    ["🕐", "🕑"],
    ["😄", "😁"],
    ["😮", "😯"],
    ["🙁", "😕"],
    ["🌖", "🌗"],
  ],
];

export const LETTER_PAIRS: readonly (readonly [string, string])[][] = [
  [
    ["A", "H"],
    ["X", "Y"],
    ["T", "L"],
    ["K", "Z"],
  ],
  [
    ["E", "F"],
    ["M", "N"],
    ["P", "R"],
    ["U", "V"],
    ["b", "d"],
  ],
  [
    ["O", "Q"],
    ["8", "B"],
    ["C", "G"],
    ["5", "S"],
    ["p", "q"],
  ],
];

/** How far the odd shade's lightness and the odd arrow's angle are off, by level. */
const SHADE_STEPS: Record<Level, number> = { easy: 18, medium: 12, hard: 7 };
const ROTATION_STEPS: Record<Level, number> = { easy: 45, medium: 25, hard: 12 };
/** The grid's side by level; it grows by one in the second half of the game. */
const GRID_SIZES: Record<Level, number> = { easy: 4, medium: 5, hard: 6 };

export type SpotItPuzzleView =
  | { kind: "emoji" | "letter"; size: number; cells: string[] }
  /** CSS colours. */
  | { kind: "shade"; size: number; cells: string[] }
  /** Degrees, for an arrow. */
  | { kind: "rotation"; size: number; cells: number[] };

export interface SpotItPuzzle {
  level: Level;
  odd: number;
  view: SpotItPuzzleView;
}

export interface SpotItReveal {
  odd: number;
  /** The grid again, to show where the odd one was. */
  grid: SpotItPuzzleView;
}

export type SpotItSpeedState = RoundsState<SpotItSettings, SpotItPuzzle, number>;
export type SpotItEliminationState = RoundsKnockoutState<SpotItSettings, SpotItPuzzle, number>;
export type SpotItState = SpotItSpeedState | SpotItEliminationState;
export type SpotItSpeedView = RoundsView<"spot-it", SpotItPuzzleView, number, SpotItReveal>;
export type SpotItEliminationView = RoundsKnockoutView<
  "spot-it",
  SpotItPuzzleView,
  number,
  SpotItReveal
>;
export type SpotItView = SpotItSpeedView | SpotItEliminationView;

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]!;

/**
 * A grid for one round at a level. `progress` runs from 0 on the first round to 1 on the last;
 * grids get a row and column bigger in the second half.
 */
export function spotItPuzzle(
  kind: SpotItKind,
  level: Level,
  progress: number,
  rng: Rng,
): SpotItPuzzle {
  const size = Math.min(SPOT_IT_MAX_SIZE, GRID_SIZES[level] + (progress >= 0.5 ? 1 : 0));
  const tier = LEVELS.indexOf(level);
  const count = size * size;
  const odd = Math.floor(rng() * count);
  const grid = <T>(usual: T, other: T) =>
    Array.from({ length: count }, (_, i) => (i === odd ? other : usual));

  switch (kind) {
    case "emoji":
    case "letter": {
      const pair = pick((kind === "emoji" ? EMOJI_PAIRS : LETTER_PAIRS)[tier]!, rng);
      const [usual, other] = rng() < 0.5 ? pair : [pair[1], pair[0]];
      return { level, odd, view: { kind, size, cells: grid(usual, other) } };
    }
    case "shade": {
      const hue = Math.floor(rng() * 360);
      const saturation = 55 + Math.floor(rng() * 20);
      const lightness = 42 + Math.floor(rng() * 14);
      const step = SHADE_STEPS[level] * (rng() < 0.5 ? -1 : 1);
      const colour = (l: number) => `hsl(${hue} ${saturation}% ${l}%)`;
      return {
        level,
        odd,
        view: { kind, size, cells: grid(colour(lightness), colour(lightness + step)) },
      };
    }
    case "rotation": {
      const angle = Math.floor(rng() * 8) * 45;
      const step = ROTATION_STEPS[level] * (rng() < 0.5 ? -1 : 1);
      return { level, odd, view: { kind, size, cells: grid(angle, angle + step) } };
    }
  }
}

/** One grid per level given, in order. Kinds take turns, and the grids grow through the game. */
export function spotItPuzzles(levels: readonly Level[], rng: Rng): SpotItPuzzle[] {
  let kinds: SpotItKind[] = [];
  return levels.map((level, i) => {
    if (kinds.length === 0) kinds = shuffled(SPOT_IT_KINDS, rng);
    const kind = kinds.shift()!;
    return spotItPuzzle(kind, level, levels.length > 1 ? i / (levels.length - 1) : 0, rng);
  });
}

/** The level of each grid: one level throughout, or Auto's blend from easy to hard. */
export function spotItLevels(settings: SpotItSettings, players = 1): Level[] {
  return settings.mode === "elimination"
    ? knockoutLevelPlan(settings.level, players, settings.rounds)
    : levelPlan(settings.level, settings.rounds);
}

export const spotItGame = roundsGame({
  id: "spot-it",
  name: "Spot It",
  maxPlayers: 20,
  settingsSchema: spotItSettingsSchema,
  defaultSettings: DEFAULT_SPOT_IT_SETTINGS,
  guessSchema: z.number().int().min(0),
  maxMisses: SPOT_IT_MAX_MISSES,
  // Every grid is made from the seed; nothing comes from the content bank.
  contentNeeded: () => null,
  puzzles: (settings: SpotItSettings, _content: unknown, rng, players) =>
    spotItPuzzles(spotItLevels(settings, players), rng),
  points: (puzzle: SpotItPuzzle) => LEVEL_POINTS[puzzle.level],
  check(puzzle, cell) {
    if (cell >= puzzle.view.cells.length) return { rejected: "That isn't on the grid." };
    return cell === puzzle.odd;
  },
  puzzleView: (puzzle) => puzzle.view,
  reveal: (puzzle): SpotItReveal => ({ odd: puzzle.odd, grid: puzzle.view }),
});
