import { z } from "zod";
import { seededRng, shuffled } from "../../random";

/** The pictures to put together. Square, so every piece is too. */
export const JIGSAW_PICTURES = [
  { id: "game-night", name: "Game night", src: "/art/jigsaw/game-night.webp" },
  { id: "crew", name: "The crew", src: "/art/jigsaw/crew.webp" },
  { id: "cards", name: "Quiz cards", src: "/art/jigsaw/cards.webp" },
  { id: "mascot", name: "Whizard", src: "/art/jigsaw/mascot.webp" },
  { id: "game-on", name: "Game on", src: "/art/jigsaw/game-on.webp" },
  { id: "lets-play", name: "Let’s play", src: "/art/jigsaw/lets-play.webp" },
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
