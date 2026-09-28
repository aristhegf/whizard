import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JIGSAW_PICTURES } from "@whizard/game-core";
import { describe, expect, it } from "vitest";

const publicDir = fileURLToPath(new URL("../../../public", import.meta.url));

describe("jigsaw pictures", () => {
  it("has a file for every picture", () => {
    const missing = JIGSAW_PICTURES.filter((p) => !existsSync(`${publicDir}${p.src}`));
    expect(missing.map((p) => p.id)).toEqual([]);
  });
});
