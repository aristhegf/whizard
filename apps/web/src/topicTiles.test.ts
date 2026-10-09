import { describe, expect, it } from "vitest";
import { browseRows, isComingSoon, isPickerSoon } from "./topicTiles";
import type { TopicInfo } from "./topics";

/** One live row as the catalogue serves it: tagline, colours, art and playable counts. */
const row = (id: string, name: string, easy = 0, medium = 0, hard = 0): TopicInfo => ({
  id,
  name,
  tagline: `Everything about ${name}`,
  colors: ["#123456", "#654321"],
  art: `/art/topics/${id}.webp`,
  questions: { easy, medium, hard },
});

const CATALOGUE = [
  row("mars", "Mars Colony", 3, 2, 1),
  row("venus", "Venus"),
  row("jupiter", "Jupiter", 0, 4, 0),
];

describe("the browse grid", () => {
  it("shows every live row in the catalogue's own order, taglines and art included", () => {
    const shown = browseRows(CATALOGUE, "");

    expect(shown.map((r) => r.id)).toEqual(["mars", "venus", "jupiter"]);
    expect(shown.map((r) => r.tagline)).toEqual(CATALOGUE.map((r) => r.tagline));
    expect(shown.map((r) => r.art)).toEqual(CATALOGUE.map((r) => r.art));
  });

  it("is coming soon exactly when a topic has no playable questions", () => {
    expect(isComingSoon(CATALOGUE[1]!, false)).toBe(true);
    expect(isComingSoon(CATALOGUE[2]!, false)).toBe(false);
    expect(isComingSoon(CATALOGUE[0]!, false)).toBe(false);

    // While the catalogue is still loading, no counts are known yet: nothing is "soon".
    expect(isComingSoon(CATALOGUE[1]!, true)).toBe(false);
  });

  it("filters by name as you type, leaving the catalogue's order alone", () => {
    expect(browseRows(CATALOGUE, "  VEN ").map((r) => r.id)).toEqual(["venus"]);
    expect(browseRows(CATALOGUE, "mars").map((r) => r.id)).toEqual(["mars"]);
    // The search box matches names only — a word from a tagline finds nothing.
    expect(browseRows(CATALOGUE, "everything").map((r) => r.id)).toEqual([]);

    // An empty search box is the whole grid, in the server's order — never re-sorted.
    expect(browseRows([...CATALOGUE].reverse(), "  ")).toHaveLength(3);
    expect(browseRows([...CATALOGUE].reverse(), "")[0]!.id).toBe("jupiter");
  });
});

describe("the quiz picker", () => {
  it("is soon (disabled) only when an option's playable count is zero", () => {
    expect(isPickerSoon(CATALOGUE[1]!, "mars", false)).toBe(true);
    expect(isPickerSoon(CATALOGUE[2]!, "mars", false)).toBe(false);
    expect(isPickerSoon(CATALOGUE[0]!, "venus", false)).toBe(false);

    // Nothing is disabled while the counts are still on their way.
    expect(isPickerSoon(CATALOGUE[1]!, "mars", true)).toBe(false);
  });

  it("never disables the topic the lobby has already chosen", () => {
    expect(isPickerSoon(CATALOGUE[1]!, "venus", false)).toBe(false);
    expect(isPickerSoon(CATALOGUE[1]!, "mars", false)).toBe(true);
  });
});
