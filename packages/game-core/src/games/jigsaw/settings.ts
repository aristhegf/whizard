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
}

/** A photo's ID in its room: random letters and numbers, so it can't be guessed. */
export const JIGSAW_PHOTO_ID = /^[a-z0-9]{16,40}$/;

/** The host's own photo, served by the room it was uploaded to. */
export const photoPicture = (code: string, photo: string): JigsawPicture => ({
  id: "photo",
  name: "Your photo",
  src: `/api/rooms/${encodeURIComponent(code)}/photo/${photo}`,
});

/** Pieces per side: 3×3 up to 6×6. */
export const JIGSAW_SIZES = [
  { side: 3, name: "Easy" },
  { side: 4, name: "Medium" },
  { side: 5, name: "Hard" },
  { side: 6, name: "Expert" },
] as const;
export type JigsawSide = (typeof JIGSAW_SIZES)[number]["side"];

const pictureIds = JIGSAW_PICTURES.map((p) => p.id) as [JigsawPictureId, ...JigsawPictureId[]];

export const jigsawSettingsSchema = z.object({
  /** A picture, "random" for a different one each game, or "photo" for the host's own. */
  picture: z.enum([...pictureIds, "random", "photo"]),
  side: z.literal(JIGSAW_SIZES.map((s) => s.side) as [JigsawSide, ...JigsawSide[]]),
  /** The host's photo, once they've chosen one. Set by the room when it's uploaded. */
  photo: z.string().regex(JIGSAW_PHOTO_ID).optional(),
});

export type JigsawSettings = z.infer<typeof jigsawSettingsSchema>;

export const DEFAULT_JIGSAW_SETTINGS: JigsawSettings = { picture: "random", side: 4 };

export interface JigsawContentRequest {
  kind: "jigsaw-picture";
  picture: JigsawSettings["picture"];
  /** The host's photo, for "photo". The room serves it, so it fills this picture in itself. */
  photo?: string;
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
