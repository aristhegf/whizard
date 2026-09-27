import { describe, expect, it } from "vitest";
import { dayOf } from "./analytics";
import { groupBreakdown, rangeDays } from "./stats";

describe("site stats", () => {
  it("lists every day of the range, ending today in UTC", () => {
    const now = Date.UTC(2026, 8, 27, 23, 30);
    expect(dayOf(now)).toBe("2026-09-27");
    const days = rangeDays(7, now);
    expect(days).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(rangeDays(30, Date.UTC(2026, 2, 1))[0]).toBe("2026-01-31");
  });

  it("splits breakdowns by prefix, biggest first", () => {
    const groups = groupBreakdown([
      { metric: "page:home", total: 3 },
      { metric: "page:games", total: 9 },
      { metric: "topic:bible", total: 4 },
      { metric: "source:chat.whatsapp.com", total: 2 },
    ]);
    expect(groups.top("page")).toEqual([
      { name: "games", count: 9 },
      { name: "home", count: 3 },
    ]);
    expect(groups.top("source")).toEqual([{ name: "chat.whatsapp.com", count: 2 }]);
    expect(groups.top("country")).toEqual([]);
  });
});
