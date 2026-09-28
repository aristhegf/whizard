import {
  AVATAR_FIELDS,
  isCustomAvatar,
  type AvatarField,
  type CustomAvatar,
} from "@whizard/protocol";
import { FIELD_SOURCES, NONE, PALETTES, PARTS } from "./parts";

/** A made-up avatar: one option or colour id for each of its parts. */
export type AvatarParts = Record<AvatarField, string>;

export const DEFAULT_PARTS: AvatarParts = {
  face: "round",
  skin: "5",
  hair: "curls",
  hairColour: "0",
  eyes: "round",
  brows: "soft",
  mouth: "grin",
  facialHair: NONE,
  glasses: NONE,
  earrings: NONE,
  headwear: NONE,
  headwearColour: "5",
  top: "hoodie",
  topColour: "0",
  jacket: NONE,
  jacketColour: "8",
  headAccessory: NONE,
  faceAccessory: NONE,
  neckAccessory: NONE,
  background: "4",
};

function known(field: AvatarField, id: string): boolean {
  const source = FIELD_SOURCES[field];
  const list = "category" in source ? PARTS[source.category] : PALETTES[source.palette];
  return list.some((item) => item.id === id);
}

export function encodeAvatar(parts: AvatarParts): CustomAvatar {
  return `w1.${AVATAR_FIELDS.map((field) => parts[field]).join(".")}`;
}

/** The parts of an avatar code. Anything this version of the site doesn't know is the default. */
export function decodeAvatar(code: string): AvatarParts {
  const parts = { ...DEFAULT_PARTS };
  if (!isCustomAvatar(code)) return parts;
  const ids = code.split(".").slice(1);
  AVATAR_FIELDS.forEach((field, i) => {
    const id = ids[i];
    if (id !== undefined && known(field, id)) parts[field] = id;
  });
  return parts;
}

/** How often a random avatar gets each optional extra. */
const EXTRA_CHANCE: Partial<Record<AvatarField, number>> = {
  facialHair: 0.2,
  glasses: 0.3,
  earrings: 0.3,
  headwear: 0.25,
  jacket: 0.3,
  headAccessory: 0.15,
  faceAccessory: 0.15,
  neckAccessory: 0.15,
};

export function randomParts(random: () => number = Math.random): AvatarParts {
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const parts = { ...DEFAULT_PARTS };
  for (const field of AVATAR_FIELDS) {
    const source = FIELD_SOURCES[field];
    if ("palette" in source) {
      parts[field] = pick(PALETTES[source.palette]).id;
      continue;
    }
    const options = PARTS[source.category];
    const chance = EXTRA_CHANCE[field];
    const hasNone = options.some((o) => o.id === NONE);
    if (chance !== undefined && hasNone) {
      parts[field] = random() < chance ? pick(options.filter((o) => o.id !== NONE)).id : NONE;
    } else {
      // Keep sad and wincing faces for the game's reactions, not a random look.
      const usable =
        field === "mouth" ? options.filter((o) => !["sad", "wince"].includes(o.id)) : options;
      parts[field] = pick(usable).id;
    }
  }
  return parts;
}
