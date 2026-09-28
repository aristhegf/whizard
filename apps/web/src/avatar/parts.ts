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
   * for each skin tone (`head-3.webp` for tone 3), an eye for each eye colour.
   */
  paintedFor?: "skin" | "eyeColour";
  /**
   * Drawn for the left of the picture only; the right is the same art flipped, around the middle
   * of the face.
   */
  pair?: boolean;
  /** Eyes: where the top of the eye is on the grid, and how wide it is, for fitting lashes. */
  lid?: { top: number; width: number };
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
  { id: "laugh", name: "Laughing", eyes: "closed", mouth: "laugh", brows: "raised" },
  { id: "wink", name: "Wink", eyes: "wink", mouth: "smirk" },
  { id: "cheeky", name: "Cheeky", eyes: "wink", mouth: "tongue" },
  { id: "surprised", name: "Surprised", eyes: "wide", mouth: "surprised", brows: "raised" },
  { id: "thinking", name: "Thinking", mouth: "smirk", brows: "worried" },
];

/**
 * Whether players are offered the avatar creator. Until enough finished art is in, only admins
 * see it (and anyone with the link to /avatar).
 */
export const CREATOR_OPEN = false;

export const NONE = "none";
const none = (name = "None"): PartOption => ({ id: NONE, name, files: [] });

/** The top and width of each eye shape on the grid, measured from the art. */
const EYE_LIDS = [
  { top: 418, width: 124 },
  { top: 429, width: 136 },
  { top: 427, width: 144 },
  { top: 433, width: 143 },
  { top: 433, width: 140 },
  { top: 430, width: 138 },
  { top: 431, width: 133 },
  { top: 432, width: 127 },
];

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
  hair: [none("Bald")],
  eyes: EYE_LIDS.map((lid, i) => ({
    id: `e${i + 1}`,
    name: `Eyes ${i + 1}`,
    files: ["open"],
    ext: "webp" as const,
    paintedFor: "eyeColour" as const,
    pair: true,
    lid,
    poses: ["front"],
  })),
  lashes: [
    none(),
    ...Array.from({ length: 24 }, (_, i) => ({
      id: `l${i + 1}`,
      name: `Lashes ${i + 1}`,
      files: ["lashes"],
      ext: "webp" as const,
      pair: true,
      poses: ["front"],
    })),
  ],
  brows: [none()],
  mouth: [none()],
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
