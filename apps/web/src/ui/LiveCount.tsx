import { usePresence } from "../presence";

const format = (n: number) => n.toLocaleString("en-US");

/** "11,630 visitors so far · 91 here now". It keeps its space while loading, so nothing jumps. */
export function LiveCount() {
  const counts = usePresence();
  return (
    <p className={counts ? "live-count" : "live-count loading"} aria-hidden={!counts}>
      <span>
        {counts ? format(counts.visitors) : "0"} {counts?.visitors === 1 ? "visitor" : "visitors"}{" "}
        so far
      </span>
      <span className="live-count-now">
        <span className="live-dot" aria-hidden="true" />
        {counts ? format(counts.online) : "0"} here now
      </span>
    </p>
  );
}
