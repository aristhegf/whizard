import { existsSync } from "node:fs";
import { AVATAR_FIELDS, isCustomAvatar } from "@whizard/protocol";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARTS, decodeAvatar, encodeAvatar, randomParts, type AvatarParts } from "./code";
import { avatarLayers, MAIN_GREY, tintTable } from "./layers";
import {
  EXPRESSIONS,
  FOLDERS,
  PALETTES,
  PARTS,
  POSES,
  type Catalogue,
  type PartCategory,
  type PartOption,
} from "./parts";

const parts = (change: Partial<AvatarParts>): AvatarParts => ({ ...DEFAULT_PARTS, ...change });

/** A small made-up set of parts, to check how parts fit together before the real art is in. */
const none: PartOption = { id: "none", name: "None", files: [] };
const option = (id: string, files: string[], extra: Partial<PartOption> = {}): PartOption => ({
  id,
  name: id,
  files,
  ext: "png",
  poses: ["front"],
  ...extra,
});
const TEST_PARTS: Catalogue = {
  ...(Object.fromEntries(Object.keys(PARTS).map((c) => [c, [none]])) as unknown as Catalogue),
  face: [option("classic", ["head"], { paintedFor: "skin" })],
  hair: [none, option("afro", ["back", "front", "hat-front", "hat-back"])],
  eyes: [option("round", ["open", "closed", "wide"])],
  mouth: [option("grin", ["mouth"]), option("m28", ["mouth"]), option("m6", ["mouth"])],
  earrings: [none, option("hoops", ["earrings"])],
  glasses: [none, option("round", ["glasses"])],
  headwear: [
    none,
    option("cap", ["front", "details"], { covers: "top", recolour: true }),
    option("hijab", ["back", "front"], { covers: "all", recolour: true }),
    option("crown", ["front"], { covers: "none" }),
  ],
  top: [option("hoodie", ["front", "details"])],
  headAccessory: [none, option("headphones", ["accessory"], { noHat: true })],
};

const front = POSES[0]!;
const base = { eyes: "round", mouth: "grin", top: "hoodie" };
const draw = (p: Partial<AvatarParts>, face = {}) =>
  avatarLayers(parts({ ...base, ...p }), face, front, TEST_PARTS);
const srcs = (p: Partial<AvatarParts>, face = {}) => draw(p, face).layers.map((l) => l.src);

describe("avatar codes", () => {
  it("round-trips, and every code is one the server accepts", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) {
      const p = randomParts(random);
      const code = encodeAvatar(p);
      expect(isCustomAvatar(code)).toBe(true);
      expect(decodeAvatar(code)).toEqual(p);
    }
  });

  it("draws parts it doesn't know as the default", () => {
    const code = encodeAvatar(parts({ hair: "mohawk", skin: "99", expression: "grumpy" }));
    expect(decodeAvatar(code)).toEqual(DEFAULT_PARTS);
    expect(decodeAvatar("a03")).toEqual(DEFAULT_PARTS);
  });

  it("reads codes from before the pose and expression were added", () => {
    const old = encodeAvatar(parts({ skin: "2" }))
      .split(".")
      .slice(0, -2)
      .join(".");
    expect(decodeAvatar(old)).toEqual(parts({ skin: "2" }));
  });

  it("has ids short enough for the code, for every part, colour, pose and expression", () => {
    const ids = [
      ...Object.values(PARTS).flat(),
      ...Object.values(PALETTES).flat(),
      ...POSES,
      ...EXPRESSIONS,
    ].map((o) => o.id);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,16}$/);
    expect(AVATAR_FIELDS.every((f) => f in DEFAULT_PARTS)).toBe(true);
  });
});

describe("the parts' art", () => {
  const exists = (path: string) => existsSync(new URL(`../../public${path}`, import.meta.url));

  it("is there for every file the parts list names, in every pose and skin tone", () => {
    const missing: string[] = [];
    for (const [category, options] of Object.entries(PARTS)) {
      const folder = FOLDERS[category as PartCategory];
      for (const o of options) {
        for (const pose of o.poses ?? ["front"]) {
          for (const file of o.files) {
            const palette = { skin: PALETTES.skin, eyeColour: PALETTES.eyes, eyes: PARTS.eyes };
            const names = o.paintedFor
              ? palette[o.paintedFor].map((t) => `${file}-${t.id}`)
              : [file];
            for (const name of names) {
              const path = `/art/avatar-parts/${pose}/${folder}/${o.id}/${name}.${o.ext ?? "svg"}`;
              if (!exists(path)) missing.push(path);
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("avatar layers", () => {
  it("draws the painted head for the skin tone, without colouring it", () => {
    const [head] = avatarLayers(parts({ skin: "6" })).layers;
    expect(head).toEqual({ src: "/art/avatar-parts/front/face-shape/classic/head-6.webp" });
  });

  it("draws one eye in its colour, with lashes made for it, and flips both for the other side", () => {
    const { layers } = avatarLayers(parts({ eyes: "e3", eyeColour: "3", lashes: "l13" }));
    expect(layers).toContainEqual({
      src: "/art/avatar-parts/front/eyes/e3/open-3.webp",
      pair: true,
    });
    // The lashes are made for each eye shape, to sit on its lid.
    expect(layers).toContainEqual({
      src: "/art/avatar-parts/front/eyelashes/l13/lashes-e3.webp",
      pair: true,
    });
  });

  it("draws tall hair in the hair colour, with its cuffs in their own colours", () => {
    const { layers } = avatarLayers(parts({ hair: "hb4", hairColour: "8" }));
    expect(layers.filter((l) => l.src.includes("/hair/"))).toEqual([
      {
        src: "/art/avatar-parts/front/hair/hb4/front.webp",
        tint: PALETTES.hair[8]!.colour,
        above: 200,
      },
      { src: "/art/avatar-parts/front/hair/hb4/details.webp", above: 200 },
    ]);
  });

  it("draws the hair behind the neck before the head", () => {
    const list = avatarLayers(parts({ hair: "hb1" })).layers.map((l) => l.src);
    const at = (part: string) => list.findIndex((s) => s.includes(part));
    expect(at("hair/hb1/back")).toBeLessThan(at("face-shape/"));
    expect(at("hair/hb1/front")).toBeGreaterThan(at("face-shape/"));
  });

  it("sits the brows as far above every eye shape, and lifts them over tall lashes", () => {
    const browDy = (p: Partial<AvatarParts>) =>
      avatarLayers(parts(p)).layers.find((l) => l.src.includes("/eyebrows/"))?.dy;
    expect(browDy({ eyes: "e2", lashes: "l1" })).toBeUndefined();
    expect(browDy({ eyes: "e1", lashes: "l1" })).toBe(-6);
    expect(browDy({ eyes: "e4", lashes: "none" })).toBe(4);
    expect(browDy({ eyes: "e4", lashes: "l21" })).toBe(4 - 9);
  });

  it("moves the eyes and lashes apart, or closer, together", () => {
    const shifts = (eyeGap: string) =>
      avatarLayers(parts({ eyeGap }))
        .layers.filter((l) => /\/(eyes|eyelashes)\//.test(l.src))
        .map((l) => l.shift);
    expect(shifts("0")).toEqual([undefined, undefined]);
    expect(shifts("2")).toEqual([12, 12]);
    expect(shifts("-3")).toEqual([-18, -18]);
    // The head itself stays put.
    expect(avatarLayers(parts({ eyeGap: "3" })).layers[0]!.shift).toBeUndefined();
  });

  it("stacks the parts back to front, with the clothes over the head's shoulders", () => {
    const list = srcs({ hair: "afro", glasses: "round" });
    const at = (s: string) => list.findIndex((src) => src.includes(s));
    expect(at("hair/afro/back")).toBeLessThan(at("face-shape/"));
    expect(at("face-shape/")).toBeLessThan(at("top/hoodie/front"));
    expect(at("top/hoodie/front")).toBeLessThan(at("eyes/"));
    expect(at("glasses/")).toBeLessThan(at("hair/afro/front"));
  });

  it("presses the hair under a hat that covers the top", () => {
    const list = srcs({ hair: "afro", headwear: "cap" });
    expect(list).toContain("/art/avatar-parts/front/hair/afro/hat-front.png");
    expect(list).toContain("/art/avatar-parts/front/hair/afro/hat-back.png");
    expect(list.some((s) => /afro\/(front|back)\.png$/.test(s))).toBe(false);
  });

  it("hides the hair and earrings under a hijab, and keeps them under a crown", () => {
    const hijab = srcs({ hair: "afro", earrings: "hoops", headwear: "hijab" });
    expect(hijab.some((s) => s.includes("/hair/") || s.includes("/earrings/"))).toBe(false);
    const crown = srcs({ hair: "afro", earrings: "hoops", headwear: "crown" });
    expect(crown).toContain("/art/avatar-parts/front/hair/afro/front.png");
    expect(crown).toContain("/art/avatar-parts/front/earrings/hoops/earrings.png");
  });

  it("leaves headphones off under a hat", () => {
    const has = (p: Partial<AvatarParts>) => srcs(p).some((s) => s.includes("headphones"));
    expect(has({ headAccessory: "headphones" })).toBe(true);
    expect(has({ headAccessory: "headphones", headwear: "cap" })).toBe(false);
  });

  it("colours grey parts, and leaves details as they are", () => {
    const { layers } = draw({ hair: "afro", hairColour: "8", topColour: "3", headwear: "cap" });
    const tintOf = (s: string) => layers.find((l) => l.src.includes(s))?.tint;
    expect(tintOf("hair/afro/hat-front")).toBe(PALETTES.hair[8]!.colour);
    expect(tintOf("top/hoodie/front")).toBe(PALETTES.clothes[3]!.colour);
    expect(tintOf("top/hoodie/details")).toBeUndefined();
    expect(tintOf("headwear/cap/front")).toBe(PALETTES.clothes[5]!.colour);
    expect(tintOf("eyes/")).toBeUndefined();
  });

  it("pulls the player's expression, and a game's reaction over it", () => {
    const eyes = (face = {}, expression = "happy") =>
      draw({ expression }, face)
        .layers.filter((l) => l.src.includes("/eyes/"))
        .map((l) => [l.src.split("/").pop(), l.half]);
    expect(eyes()).toEqual([["open.png", undefined]]);
    expect(eyes({}, "wink")).toEqual([
      ["open.png", "left"],
      ["closed.png", "right"],
    ]);
    // A laugh from the game wins over the player's wink.
    expect(eyes({ eyes: "closed" }, "wink")).toEqual([["closed.png", undefined]]);
    expect(srcs({ expression: "wink" })).toContain("/art/avatar-parts/front/mouth/m28/mouth.png");
  });

  it("draws a mirrored pose from the pose it mirrors, flipped", () => {
    const p = parts(base);
    const flipped = avatarLayers(
      p,
      {},
      { id: "front-flip", name: "Flip", mirrorOf: "front" },
      TEST_PARTS,
    );
    expect(flipped.mirror).toBe(true);
    expect(flipped.layers).toEqual(avatarLayers(p, {}, front, TEST_PARTS).layers);
  });
});

describe("tintTable", () => {
  it("makes the main grey the colour, dark greys shadow and white stay white", () => {
    const table = tintTable("#3d8bff");
    expect([...table.slice(MAIN_GREY * 3, MAIN_GREY * 3 + 3)]).toEqual([0x3d, 0x8b, 0xff]);
    expect([...table.slice(255 * 3)]).toEqual([255, 255, 255]);
    const dark = [...table.slice(0, 3)];
    expect(dark.every((v, i) => v < [0x3d, 0x8b, 0xff][i]! / 2)).toBe(true);
  });
});
