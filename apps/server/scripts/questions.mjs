// Reads the question bank for scripts, with the same version fingerprint as
// questionVersion() in packages/content.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../../packages/content/src/questions/", import.meta.url));

export const questions = new Map(
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(dir + f, "utf8")))
    .map((q) => [q.id, q]),
);

export function questionVersion(q) {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify([q.prompt, q.choices])) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
