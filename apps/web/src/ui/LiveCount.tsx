import { usePresence } from "../presence";

const format = (n: number) => n.toLocaleString("en-US");

/**
 * The live counts. `pill`: "11,630 visitors so far · 91 here now", above the Games screen's
 * title. `now`: just "91 playing now", one line of green text beside a heading on the home page.
 * Either keeps its space while loading, so nothing jumps.
 */
export function LiveCount({ variant = "pill" }: { variant?: "pill" | "now" }) {
  const counts = usePresence();
  const now = <>{counts ? format(counts.online) : "0"} here now</>;
  if (variant === "now") {
    return (
      <p className={`live-now${counts ? "" : " loading"}`} aria-hidden={!counts}>
        {counts ? format(counts.online) : "0"} playing now
      </p>
    );
  }
  return (
    <p className={counts ? "live-count" : "live-count loading"} aria-hidden={!counts}>
      <span>
        {counts ? format(counts.visitors) : "0"} {counts?.visitors === 1 ? "visitor" : "visitors"}{" "}
        so far
      </span>
      <span className="live-count-now">
        <span className="live-dot" aria-hidden="true" />
        {now}
      </span>
    </p>
  );
}
