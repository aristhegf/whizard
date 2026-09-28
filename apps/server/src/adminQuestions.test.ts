import { describe, expect, it } from "vitest";
import { suggestedLevel } from "./adminQuestions";

describe("the level check", () => {
  it("flags easy questions most people miss and hard ones nearly everyone gets", () => {
    expect(suggestedLevel("easy", 0.3)).toBe("medium");
    expect(suggestedLevel("easy", 0.6)).toBeNull();
    expect(suggestedLevel("medium", 0.95)).toBe("easy");
    expect(suggestedLevel("medium", 0.2)).toBe("hard");
    expect(suggestedLevel("hard", 0.9)).toBe("medium");
    expect(suggestedLevel("hard", 0.1)).toBeNull();
  });
});
