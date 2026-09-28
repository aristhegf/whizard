import { describe, expect, it } from "vitest";
import { USERNAME_CHANGE_INTERVAL_MS, nextUsernameChange } from "./accounts";

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
