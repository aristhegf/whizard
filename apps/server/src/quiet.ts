/** Minutes after midnight at `now` in the given time zone, or null if the zone is unknown. */
export function localMinutes(now: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

/**
 * Whether `now` falls in quiet hours. The range can run past midnight (22:00 to 08:00).
 * Without a time zone, or with an empty range, it never does.
 */
export function inQuietHours(
  now: number,
  quiet: { start: number; end: number } | null,
  timeZone: string | null,
): boolean {
  if (!quiet || !timeZone || quiet.start === quiet.end) return false;
  const minutes = localMinutes(now, timeZone);
  if (minutes === null) return false;
  return quiet.start < quiet.end
    ? minutes >= quiet.start && minutes < quiet.end
    : minutes >= quiet.start || minutes < quiet.end;
}
