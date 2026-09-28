import { z } from "zod";

/** Grid sizes, from the easiest to the hardest, with the shape of their boxes. */
export const LOGIC_SIZES = [
  { size: 4, name: "Easy", boxRows: 2, boxCols: 2 },
  { size: 6, name: "Medium", boxRows: 2, boxCols: 3 },
  { size: 9, name: "Hard", boxRows: 3, boxCols: 3 },
] as const;

export type LogicSize = (typeof LOGIC_SIZES)[number]["size"];

/** Minutes a player has to fill the grid. */
export const LOGIC_MINUTES = [5, 10, 15] as const;

export const logicSettingsSchema = z.object({
  size: z.union([z.literal(4), z.literal(6), z.literal(9)]),
  minutes: z.literal(LOGIC_MINUTES),
});

export type LogicSettings = z.infer<typeof logicSettingsSchema>;

export const DEFAULT_LOGIC_SETTINGS: LogicSettings = { size: 6, minutes: 10 };

export const logicShape = (size: LogicSize) => LOGIC_SIZES.find((s) => s.size === size)!;
