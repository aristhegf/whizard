import { describe, expect, it } from "vitest";
import { NICKNAME_MAX_LENGTH, nicknameLength, normalizeNickname } from "./nickname";

describe("normalizeNickname", () => {
  it("tidies spaces and drops control characters", () => {
    expect(normalizeNickname("  Ada \n  Lovelace\u0007 ")).toBe("Ada Lovelace");
    expect(normalizeNickname("   ")).toBeNull();
  });

  it("drops invisible characters that could disguise a name", () => {
    expect(normalizeNickname("Ad​a")).toBe("Ada");
    expect(normalizeNickname("A‍da")).toBe("Ada");
    expect(normalizeNickname("‮Ada")).toBe("Ada");
  });

  it("keeps emojis whole, including joined ones", () => {
    for (const name of ["Ada 🧙‍♂️", "👨‍👩‍👧 Family", "🏳️‍🌈", "Tolu 👍🏽✨", "👑 Queen"]) {
      expect(normalizeNickname(name)).toBe(name);
    }
  });

  it("counts an emoji as one character", () => {
    expect(nicknameLength("🧙‍♂️")).toBe(1);
    expect(nicknameLength("👨‍👩‍👧 Ada")).toBe(5);
    expect(normalizeNickname("🧙‍♂️".repeat(NICKNAME_MAX_LENGTH))).not.toBeNull();
    expect(normalizeNickname("🧙‍♂️".repeat(NICKNAME_MAX_LENGTH + 1))).toBeNull();
    expect(normalizeNickname("a".repeat(NICKNAME_MAX_LENGTH + 1))).toBeNull();
  });
});
