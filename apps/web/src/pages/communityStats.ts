import type { StatsEntry } from "@whizard/protocol";

export interface CountryShare {
  /** An ISO country code, or "other" for everyone else. */
  code: string;
  /** Whole percent. */
  percent: number;
}

/**
 * The biggest countries' share of visitors, then everyone else as "other". Percentages are
 * rounded so they add up to 100.
 */
export function countryShares(countries: StatsEntry[], total: number, top = 4): CountryShare[] {
  if (total <= 0) return [];
  // Cloudflare says "XX" when it can't tell.
  const known = countries.filter((c) => /^[A-Z]{2}$/.test(c.name) && c.name !== "XX").slice(0, top);
  const rest = total - known.reduce((sum, c) => sum + c.count, 0);
  const rows = [
    ...known.map((c) => ({ code: c.name, count: c.count })),
    ...(rest > 0 ? [{ code: "other", count: rest }] : []),
  ];

  // Largest remainder, so rounding never makes the list add up to 99 or 101.
  const exact = rows.map((r) => (r.count / total) * 100);
  const percents = exact.map(Math.floor);
  let left = 100 - percents.reduce((a, b) => a + b, 0);
  const order = exact.map((value, i) => ({ i, part: value % 1 })).sort((a, b) => b.part - a.part);
  for (const { i } of order) {
    if (left <= 0) break;
    percents[i]! += 1;
    left -= 1;
  }
  return rows.map((r, i) => ({ code: r.code, percent: percents[i]! }));
}
