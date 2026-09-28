import {
  AVATAR_FIELDS,
  isCustomAvatar,
  type AvatarField,
  type CustomAvatar,
} from "@whizard/protocol";
import { FIELD_SOURCES, hasPose, NONE, PALETTES, PARTS, poseOf, POSES } from "./parts";

/** A made-up avatar: one option or colour id for each of its parts. */
export type AvatarParts = Record<AvatarField, string>;

export const DEFAULT_PARTS: AvatarParts = {
  face: "classic",
  skin: "4",
  hair: NONE,
  hairColour: "0",
  eyes: "e2",
  brows: NONE,
  mouth: NONE,
  facialHair: NONE,
  glasses: NONE,
  earrings: NONE,
  headwear: NONE,
  headwearColour: "5",
  top: NONE,
  topColour: "0",
  jacket: NONE,
  jacketColour: "8",
  headAccessory: NONE,
  faceAccessory: NONE,
  neckAccessory: NONE,
  background: "4",
  pose: "front",
  expression: "happy",
  eyeColour: "0",
  lashes: "l1",
  eyeGap: "0",
};

function choicesOf(field: AvatarField): readonly { id: string }[] {
  const source = FIELD_SOURCES[field];
  if ("category" in source) return PARTS[source.category];
  if ("palette" in source) return PALETTES[source.palette];
  return source.choices;
}

function known(field: AvatarField, id: string): boolean {
  return choicesOf(field).some((item) => item.id === id);
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
  lashes: 0.75,
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
  const parts = { ...DEFAULT_PARTS, pose: pick(POSES).id };
  const pose = poseOf(parts.pose);
  for (const field of AVATAR_FIELDS) {
    const source = FIELD_SOURCES[field];
    if (field === "pose") continue;
    if (!("category" in source)) {
      parts[field] = pick(choicesOf(field)).id;
      continue;
    }
    // Only parts drawn for the pose.
    const options = PARTS[source.category].filter((o) => hasPose(o, pose));
    const chance = EXTRA_CHANCE[field];
    const hasNone = options.some((o) => o.id === NONE);
    if (chance !== undefined && hasNone) {
      const extras = options.filter((o) => o.id !== NONE);
      parts[field] = extras.length > 0 && random() < chance ? pick(extras).id : NONE;
    } else {
      // Keep sad and wincing faces for the game's reactions, not a random look.
      const usable =
        field === "mouth" ? options.filter((o) => !["sad", "wince"].includes(o.id)) : options;
      parts[field] = pick(usable).id;
    }
  }
  return parts;
}
