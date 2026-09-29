import { usePresence } from "../presence";

const format = (n: number) => n.toLocaleString("en-US");

/**
 * "11,630 visitors so far · 91 here now": a pill on the home screen, or two short lines in the
 * top bar. It keeps its space while loading, so nothing jumps.
 */
export function LiveCount({ variant = "pill" }: { variant?: "pill" | "bar" }) {
  const counts = usePresence();
  const visitors = (
    <>
      {counts ? format(counts.visitors) : "0"} {counts?.visitors === 1 ? "visitor" : "visitors"} so
      far
    </>
  );
  const now = <>{counts ? format(counts.online) : "0"} here now</>;
  if (variant === "bar") {
    return (
      <p className={`live-bar${counts ? "" : " loading"}`} aria-hidden={!counts}>
        <span className="live-dot" aria-hidden="true" />
        <span>
          <span>{visitors}</span>
          <span>{now}</span>
        </span>
      </p>
    );
  }
  return (
    <p className={counts ? "live-count" : "live-count loading"} aria-hidden={!counts}>
      <span>{visitors}</span>
      <span className="live-count-now">
        <span className="live-dot" aria-hidden="true" />
        {now}
      </span>
    </p>
  );
}
