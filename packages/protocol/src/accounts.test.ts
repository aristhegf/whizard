import { describe, expect, it } from "vitest";
import {
  AVATAR_FIELDS,
  CUSTOM_AVATAR_MAX_LENGTH,
  USERNAME_CHANGE_INTERVAL_MS,
  avatarSchema,
  isAvatarValue,
  isCustomAvatar,
  nextUsernameChange,
} from "./accounts";

describe("nextUsernameChange", () => {
  const changedAt = Date.UTC(2026, 8, 1);

  it("allows a change when the username never changed", () => {
    expect(nextUsernameChange(null, changedAt)).toBeNull();
  });

  it("waits 7 days after a change", () => {
    const next = changedAt + USERNAME_CHANGE_INTERVAL_MS;
    expect(nextUsernameChange(changedAt, changedAt)).toBe(next);
    expect(nextUsernameChange(changedAt, next - 1)).toBe(next);
    expect(nextUsernameChange(changedAt, next)).toBeNull();
  });
});

describe("avatars", () => {
  const code = ["w1", ...AVATAR_FIELDS.map((_, i) => (i % 2 ? String(i) : "part-" + i))].join(".");

  it("accepts the built-in pictures and avatar creator codes", () => {
    expect(isAvatarValue("a01")).toBe(true);
    expect(isAvatarValue(code)).toBe(true);
    expect(isCustomAvatar(code)).toBe(true);
    expect(isCustomAvatar("a01")).toBe(false);
    expect(avatarSchema.safeParse(code).success).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of [
      null,
      "",
      "a99",
      "w1",
      code + ".extra",
      code.split(".").slice(0, -1).join("."),
      code.replace("part-0", "Part-0"),
      code.replace("part-0", "part_0"),
      code.replace("part-0", "x".repeat(17)),
      "w2" + code.slice(2),
      "<script>",
    ]) {
      expect(isAvatarValue(bad)).toBe(false);
      expect(avatarSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("keeps the longest code under the length the room accepts", () => {
    const longest = ["w1", ...AVATAR_FIELDS.map(() => "x".repeat(16))].join(".");
    expect(isCustomAvatar(longest)).toBe(true);
    expect(longest.length).toBeLessThanOrEqual(CUSTOM_AVATAR_MAX_LENGTH);
  });
});
