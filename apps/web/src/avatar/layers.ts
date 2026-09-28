import type { AvatarParts } from "./code";
import { FOLDERS, optionOf, swatchOf, type PartCategory, type PartOption } from "./parts";

// Which files make up an avatar, in the order they're drawn, back to front. This is the layer
// stack from the art spec; the drawing itself is in render.ts.

/** A face for the moment: the game shows a grin for a right answer, a wince for a wrong one. */
export interface Pose {
  eyes?: "open" | "closed" | "wide" | "wink";
  /** A mouth option id, in place of the player's own. */
  mouth?: string;
  brows?: BrowPose;
}

export type BrowPose = "relaxed" | "raised" | "worried" | "cross";

export interface Layer {
  src: string;
  /** The colour a grey part is drawn in. */
  tint?: string;
  /** Draw only this side of the centre line, for winks. */
  half?: "left" | "right";
  brows?: BrowPose;
}

const BASE = "/art/avatar-parts";

function file(category: PartCategory, option: PartOption, name: string): string | null {
  if (!option.files.includes(name)) return null;
  return `${BASE}/${FOLDERS[category]}/${option.id}/${name}.${option.ext ?? "svg"}`;
}

export function avatarLayers(parts: AvatarParts, pose: Pose = {}): Layer[] {
  const layers: Layer[] = [];
  const add = (
    category: PartCategory,
    id: string,
    name: string,
    extra: Omit<Layer, "src"> = {},
  ) => {
    const src = file(category, optionOf(category, id), name);
    if (src) layers.push({ src, ...extra });
  };

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

  layers.push({ src: `${BASE}/body/standard/body.svg`, tint: skin });
  add("top", parts.top, "front", { tint: topColour });
  add("top", parts.top, "details");
  add("jacket", parts.jacket, "front", { tint: jacketColour });
  add("jacket", parts.jacket, "details");
  add("neckAccessory", parts.neckAccessory, "accessory");

  add("face", parts.face, "head", { tint: skin });
  add("face", parts.face, "cheeks");
  add("faceAccessory", parts.faceAccessory, "accessory");
  if (covers !== "all") add("earrings", parts.earrings, "earrings");
  add("mouth", pose.mouth ?? parts.mouth, "mouth");
  add("facialHair", parts.facialHair, "facial-hair", { tint: hairColour });

  const eyes = optionOf("eyes", parts.eyes);
  if (pose.eyes === "wink") {
    add("eyes", eyes.id, "open", { half: "left" });
    add("eyes", eyes.id, "closed", { half: "right" });
  } else {
    const state = pose.eyes && eyes.files.includes(pose.eyes) ? pose.eyes : "open";
    add("eyes", eyes.id, state);
  }
  add("brows", parts.brows, "brows", { tint: hairColour, brows: pose.brows ?? "relaxed" });
  add("glasses", parts.glasses, "glasses");

  if (covers === "none") add("hair", parts.hair, "front", { tint: hairColour });
  if (covers === "top") add("hair", parts.hair, "hat-front", { tint: hairColour });
  add("headwear", parts.headwear, "front", headwearTint);
  add("headwear", parts.headwear, "details");
  const accessory = optionOf("headAccessory", parts.headAccessory);
  if (!(accessory.noHat && covers !== "none")) add("headAccessory", accessory.id, "accessory");
  return layers;
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
