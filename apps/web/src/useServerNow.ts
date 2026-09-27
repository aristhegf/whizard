import { useEffect, useState } from "react";

/** Server time, refreshed every `intervalMs` while `active`, for countdowns and timer bars. */
export function useServerNow(serverNow: () => number, active = true, intervalMs = 100): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(timer);
  }, [serverNow, active, intervalMs]);

  return now;
}
