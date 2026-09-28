// Levels for every game that has them: one level for the whole game, or Auto, which starts easy
// and gets harder, mixing the three levels as it goes.

export const LEVELS = ["easy", "medium", "hard"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_CHOICES = [...LEVELS, "auto"] as const;
export type LevelChoice = (typeof LEVEL_CHOICES)[number];

export const LEVEL_NAMES: Record<LevelChoice, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  auto: "Auto",
};

/** What a level is worth: harder ones score more. */
export const LEVEL_POINTS: Record<Level, number> = { easy: 1000, medium: 1250, hard: 1500 };

/** Speed and Classic games are split into this many stages at most for Auto. */
export const AUTO_STAGES = 5;

/**
 * Auto's blend at `progress`, from 0 (the first stage) to 1 (the last): the shares of easy,
 * medium and hard, which always add up to 1. All easy at the start, all hard at the end, and a
 * smooth mix between: (1 - p)², 2p(1 - p) and p².
 */
export function autoMix(progress: number): [number, number, number] {
  const p = Math.min(Math.max(progress, 0), 1);
  return [(1 - p) ** 2, 2 * p * (1 - p), p ** 2];
}

/**
 * How many of `count` items are easy, medium and hard for a blend: the nearest whole numbers
 * that add up to `count`, with ties going to the harder level.
 */
export function splitCount(count: number, mix: readonly number[]): [number, number, number] {
  const want = mix.map((share) => share * count);
  const counts = want.map((w) => Math.floor(w + 1e-9)) as [number, number, number];
  let rest = count - counts[0] - counts[1] - counts[2];
  // Largest remainder first; remainders within rounding error of each other are a tie.
  const remainder = (level: number) => want[level]! - counts[level]!;
  const byRemainder = [2, 1, 0].sort((a, b) => {
    const diff = remainder(b) - remainder(a);
    return Math.abs(diff) > 1e-9 ? diff : b - a;
  });
  for (const level of byRemainder) {
    if (rest <= 0) break;
    counts[level]!++;
    rest--;
  }
  return counts;
}

/** The levels for stages of these sizes, stage by stage, the easier ones first in each. */
export function autoLevels(stageSizes: readonly number[]): Level[] {
  const last = Math.max(1, stageSizes.length - 1);
  return stageSizes.flatMap((size, stage) => {
    const [easy, medium, hard] = splitCount(size, autoMix(stage / last));
    return [
      ...Array<Level>(easy).fill("easy"),
      ...Array<Level>(medium).fill("medium"),
      ...Array<Level>(hard).fill("hard"),
    ];
  });
}

/** `count` split into `stages` near-equal parts, the larger ones first. */
export function evenStages(count: number, stages: number): number[] {
  const n = Math.max(1, Math.min(stages, count));
  return Array.from({ length: n }, (_, i) => Math.floor(count / n) + (i < count % n ? 1 : 0));
}

/** One level per item, for a game played straight through (Speed or Classic). */
export function levelPlan(choice: LevelChoice, count: number): Level[] {
  if (count <= 0) return [];
  if (choice !== "auto") return Array<Level>(count).fill(choice);
  return autoLevels(evenStages(count, AUTO_STAGES));
}
