import type { AvatarField } from "@whizard/protocol";

// Everything the avatar creator can put together. Each pose is its own template, with its own art
// drawn for that angle: /art/avatar-parts/<pose>/<folder>/<option id>/<file>, on the 1024 × 1024
// grid from the art spec. Replacing a file with the finished art needs no code change; a new
// option or pose needs a line here.

export type PartCategory =
  | "face"
  | "hair"
  | "eyes"
  | "lashes"
  | "brows"
  | "mouth"
  | "facialHair"
  | "glasses"
  | "earrings"
  | "headwear"
  | "top"
  | "jacket"
  | "headAccessory"
  | "faceAccessory"
  | "neckAccessory";

export type PaletteName = "skin" | "eyes" | "hair" | "clothes" | "background";

export interface PartOption {
  /** Goes in the avatar code, so never rename one: lowercase letters, digits and hyphens. */
  id: string;
  name: string;
  /** The files in the option's folder, without the extension. */
  files: readonly string[];
  /** Stand-ins are SVG; finished art may come as PNG or WebP. */
  ext?: "svg" | "png" | "webp";
  /** Headwear: how much of the hair it hides. */
  covers?: "none" | "top" | "all";
  /** Headwear drawn in grey, in the colour the player picks. */
  recolour?: boolean;
  /** Head accessories that don't fit under a hat. */
  noHat?: boolean;
  /** The poses this option has art for. */
  poses?: readonly string[];
  /**
   * Painted once for each value of another part, instead of drawn in grey and coloured: a head
   * for each skin tone (`head-3.webp` for tone 3), an eye for each eye colour, lashes for each eye
   * shape (`lashes-e3.webp`), bent to sit on its lid.
   */
  paintedFor?: "skin" | "eyeColour" | "eyes";
  /**
   * Drawn for the left of the picture only; the right is the same art flipped, around the middle
   * of the face.
   */
  pair?: boolean;
  /**
   * Eyes: how far the eyebrows move down for this eye shape (up if less than 0), so they sit the
   * same distance above every eye.
   */
  browDrop?: number;
  /** Lashes: how far the eyebrows move up so these lashes don't touch them. */
  browLift?: number;
}

/** A face for the moment, from the player's expression or a game's reaction. */
export interface Face {
  eyes?: "open" | "closed" | "wide" | "wink";
  /** A mouth option id, in place of the player's own. */
  mouth?: string;
  brows?: BrowPose;
}

export type BrowPose = "relaxed" | "raised" | "worried" | "cross";

/**
 * A pose template: how the character holds their head and hands. Every part is drawn for each
 * pose it supports, so a tilted head gets hair drawn for a tilted head.
 */
export interface PoseTemplate {
  /** Goes in the avatar code, so never rename one. */
  id: string;
  name: string;
  /** Uses another pose's art, flipped left to right. */
  mirrorOf?: string;
}

export const POSES: readonly PoseTemplate[] = [{ id: "front", name: "Straight on" }];

export interface Expression extends Face {
  /** Goes in the avatar code, so never rename one. */
  id: string;
  name: string;
}

/** How far apart the eyes are, in steps either side of the head's own spacing. */
export const EYE_GAPS: readonly { id: string; name: string }[] = [-3, -2, -1, 0, 1, 2, 3].map(
  (step) => ({ id: String(step), name: step === 0 ? "Normal" : step < 0 ? "Closer" : "Wider" }),
);

/** The player's usual face. The game can still pull other faces for its reactions. */
export const EXPRESSIONS: readonly Expression[] = [
  { id: "happy", name: "Happy" },
  { id: "laugh", name: "Laughing", eyes: "closed", mouth: "m6", brows: "raised" },
  { id: "wink", name: "Wink", eyes: "wink", mouth: "m28" },
  { id: "cheeky", name: "Cheeky", eyes: "wink", mouth: "m22" },
  { id: "surprised", name: "Surprised", eyes: "wide", mouth: "m21", brows: "raised" },
  { id: "thinking", name: "Thinking", mouth: "m3", brows: "worried" },
];

/**
 * Whether players are offered the avatar creator. Until enough finished art is in, only admins
 * see it (and anyone with the link to /avatar).
 */
export const CREATOR_OPEN = false;

export const NONE = "none";
const none = (name = "None"): PartOption => ({ id: NONE, name, files: [] });

// Twelve of each (all eight eye shapes), picked to look clearly different from each other. Ids
// are kept when styles are dropped, so saved avatars keep theirs (and ones whose style went get
// the default).

/** Each eye shape, and how far the brows move to sit as far above it as above Eyes 2. */
const EYE_SHAPES = [
  { n: 1, browDrop: -6 },
  { n: 2, browDrop: 0 },
  { n: 3, browDrop: -2 },
  { n: 4, browDrop: 4 },
  { n: 5, browDrop: 4 },
  { n: 6, browDrop: 1 },
  { n: 7, browDrop: 2 },
  { n: 8, browDrop: 2 },
];
const LASHES = [1, 3, 5, 7, 9, 11, 13, 15, 18, 19, 21, 24];
/** Lashes tall enough to reach the brows, and how far the brows move up to leave a gap. */
const BROW_LIFTS: Record<number, number> = { 21: 9 };
const BROWS = [1, 2, 4, 5, 7, 8, 9, 10, 11, 13, 15, 18];
const MOUTHS = [1, 3, 15, 20, 24, 28, 13, 6, 19, 21, 22, 16];
/** Twelve short styles and twelve long ones or updos, numbered as on the hair sheet. */
const HAIR = [
  1, 2, 3, 4, 6, 7, 8, 10, 14, 15, 16, 18, 19, 21, 22, 26, 28, 29, 31, 34, 37, 38, 39, 41,
];
/** Styles with something in them that keeps its own colour: a bandana, a headband. */
const HAIR_DETAILS = new Set([38, 39]);

/** The finished art arrives one part at a time; a category with only None isn't offered yet. */
export const PARTS: Record<PartCategory, readonly PartOption[]> = {
  face: [
    {
      id: "classic",
      name: "Classic",
      files: ["head"],
      ext: "webp",
      paintedFor: "skin",
      poses: ["front"],
    },
  ],
  // Drawn in grey and coloured with the hair colour.
  hair: [
    none("Bald"),
    ...HAIR.map((n, i) => ({
      id: `h${n}`,
      name: `Hair ${i + 1}`,
      files: HAIR_DETAILS.has(n) ? ["front", "details"] : ["front"],
      ext: "webp" as const,
      poses: ["front"],
    })),
  ],
  eyes: EYE_SHAPES.map(({ n, browDrop }, i) => ({
    id: `e${n}`,
    browDrop,
    name: `Eyes ${i + 1}`,
    files: ["open"],
    ext: "webp" as const,
    paintedFor: "eyeColour" as const,
    pair: true,
    poses: ["front"],
  })),
  lashes: [
    none(),
    ...LASHES.map((n, i) => ({
      id: `l${n}`,
      name: `Lashes ${i + 1}`,
      files: ["lashes"],
      paintedFor: "eyes" as const,
      ext: "webp" as const,
      pair: true,
      browLift: BROW_LIFTS[n],
      poses: ["front"],
    })),
  ],
  // Drawn in grey and coloured with the hair colour.
  brows: BROWS.map((n, i) => ({
    id: `b${n}`,
    name: `Brows ${i + 1}`,
    files: ["brows"],
    ext: "webp" as const,
    pair: true,
    poses: ["front"],
  })),
  // Painted once, and tinted to each skin tone so the lips match the face.
  mouth: MOUTHS.map((n, i) => ({
    id: `m${n}`,
    name: `Mouth ${i + 1}`,
    files: ["mouth"],
    ext: "webp" as const,
    paintedFor: "skin" as const,
    poses: ["front"],
  })),
  facialHair: [none()],
  glasses: [none()],
  earrings: [none()],
  headwear: [none()],
  top: [none()],
  jacket: [none()],
  headAccessory: [none()],
  faceAccessory: [none()],
  neckAccessory: [none()],
};

export const FOLDERS: Record<PartCategory, string> = {
  face: "face-shape",
  hair: "hair",
  eyes: "eyes",
  lashes: "eyelashes",
  brows: "eyebrows",
  mouth: "mouth",
  facialHair: "facial-hair",
  glasses: "glasses",
  earrings: "earrings",
  headwear: "headwear",
  top: "top",
  jacket: "jacket",
  headAccessory: "accessory",
  faceAccessory: "accessory",
  neckAccessory: "accessory",
};

export interface Swatch {
  /** Goes in the avatar code, so only ever add to the end of a palette. */
  id: string;
  name: string;
  colour: string;
}

const swatches = (list: [string, string][]): Swatch[] =>
  list.map(([name, colour], i) => ({ id: String(i), name, colour }));

export const PALETTES: Record<PaletteName, readonly Swatch[]> = {
  // One painted head per tone: head-0 (lightest) to head-7.
  skin: swatches([
    ["Tone 1", "#f7ac7a"],
    ["Tone 2", "#ee9e67"],
    ["Tone 3", "#dd844e"],
    ["Tone 4", "#d2703b"],
    ["Tone 5", "#c25e34"],
    ["Tone 6", "#be5c2e"],
    ["Tone 7", "#863e24"],
    ["Tone 8", "#622d1e"],
  ]),
  eyes: swatches([
    ["Dark brown", "#4b261c"],
    ["Brown", "#7a3e12"],
    ["Hazel", "#6b6224"],
    ["Blue", "#4a6386"],
    ["Grey", "#6e6660"],
  ]),
  hair: swatches([
    ["Black", "#2a201c"],
    ["Dark brown", "#3b2419"],
    ["Brown", "#6a3f26"],
    ["Auburn", "#8e3b1f"],
    ["Ginger", "#c4602b"],
    ["Blonde", "#d9ae62"],
    ["Platinum", "#eadbc0"],
    ["Grey", "#a8a4a0"],
    ["Purple", "#7b3fe4"],
    ["Pink", "#f063a8"],
    ["Blue", "#3f7be8"],
    ["Green", "#3bbf86"],
  ]),
  clothes: swatches([
    ["Purple", "#7a3cf0"],
    ["Gold", "#ffc233"],
    ["Pink", "#ff5fa2"],
    ["Blue", "#3d8bff"],
    ["Green", "#35c48a"],
    ["Red", "#ef3b3b"],
    ["Orange", "#ff8a2b"],
    ["Teal", "#17a7a0"],
    ["Navy", "#243a78"],
    ["Black", "#2b2733"],
    ["Grey", "#9a97a3"],
    ["White", "#f2f0f5"],
  ]),
  background: swatches([
    ["Gold", "#ffb14a"],
    ["Blue", "#4aa8ff"],
    ["Pink", "#ff5fa2"],
    ["Green", "#35d39a"],
    ["Purple", "#b57bff"],
    ["Red", "#ff5a5a"],
  ]),
};

/** Where each part of the avatar code comes from. */
export const FIELD_SOURCES: Record<
  AvatarField,
  { category: PartCategory } | { palette: PaletteName } | { choices: readonly { id: string }[] }
> = {
  face: { category: "face" },
  skin: { palette: "skin" },
  hair: { category: "hair" },
  hairColour: { palette: "hair" },
  eyes: { category: "eyes" },
  brows: { category: "brows" },
  mouth: { category: "mouth" },
  facialHair: { category: "facialHair" },
  glasses: { category: "glasses" },
  earrings: { category: "earrings" },
  headwear: { category: "headwear" },
  headwearColour: { palette: "clothes" },
  top: { category: "top" },
  topColour: { palette: "clothes" },
  jacket: { category: "jacket" },
  jacketColour: { palette: "clothes" },
  headAccessory: { category: "headAccessory" },
  faceAccessory: { category: "faceAccessory" },
  neckAccessory: { category: "neckAccessory" },
  background: { palette: "background" },
  pose: { choices: POSES },
  expression: { choices: EXPRESSIONS },
  eyeColour: { palette: "eyes" },
  lashes: { category: "lashes" },
  eyeGap: { choices: EYE_GAPS },
};

export function poseOf(id: string): PoseTemplate {
  return POSES.find((p) => p.id === id) ?? POSES[0]!;
}

export function expressionOf(id: string): Expression {
  return EXPRESSIONS.find((e) => e.id === id) ?? EXPRESSIONS[0]!;
}

/** Whether an option has art for a pose (its own, or the pose it mirrors). */
export function hasPose(option: PartOption, pose: PoseTemplate): boolean {
  return option.id === NONE || (option.poses ?? ["front"]).includes(pose.mirrorOf ?? pose.id);
}

export type Catalogue = Record<PartCategory, readonly PartOption[]>;

export function optionOf(
  category: PartCategory,
  id: string,
  catalogue: Catalogue = PARTS,
): PartOption {
  const options = catalogue[category];
  return options.find((o) => o.id === id) ?? options[0]!;
}

export function swatchOf(palette: PaletteName, id: string): Swatch {
  const list = PALETTES[palette];
  return list.find((s) => s.id === id) ?? list[0]!;
}
