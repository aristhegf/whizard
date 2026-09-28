import { z } from "zod";
import { shuffled, type Rng } from "../../random";
import { roundsGame, type RoundsState, type RoundsView } from "../rounds/rounds";
import { DEFAULT_SPOT_IT_SETTINGS, spotItSettingsSchema, type SpotItSettings } from "./settings";

/** Wrong taps allowed before the round is lost. */
export const SPOT_IT_MAX_MISSES = 3;
export const SPOT_IT_MIN_SIZE = 4;
export const SPOT_IT_MAX_SIZE = 7;

export type SpotItKind = "emoji" | "letter" | "shade" | "rotation";
export const SPOT_IT_KINDS: readonly SpotItKind[] = ["emoji", "letter", "shade", "rotation"];

type Tier = 0 | 1 | 2;
const TIER_POINTS = [1000, 1250, 1500] as const;

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

/** How far the odd shade's lightness and the odd arrow's angle are off, from easy to hard. */
const SHADE_STEPS = [18, 7] as const;
const ROTATION_STEPS = [45, 12] as const;

export type SpotItPuzzleView =
  | { kind: "emoji" | "letter"; size: number; cells: string[] }
  /** CSS colours. */
  | { kind: "shade"; size: number; cells: string[] }
  /** Degrees, for an arrow. */
  | { kind: "rotation"; size: number; cells: number[] };

export interface SpotItPuzzle {
  tier: Tier;
  odd: number;
  view: SpotItPuzzleView;
}

export interface SpotItReveal {
  odd: number;
  /** The grid again, to show where the odd one was. */
  grid: SpotItPuzzleView;
}

export type SpotItState = RoundsState<SpotItSettings, SpotItPuzzle, number>;
export type SpotItView = RoundsView<"spot-it", SpotItPuzzleView, number, SpotItReveal>;

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]!;
const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;

/** A grid for one round. `progress` runs from 0 on the first round to 1 on the last. */
export function spotItPuzzle(kind: SpotItKind, progress: number, rng: Rng): SpotItPuzzle {
  const size = SPOT_IT_MIN_SIZE + Math.round(progress * (SPOT_IT_MAX_SIZE - SPOT_IT_MIN_SIZE));
  const tier = Math.min(2, Math.floor(progress * 3)) as Tier;
  const count = size * size;
  const odd = Math.floor(rng() * count);
  const grid = <T>(usual: T, other: T) =>
    Array.from({ length: count }, (_, i) => (i === odd ? other : usual));

  switch (kind) {
    case "emoji":
    case "letter": {
      const pair = pick((kind === "emoji" ? EMOJI_PAIRS : LETTER_PAIRS)[tier]!, rng);
      const [usual, other] = rng() < 0.5 ? pair : [pair[1], pair[0]];
      return { tier, odd, view: { kind, size, cells: grid(usual, other) } };
    }
    case "shade": {
      const hue = Math.floor(rng() * 360);
      const saturation = 55 + Math.floor(rng() * 20);
      const lightness = 42 + Math.floor(rng() * 14);
      const step = Math.round(lerp(SHADE_STEPS, progress)) * (rng() < 0.5 ? -1 : 1);
      const colour = (l: number) => `hsl(${hue} ${saturation}% ${l}%)`;
      return {
        tier,
        odd,
        view: { kind, size, cells: grid(colour(lightness), colour(lightness + step)) },
      };
    }
    case "rotation": {
      const angle = Math.floor(rng() * 8) * 45;
      const step = Math.round(lerp(ROTATION_STEPS, progress)) * (rng() < 0.5 ? -1 : 1);
      return { tier, odd, view: { kind, size, cells: grid(angle, angle + step) } };
    }
  }
}

/** Grids grow and the odd one out gets subtler as the game goes on. Kinds take turns. */
export function spotItPuzzles(rounds: number, rng: Rng): SpotItPuzzle[] {
  let kinds: SpotItKind[] = [];
  return Array.from({ length: rounds }, (_, i) => {
    if (kinds.length === 0) kinds = shuffled(SPOT_IT_KINDS, rng);
    const kind = kinds.shift()!;
    return spotItPuzzle(kind, rounds > 1 ? i / (rounds - 1) : 0, rng);
  });
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
  puzzles: (settings: SpotItSettings, _content: unknown, rng) =>
    spotItPuzzles(settings.rounds, rng),
  points: (puzzle: SpotItPuzzle) => TIER_POINTS[puzzle.tier],
  check(puzzle, cell) {
    if (cell >= puzzle.view.cells.length) return { rejected: "That isn't on the grid." };
    return cell === puzzle.odd;
  },
  puzzleView: (puzzle) => puzzle.view,
  reveal: (puzzle): SpotItReveal => ({ odd: puzzle.odd, grid: puzzle.view }),
  summary: () => ({ category: null, difficulty: null, mode: null }),
});
