import { z } from "zod";

/** Grid sizes, from the easiest to the hardest, with the shape of their boxes. */
export const LOGIC_SIZES = [
  { size: 4, name: "Easy", boxRows: 2, boxCols: 2 },
  { size: 6, name: "Medium", boxRows: 2, boxCols: 3 },
  { size: 9, name: "Hard", boxRows: 3, boxCols: 3 },
] as const;

export type LogicSize = (typeof LOGIC_SIZES)[number]["size"];

/** Minutes to fill the grid: for the whole game in Speed, for each round in Elimination. */
export const LOGIC_MINUTES = [5, 10, 15] as const;

export const LOGIC_MODES = [
  {
    id: "classic",
    name: "Classic",
    description: "No clock. Everyone races to fill the grid, and the first one done wins.",
  },
  {
    id: "speed",
    name: "Speed",
    description:
      "Against the countdown. The fastest solve wins; if time runs out, the most cells filled.",
  },
  {
    id: "elimination",
    name: "Elimination",
    description:
      "A new grid each round, against the countdown. Solve it to stay safe; the fewest cells filled go out, until two meet in the final.",
  },
] as const;
export type LogicMode = (typeof LOGIC_MODES)[number]["id"];

const logicSettingsObject = z.object({
  mode: z.enum(LOGIC_MODES.map((m) => m.id) as [LogicMode, ...LogicMode[]]),
  size: z.union([z.literal(4), z.literal(6), z.literal(9)]),
  minutes: z.literal(LOGIC_MINUTES),
});

export type LogicSettings = z.infer<typeof logicSettingsObject>;

export const logicSettingsSchema: z.ZodType<LogicSettings> = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const raw = { ...(value as Record<string, unknown>) };
  // Rooms saved before modes raced against the clock, which is Speed now.
  raw.mode ??= "speed";
  return raw;
}, logicSettingsObject) as z.ZodType<LogicSettings>;

export const DEFAULT_LOGIC_SETTINGS: LogicSettings = { mode: "speed", size: 6, minutes: 10 };

export const logicShape = (size: LogicSize) => LOGIC_SIZES.find((s) => s.size === size)!;
