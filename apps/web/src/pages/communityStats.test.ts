import { describe, expect, it } from "vitest";
import { countryShares } from "./communityStats";

describe("country shares", () => {
  it("shows the top countries and puts everyone else in other", () => {
    const shares = countryShares(
      [
        { name: "NG", count: 42 },
        { name: "US", count: 18 },
        { name: "GB", count: 11 },
        { name: "CA", count: 6 },
        { name: "GH", count: 5 },
      ],
      100,
    );
    expect(shares).toEqual([
      { code: "NG", percent: 42 },
      { code: "US", percent: 18 },
      { code: "GB", percent: 11 },
      { code: "CA", percent: 6 },
      { code: "other", percent: 23 },
    ]);
  });

  it("always adds up to 100", () => {
    const shares = countryShares(
      [
        { name: "NG", count: 1 },
        { name: "US", count: 1 },
      ],
      3,
    );
    expect(shares.reduce((sum, s) => sum + s.percent, 0)).toBe(100);
  });

  it("counts unknown countries as other, and shows nothing before any visits", () => {
    expect(
      countryShares(
        [
          { name: "unknown", count: 2 },
          { name: "XX", count: 2 },
        ],
        4,
      ),
    ).toEqual([{ code: "other", percent: 100 }]);
    expect(countryShares([], 0)).toEqual([]);
  });
});
