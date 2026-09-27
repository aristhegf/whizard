const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** A country's flag emoji from its two-letter code, or an empty string. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code === "other" ? "Other" : "Unknown";
  return regionNames?.of(code) ?? code;
}

export function countryLabel(code: string): string {
  const flag = countryFlag(code);
  return flag ? `${flag} ${countryName(code)}` : countryName(code);
}

export const formatNumber = (value: number) => value.toLocaleString("en-US");

export const formatPercent = (value: number, digits = 0) =>
  `${(value * 100).toFixed(digits).replace(/\.0+$/, "")}%`;

/** "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
