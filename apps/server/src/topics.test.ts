import { QUIZ_CATEGORIES } from "@whizard/game-core";
import { describe, expect, it } from "vitest";

// The migration as plain text. Node is named at run time so the Worker's type check doesn't go
// looking for its modules, as in testDb.ts; the `URL` and `import.meta` casts are the same ones.
const fsModule = "node:fs";
const fs = (await import(fsModule)) as {
  readFileSync(path: URL, encoding: "utf8"): string;
};
const sql = fs.readFileSync(
  new URL("../migrations/0020_topics.sql", (import.meta as ImportMeta & { url: string }).url),
  "utf8",
);

describe("the topics migration", () => {
  it("seeds exactly the shipped twelve, in order, with taglines and colours", () => {
    const rows = [
      ...sql.matchAll(/\('([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(\[[^\]]*\])', (\d+)\)/g),
    ].map((m) => ({ id: m[1]!, name: m[2]!, tagline: m[3]!, colors: m[4]!, sort: Number(m[5]) }));
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.id)).toEqual(QUIZ_CATEGORIES.map((c) => c.id));
    rows.forEach((row, i) => {
      const shipped = QUIZ_CATEGORIES[i]!;
      expect(row.name).toBe(shipped.name);
      expect(row.tagline).toBe(shipped.tagline);
      expect(row.tagline.length).toBeGreaterThan(0);
      expect(JSON.parse(row.colors)).toEqual([...shipped.colors]);
      expect(row.sort).toBe(i + 1);
    });
  });
});
