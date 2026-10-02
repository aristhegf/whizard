import { z } from "zod";
import { seededRng, shuffled } from "../../random";

/** The themes the pictures come in, in the order they're shown. */
export const JIGSAW_THEMES = [
  { id: "animals", name: "Animals" },
  { id: "food", name: "Food" },
  { id: "nigeria", name: "Nigeria" },
  { id: "football", name: "Football" },
  { id: "places", name: "Places" },
  { id: "whizard", name: "Whizard" },
] as const;

export type JigsawThemeId = (typeof JIGSAW_THEMES)[number]["id"];

const picture = <Id extends string>(theme: JigsawThemeId, id: Id, name: string) => ({
  id,
  name,
  theme,
  src: `/art/jigsaw/${id}.webp` as const,
});

/** The pictures to put together, by theme. Square, so every piece is too. */
export const JIGSAW_PICTURES = [
  picture("animals", "lion-cub", "Lion cub"),
  picture("animals", "parrot", "Jungle parrot"),
  picture("animals", "elephants", "Elephant family"),
  picture("animals", "tortoise-hare", "Tortoise and hare"),
  picture("animals", "aquarium", "Aquarium"),
  picture("food", "jollof", "Jollof party"),
  picture("food", "suya", "Suya at night"),
  picture("food", "fruit-market", "Fruit stall"),
  picture("food", "birthday-cake", "Birthday cake"),
  picture("food", "ice-cream", "Ice cream parlour"),
  picture("nigeria", "lagos", "Lagos sunset"),
  picture("nigeria", "danfo", "Danfo bus"),
  picture("nigeria", "owambe", "Owambe party"),
  picture("nigeria", "market-women", "Market women"),
  picture("nigeria", "zuma-rock", "Zuma Rock"),
  picture("football", "stadium", "Stadium night"),
  picture("football", "street-football", "Street football"),
  picture("football", "trophy", "Trophy day"),
  picture("football", "goalkeeper", "Diving save"),
  picture("football", "boots-rain", "Boots in the rain"),
  picture("places", "beach", "Beach boats"),
  picture("places", "cabin", "Snowy cabin"),
  picture("places", "space-station", "Space station"),
  picture("places", "coral-reef", "Coral reef"),
  picture("places", "treehouse", "Treehouse village"),
  picture("whizard", "chef", "Chef Whizard"),
  picture("whizard", "astronaut", "Astronaut Whizard"),
  picture("whizard", "sleepover", "Game-night sleepover"),
  picture("whizard", "orchestra", "Whizard conducts"),
  picture("whizard", "roller-coaster", "Roller coaster"),
  picture("whizard", "game-night", "Game night"),
  picture("whizard", "crew", "The crew"),
  picture("whizard", "cards", "Quiz cards"),
  picture("whizard", "mascot", "Whizard"),
  picture("whizard", "game-on", "Game on"),
  picture("whizard", "lets-play", "Let’s play"),
] as const;

export type JigsawPictureId = (typeof JIGSAW_PICTURES)[number]["id"];

/** A picture to put together: one of the site's, or a photo the host brought. */
export interface JigsawPicture {
  id: string;
  name: string;
  src: string;
  /** Width over height, for a photo that keeps its own shape. Square when missing. */
  aspect?: number;
}

/** A photo's ID in its room: random letters and numbers, so it can't be guessed. */
export const JIGSAW_PHOTO_ID = /^[a-z0-9]{16,40}$/;

/** The host's own photo, served by the room it was uploaded to. */
export const photoPicture = (code: string, photo: string, aspect?: number): JigsawPicture => ({
  id: "photo",
  name: "Your photo",
  src: `/api/rooms/${encodeURIComponent(code)}/photo/${photo}`,
  ...(aspect !== undefined && aspect !== 1 ? { aspect } : {}),
});

/** How far from square a photo can be, either way: 2 is twice as wide as it is tall. */
export const PHOTO_MAX_ASPECT = 2;

/**
 * The levels, easiest first. Every level is dragged out of a tray onto the picture's canvas;
 * Insane has about a hundred pieces, cut in the picture's own shape for photos.
 */
export const JIGSAW_LEVELS = [
  { id: "easy", name: "Easy", side: 4 },
  { id: "medium", name: "Medium", side: 5 },
  { id: "hard", name: "Hard", side: 6 },
  { id: "insane", name: "Insane", side: 10 },
] as const;
export type JigsawLevel = (typeof JIGSAW_LEVELS)[number]["id"];
/** Auto is for Elimination: each round a level harder, up to Insane for the final. */
export type JigsawLevelChoice = JigsawLevel | "auto";

export const JIGSAW_MODES = [
  {
    id: "classic",
    name: "Classic",
    description: "No clock. Everyone races to finish, and the first one done wins.",
  },
  {
    id: "speed",
    name: "Speed",
    description:
      "Against the countdown. The fastest finish wins; if time runs out, the most pieces placed.",
  },
  {
    id: "elimination",
    name: "Elimination",
    description:
      "A new jigsaw each round, against the countdown. Finish to stay safe; the fewest pieces go out, until two meet in the final.",
  },
] as const;
export type JigsawMode = (typeof JIGSAW_MODES)[number]["id"];

export const isInsane = (level: JigsawLevel) => level === "insane";

/** About this many pieces in Insane, whatever the picture's shape. */
export const INSANE_PIECES = 100;

/**
 * The grid a level cuts a picture into: a square board up to Hard, and for Insane about a
 * hundred near-square pieces in the picture's own shape (`aspect` is width over height).
 */
export function jigsawGrid(level: JigsawLevel, aspect = 1): { cols: number; rows: number } {
  const found = JIGSAW_LEVELS.find((l) => l.id === level)!;
  if (!isInsane(level)) return { cols: found.side, rows: found.side };
  const cols = Math.max(1, Math.round(Math.sqrt(INSANE_PIECES * aspect)));
  return { cols, rows: Math.max(1, Math.round(INSANE_PIECES / cols)) };
}

const pictureIds = JIGSAW_PICTURES.map((p) => p.id) as [JigsawPictureId, ...JigsawPictureId[]];

/** Rooms from before levels had pieces per side: 3 and 4 are Easy now, 10 is Insane. */
const LEVEL_FROM_SIDE: Record<number, JigsawLevel> = {
  3: "easy",
  4: "easy",
  5: "medium",
  6: "hard",
  10: "insane",
};

const jigsawSettingsObject = z.object({
  /** A picture, "random" for a different one each game, or "photo" for the host's own. */
  picture: z.enum([...pictureIds, "random", "photo"]),
  mode: z.enum(JIGSAW_MODES.map((m) => m.id) as [JigsawMode, ...JigsawMode[]]),
  level: z.enum(["easy", "medium", "hard", "insane", "auto"]),
  /** The host's photo, once they've chosen one. Set by the room when it's uploaded. */
  photo: z.string().regex(JIGSAW_PHOTO_ID).optional(),
  /** The photo's width over height, when it keeps its own shape (for Insane). */
  photoAspect: z
    .number()
    .min(1 / PHOTO_MAX_ASPECT)
    .max(PHOTO_MAX_ASPECT)
    .optional(),
});

export type JigsawSettings = z.infer<typeof jigsawSettingsObject>;

export const jigsawSettingsSchema: z.ZodType<JigsawSettings> = z.preprocess((value) => {
  if (!value || typeof value !== "object") return value;
  const raw = { ...(value as Record<string, unknown>) };
  if (raw.level === undefined && typeof raw.side === "number") {
    raw.level = LEVEL_FROM_SIDE[raw.side] ?? "easy";
  }
  delete raw.side;
  raw.mode ??= "classic";
  // Auto only means something in Elimination.
  if (raw.level === "auto" && raw.mode !== "elimination") raw.level = "easy";
  return raw;
}, jigsawSettingsObject) as z.ZodType<JigsawSettings>;

export const DEFAULT_JIGSAW_SETTINGS: JigsawSettings = {
  picture: "random",
  mode: "classic",
  level: "easy",
};

export interface JigsawContentRequest {
  kind: "jigsaw-picture";
  picture: JigsawSettings["picture"];
  /** The host's photo, for "photo". The room serves it, so it fills this picture in itself. */
  photo?: string;
  photoAspect?: number;
}

/** Content IDs for pictures, so a room's history can steer "random" away from repeats. */
export const jigsawContentId = (id: string) => `jigsaw:${id}`;

/**
 * The picture for a game: the one asked for, or for "random" one the room hasn't used lately.
 * `recent` is the room's content history, newest first.
 */
export function pickJigsawPicture(
  request: JigsawContentRequest,
  seed: number,
  recent: readonly string[] = [],
): JigsawPicture {
  // The host's photo is filled in by the room; without one, any picture will do.
  const chosen = JIGSAW_PICTURES.find((p) => p.id === request.picture);
  if (chosen) return chosen;
  const lastUsed = (p: (typeof JIGSAW_PICTURES)[number]) => {
    const at = recent.indexOf(jigsawContentId(p.id));
    return at === -1 ? Infinity : at;
  };
  // Shuffle first so ties break differently each game, then prefer the longest unused.
  const pool = shuffled(JIGSAW_PICTURES, seededRng(seed));
  return pool.reduce((best, p) => (lastUsed(p) > lastUsed(best) ? p : best));
}
