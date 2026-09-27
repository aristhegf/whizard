import { describe, expect, it } from "vitest";
import { inQuietHours, localMinutes } from "./quiet";

const at = (iso: string) => Date.parse(iso);
const night = { start: 22 * 60, end: 8 * 60 };

describe("quiet hours", () => {
  it("reads the local time in the player's time zone", () => {
    expect(localMinutes(at("2026-09-27T21:30:00Z"), "Africa/Lagos")).toBe(22 * 60 + 30);
    expect(localMinutes(at("2026-09-27T21:30:00Z"), "America/New_York")).toBe(17 * 60 + 30);
    expect(localMinutes(at("2026-09-27T21:30:00Z"), "Not/AZone")).toBeNull();
  });

  it("handles a range that runs past midnight", () => {
    expect(inQuietHours(at("2026-09-27T21:30:00Z"), night, "Africa/Lagos")).toBe(true);
    expect(inQuietHours(at("2026-09-28T06:59:00Z"), night, "Africa/Lagos")).toBe(true);
    expect(inQuietHours(at("2026-09-28T07:00:00Z"), night, "Africa/Lagos")).toBe(false);
    expect(inQuietHours(at("2026-09-27T12:00:00Z"), night, "Africa/Lagos")).toBe(false);
  });

  it("handles a range within one day", () => {
    const work = { start: 9 * 60, end: 17 * 60 };
    expect(inQuietHours(at("2026-09-27T10:00:00Z"), work, "UTC")).toBe(true);
    expect(inQuietHours(at("2026-09-27T17:00:00Z"), work, "UTC")).toBe(false);
  });

  it("is never quiet without settings", () => {
    const now = at("2026-09-27T23:00:00Z");
    expect(inQuietHours(now, null, "UTC")).toBe(false);
    expect(inQuietHours(now, night, null)).toBe(false);
    expect(inQuietHours(now, { start: 60, end: 60 }, "UTC")).toBe(false);
  });
});
