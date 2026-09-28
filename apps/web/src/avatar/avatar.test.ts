import { existsSync } from "node:fs";
import { AVATAR_FIELDS, isCustomAvatar } from "@whizard/protocol";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARTS, decodeAvatar, encodeAvatar, randomParts, type AvatarParts } from "./code";
import { avatarLayers, MAIN_GREY, tintTable } from "./layers";
import { FOLDERS, PALETTES, PARTS, type PartCategory } from "./parts";

const parts = (change: Partial<AvatarParts>): AvatarParts => ({ ...DEFAULT_PARTS, ...change });
const srcs = (p: AvatarParts, pose = {}) => avatarLayers(p, pose).map((l) => l.src);

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
    const code = encodeAvatar(parts({ hair: "mohawk", skin: "99", mouth: "grin" }));
    expect(decodeAvatar(code)).toEqual(
      parts({ hair: DEFAULT_PARTS.hair, skin: DEFAULT_PARTS.skin }),
    );
    expect(decodeAvatar("a03")).toEqual(DEFAULT_PARTS);
  });

  it("has an id no longer than the code allows, for every part and colour", () => {
    const ids = [...Object.values(PARTS).flat(), ...Object.values(PALETTES).flat()].map(
      (o) => o.id,
    );
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,16}$/);
    expect(AVATAR_FIELDS.every((f) => f in DEFAULT_PARTS)).toBe(true);
  });
});

describe("the parts' art", () => {
  const exists = (path: string) => existsSync(new URL(`../../public${path}`, import.meta.url));

  it("is there for every file the parts list names", () => {
    const missing: string[] = [];
    for (const [category, options] of Object.entries(PARTS)) {
      const folder = FOLDERS[category as PartCategory];
      for (const option of options) {
        for (const file of option.files) {
          const path = `/art/avatar-parts/${folder}/${option.id}/${file}.${option.ext ?? "svg"}`;
          if (!exists(path)) missing.push(path);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(exists("/art/avatar-parts/body/standard/body.svg")).toBe(true);
  });
});

describe("avatar layers", () => {
  it("stacks the parts back to front", () => {
    const list = srcs(parts({ hair: "afro", glasses: "round" }));
    const at = (s: string) => list.findIndex((src) => src.includes(s));
    expect(at("hair/afro/back")).toBeLessThan(at("body/"));
    expect(at("body/")).toBeLessThan(at("face-shape/round/head"));
    expect(at("face-shape/round/head")).toBeLessThan(at("eyes/"));
    expect(at("glasses/")).toBeLessThan(at("hair/afro/front"));
  });

  it("presses the hair under a hat that covers the top", () => {
    const list = srcs(parts({ hair: "afro", headwear: "cap" }));
    expect(list).toContain("/art/avatar-parts/hair/afro/hat-front.svg");
    expect(list).toContain("/art/avatar-parts/hair/afro/hat-back.svg");
    expect(list.some((s) => s.endsWith("afro/front.svg") || s.endsWith("afro/back.svg"))).toBe(
      false,
    );
  });

  it("hides the hair and earrings under a hijab, and keeps them under a crown", () => {
    const hijab = srcs(parts({ hair: "long", earrings: "hoops", headwear: "hijab" }));
    expect(hijab.some((s) => s.includes("/hair/") || s.includes("/earrings/"))).toBe(false);
    const crown = srcs(parts({ hair: "long", earrings: "hoops", headwear: "crown" }));
    expect(crown).toContain("/art/avatar-parts/hair/long/front.svg");
    expect(crown).toContain("/art/avatar-parts/earrings/hoops/earrings.svg");
  });

  it("leaves headphones off under a hat", () => {
    expect(srcs(parts({ headAccessory: "headphones" })).some((s) => s.includes("headphones"))).toBe(
      true,
    );
    expect(
      srcs(parts({ headAccessory: "headphones", headwear: "beanie" })).some((s) =>
        s.includes("headphones"),
      ),
    ).toBe(false);
  });

  it("colours grey parts: skin, hair and clothes", () => {
    const layers = avatarLayers(parts({ skin: "0", hairColour: "8", topColour: "3" }));
    const tintOf = (s: string) => layers.find((l) => l.src.includes(s))?.tint;
    expect(tintOf("face-shape/round/head")).toBe(PALETTES.skin[0]!.colour);
    expect(tintOf("hair/curls/front")).toBe(PALETTES.hair[8]!.colour);
    expect(tintOf("eyebrows/")).toBe(PALETTES.hair[8]!.colour);
    expect(tintOf("top/hoodie/front")).toBe(PALETTES.clothes[3]!.colour);
    expect(tintOf("top/hoodie/details")).toBeUndefined();
    expect(tintOf("eyes/")).toBeUndefined();
  });

  it("pulls faces for reactions", () => {
    const wink = avatarLayers(DEFAULT_PARTS, { eyes: "wink", mouth: "smirk", brows: "raised" });
    expect(
      wink.filter((l) => l.src.includes("/eyes/")).map((l) => [l.src.split("/").pop(), l.half]),
    ).toEqual([
      ["open.svg", "left"],
      ["closed.svg", "right"],
    ]);
    expect(wink.some((l) => l.src.endsWith("mouth/smirk/mouth.svg"))).toBe(true);
    expect(wink.find((l) => l.src.includes("/eyebrows/"))?.brows).toBe("raised");
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
