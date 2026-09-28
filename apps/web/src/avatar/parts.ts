import type { AvatarField } from "@whizard/protocol";

// Everything the avatar creator can put together. The art for each option sits in
// /art/avatar-parts/<folder>/<option id>/<file>, drawn on the 1024 × 1024 grid from the art spec.
// Replacing a file with the finished art needs no code change; a new option needs a line here.

export type PartCategory =
  | "face"
  | "hair"
  | "eyes"
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

export type PaletteName = "skin" | "hair" | "clothes" | "background";

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
}

export const NONE = "none";
const none = (name = "None"): PartOption => ({ id: NONE, name, files: [] });

export const PARTS: Record<PartCategory, readonly PartOption[]> = {
  face: [
    { id: "round", name: "Round", files: ["head", "cheeks"] },
    { id: "oval", name: "Oval", files: ["head", "cheeks"] },
    { id: "square", name: "Square", files: ["head", "cheeks"] },
    { id: "heart", name: "Heart", files: ["head", "cheeks"] },
  ],
  hair: [
    { id: "short", name: "Short", files: ["front", "hat-front"] },
    { id: "curls", name: "Curls", files: ["front", "hat-front"] },
    { id: "afro", name: "Afro", files: ["back", "front", "hat-front", "hat-back"] },
    { id: "puffs", name: "Puffs", files: ["front", "hat-front"] },
    { id: "braids", name: "Braids", files: ["back", "front", "hat-front", "hat-back"] },
    { id: "bun", name: "Bun", files: ["front", "hat-front"] },
    { id: "long", name: "Long", files: ["back", "front", "hat-front", "hat-back"] },
    none("Bald"),
  ],
  eyes: [
    { id: "round", name: "Round", files: ["open", "closed", "wide"] },
    { id: "lashes", name: "Lashes", files: ["open", "closed", "wide"] },
    { id: "sparkle", name: "Sparkle", files: ["open", "closed", "wide"] },
    { id: "narrow", name: "Narrow", files: ["open", "closed", "wide"] },
  ],
  brows: [
    { id: "soft", name: "Soft", files: ["brows"] },
    { id: "thick", name: "Thick", files: ["brows"] },
    { id: "arched", name: "Arched", files: ["brows"] },
    { id: "straight", name: "Straight", files: ["brows"] },
  ],
  mouth: [
    { id: "grin", name: "Grin", files: ["mouth"] },
    { id: "smile", name: "Smile", files: ["mouth"] },
    { id: "laugh", name: "Laugh", files: ["mouth"] },
    { id: "smirk", name: "Smirk", files: ["mouth"] },
    { id: "tongue", name: "Cheeky", files: ["mouth"] },
    { id: "surprised", name: "Surprised", files: ["mouth"] },
    { id: "wince", name: "Wince", files: ["mouth"] },
    { id: "sad", name: "Sad", files: ["mouth"] },
  ],
  facialHair: [
    none(),
    { id: "stubble", name: "Stubble", files: ["facial-hair"] },
    { id: "moustache", name: "Moustache", files: ["facial-hair"] },
    { id: "goatee", name: "Goatee", files: ["facial-hair"] },
    { id: "beard", name: "Beard", files: ["facial-hair"] },
  ],
  glasses: [
    none(),
    { id: "round", name: "Round", files: ["glasses"] },
    { id: "square", name: "Square", files: ["glasses"] },
    { id: "shades", name: "Shades", files: ["glasses"] },
  ],
  earrings: [
    none(),
    { id: "studs", name: "Studs", files: ["earrings"] },
    { id: "hoops", name: "Hoops", files: ["earrings"] },
  ],
  headwear: [
    none(),
    { id: "cap", name: "Cap", files: ["front", "details"], covers: "top", recolour: true },
    { id: "beanie", name: "Beanie", files: ["front"], covers: "top", recolour: true },
    { id: "crown", name: "Crown", files: ["front"], covers: "none" },
    { id: "hijab", name: "Hijab", files: ["back", "front"], covers: "all", recolour: true },
  ],
  top: [
    { id: "hoodie", name: "Hoodie", files: ["back", "front", "details"] },
    { id: "tee", name: "T-shirt", files: ["front"] },
    { id: "shirt", name: "Shirt", files: ["front", "details"] },
  ],
  jacket: [
    none(),
    { id: "bomber", name: "Bomber", files: ["front", "details"] },
    { id: "blazer", name: "Blazer", files: ["front", "details"] },
  ],
  headAccessory: [
    none(),
    { id: "headphones", name: "Headphones", files: ["accessory"], noHat: true },
    { id: "flower", name: "Flower", files: ["accessory"] },
  ],
  faceAccessory: [
    none(),
    { id: "freckles", name: "Freckles", files: ["accessory"] },
    { id: "star", name: "Star", files: ["accessory"] },
  ],
  neckAccessory: [
    none(),
    { id: "chain", name: "Chain", files: ["accessory"] },
    { id: "bowtie", name: "Bow tie", files: ["accessory"] },
  ],
};

export const FOLDERS: Record<PartCategory, string> = {
  face: "face-shape",
  hair: "hair",
  eyes: "eyes",
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
  skin: swatches([
    ["Tone 1", "#f6d5bc"],
    ["Tone 2", "#edbf9c"],
    ["Tone 3", "#e0a57e"],
    ["Tone 4", "#c98a60"],
    ["Tone 5", "#b0714a"],
    ["Tone 6", "#95593a"],
    ["Tone 7", "#7a452c"],
    ["Tone 8", "#603421"],
    ["Tone 9", "#4a2718"],
    ["Tone 10", "#3a1e13"],
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
  { category: PartCategory } | { palette: PaletteName }
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
};

export function optionOf(category: PartCategory, id: string): PartOption {
  const options = PARTS[category];
  return options.find((o) => o.id === id) ?? options[0]!;
}

export function swatchOf(palette: PaletteName, id: string): Swatch {
  const list = PALETTES[palette];
  return list.find((s) => s.id === id) ?? list[0]!;
}
