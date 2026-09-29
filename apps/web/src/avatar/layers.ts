import type { AvatarParts } from "./code";
import {
  expressionOf,
  FOLDERS,
  hasPose,
  optionOf as pickOption,
  PARTS,
  poseOf,
  swatchOf,
  type BrowPose,
  type Catalogue,
  type Face,
  type PartCategory,
  type PartOption,
  type PoseTemplate,
} from "./parts";

// Which files make up an avatar, in the order they're drawn, back to front. This is the layer
// stack from the art spec; the drawing itself is in render.ts.

export type { BrowPose, Face };

export interface Layer {
  src: string;
  /** The colour a grey part is drawn in. */
  tint?: string;
  /** Draw only this side of the centre line, for winks. */
  half?: "left" | "right";
  /** Draw it again, flipped, for the other side of the face. */
  pair?: boolean;
  /** Move a pair this far out from the middle of the face on each side (in by less than 0). */
  shift?: number;
  /** Move it down this far on the grid (up if less than 0). */
  dy?: number;
  /** The file reaches this far above the grid. */
  above?: number;
  brows?: BrowPose;
}

export interface AvatarDrawing {
  layers: Layer[];
  /** Draw everything flipped left to right, for a pose that mirrors another. */
  mirror: boolean;
}

const BASE = "/art/avatar-parts";

/** Pixels on the grid each step of the eye gap moves each eye. */
export const EYE_GAP_STEP = 6;

/**
 * The layers for an avatar. `face` is a face for the moment (a game's reaction) in place of the
 * player's own expression.
 */
export function avatarLayers(
  parts: AvatarParts,
  face: Face = {},
  pose: PoseTemplate = poseOf(parts.pose),
  catalogue: Catalogue = PARTS,
): AvatarDrawing {
  const optionOf = (category: PartCategory, id: string) => pickOption(category, id, catalogue);
  const art = pose.mirrorOf ?? pose.id;
  const layers: Layer[] = [];
  const file = (category: PartCategory, option: PartOption, name: string): string | null => {
    if (!option.files.includes(name) || !hasPose(option, pose)) return null;
    const variant = option.paintedFor ? `-${parts[option.paintedFor]}` : "";
    return `${BASE}/${art}/${FOLDERS[category]}/${option.id}/${name}${variant}.${option.ext ?? "svg"}`;
  };
  const add = (
    category: PartCategory,
    id: string,
    name: string,
    extra: Omit<Layer, "src"> = {},
  ) => {
    const option = optionOf(category, id);
    const src = file(category, option, name);
    if (!src) return;
    // Parts painted for each skin tone (or eye colour) carry their own colour.
    const { tint, ...rest } = extra;
    const layer: Layer =
      option.paintedFor || tint === undefined ? { src, ...rest } : { src, tint, ...rest };
    if (option.pair) layer.pair = true;
    if (option.above) layer.above = option.above;
    layers.push(layer);
  };

  const usual = expressionOf(parts.expression);
  const look: Face = { eyes: usual.eyes, mouth: usual.mouth, brows: usual.brows, ...face };
  const skin = swatchOf("skin", parts.skin).colour;
  const hairColour = swatchOf("hair", parts.hairColour).colour;
  const topColour = swatchOf("clothes", parts.topColour).colour;
  const jacketColour = swatchOf("clothes", parts.jacketColour).colour;
  const headwear = optionOf("headwear", parts.headwear);
  const headwearTint = headwear.recolour
    ? { tint: swatchOf("clothes", parts.headwearColour).colour }
    : {};
  const covers = headwear.id === "none" ? "none" : (headwear.covers ?? "none");

  add("top", parts.top, "back", { tint: topColour });
  add("jacket", parts.jacket, "back", { tint: jacketColour });
  if (covers === "none") add("hair", parts.hair, "back", { tint: hairColour });
  if (covers === "top") add("hair", parts.hair, "hat-back", { tint: hairColour });
  add("headwear", parts.headwear, "back", headwearTint);

  // The head comes with its neck and shoulders, so the clothes go over it.
  add("face", parts.face, "head", { tint: skin });
  add("face", parts.face, "cheeks");
  // The hair's soft shadow on the skin, under the face's own details.
  if (covers === "none") add("hair", parts.hair, "shadow");
  add("top", parts.top, "front", { tint: topColour });
  add("top", parts.top, "details");
  add("jacket", parts.jacket, "front", { tint: jacketColour });
  add("jacket", parts.jacket, "details");
  add("neckAccessory", parts.neckAccessory, "accessory");

  add("faceAccessory", parts.faceAccessory, "accessory");
  if (covers !== "all") add("earrings", parts.earrings, "earrings");
  add("mouth", look.mouth ?? parts.mouth, "mouth");
  add("facialHair", parts.facialHair, "facial-hair", { tint: hairColour });

  const eyes = optionOf("eyes", parts.eyes);
  // Eyes without a closed version stay open for a wink.
  if (look.eyes === "wink" && eyes.files.includes("closed")) {
    add("eyes", eyes.id, "open", { half: "left" });
    add("eyes", eyes.id, "closed", { half: "right" });
  } else {
    const state = look.eyes && eyes.files.includes(look.eyes) ? look.eyes : "open";
    add("eyes", eyes.id, state);
  }
  // Each lash style is bent to sit on the lid of each eye shape.
  add("lashes", parts.lashes, "lashes");
  // The brows sit the same distance above every eye shape, and clear tall lashes.
  const browDy = (eyes.browDrop ?? 0) - (optionOf("lashes", parts.lashes).browLift ?? 0);
  add("brows", parts.brows, "brows", {
    tint: hairColour,
    brows: look.brows ?? "relaxed",
    ...(browDy !== 0 && { dy: browDy }),
  });
  add("glasses", parts.glasses, "glasses");

  if (covers === "none") {
    add("hair", parts.hair, "front", { tint: hairColour });
    // A hair cuff or tie, in its own colours.
    add("hair", parts.hair, "details");
  }
  if (covers === "top") add("hair", parts.hair, "hat-front", { tint: hairColour });
  add("headwear", parts.headwear, "front", headwearTint);
  add("headwear", parts.headwear, "details");
  const accessory = optionOf("headAccessory", parts.headAccessory);
  if (!(accessory.noHat && covers !== "none")) add("headAccessory", accessory.id, "accessory");
  // The space between the eyes moves the eyes, lashes and brows together.
  const shift = (Number(parts.eyeGap) || 0) * EYE_GAP_STEP;
  if (shift !== 0) {
    for (const layer of layers) {
      if (/\/(eyes|eyelashes|eyebrows)\//.test(layer.src)) layer.shift = shift;
    }
  }
  return { layers, mirror: pose.mirrorOf !== undefined };
}

const hex = (colour: string): [number, number, number] => {
  const n = parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);

/** Where the main colour sits in a grey part: about 55% grey. */
export const MAIN_GREY = 140;
const HIGHLIGHT_GREY = 235;

/**
 * Colours a grey part: dark greys become the shadow colour, the main grey the chosen colour,
 * light greys the highlight, and pure white stays white. Returns r, g, b for each grey level.
 */
export function tintTable(colour: string): Uint8ClampedArray {
  const main = hex(colour);
  const shadow = mix(main, [0, 0, 0], 0.72);
  const highlight = mix(main, [255, 255, 255], 0.5);
  const table = new Uint8ClampedArray(256 * 3);
  for (let grey = 0; grey < 256; grey++) {
    const rgb =
      grey <= MAIN_GREY
        ? mix(shadow, main, grey / MAIN_GREY)
        : grey <= HIGHLIGHT_GREY
          ? mix(main, highlight, (grey - MAIN_GREY) / (HIGHLIGHT_GREY - MAIN_GREY))
          : mix(highlight, [255, 255, 255], (grey - HIGHLIGHT_GREY) / (255 - HIGHLIGHT_GREY));
    table.set(rgb.map(Math.round), grey * 3);
  }
  return table;
}
