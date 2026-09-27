import { useId, useState, type PointerEvent } from "react";
import { formatNumber, shortDate } from "../format";
import { useMediaQuery } from "../ui/common";

/** A step that gives about four even gridlines, e.g. 0, 200, 400, 600, 800. */
function niceMax(max: number): { top: number; step: number } {
  if (max <= 4) return { top: 4, step: 1 };
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  return { top: step * Math.ceil(max / step), step };
}

/**
 * A count per day as a line with a soft fill: finished games, or visitors. The line is SVG stretched to the panel;
 * the labels, dots and tooltip are HTML on top, so they stay crisp at any width.
 */
export function GamesChart({
  days,
  unit = ["game", "games"],
  what = "games finished",
}: {
  days: { day: string; count: number }[];
  /** The count's name, one and many. */
  unit?: [string, string];
  /** For screen readers, e.g. "games finished". */
  what?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const narrow = useMediaQuery("(max-width: 700px)");
  // useId has characters that "url(#...)" can't refer to.
  const fillId = `fill-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const max = Math.max(0, ...days.map((d) => d.count));
  const { top, step } = niceMax(max);
  const n = days.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const points = days.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // Fewer dates on a phone, so they don't run into each other.
  const labelEvery = Math.max(1, Math.ceil(n / (narrow ? 4 : 8)));
  const dotEvery = n > 45 ? 3 : n > 14 ? 2 : 1;
  const total = days.reduce((sum, d) => sum + d.count, 0);

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = (event.clientX - box.left) / box.width;
    setHover(Math.min(n - 1, Math.max(0, Math.round(at * (n - 1)))));
  };
  const shown = hover !== null ? days[hover] : null;

  return (
    <div className="games-chart">
      <div className="chart-y" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
            {formatNumber(t)}
          </span>
        ))}
      </div>
      <div
        className="chart-plot"
        role="img"
        aria-label={`${formatNumber(total)} ${what}, at most ${formatNumber(max)} in a day`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <span key={t} className="chart-grid" style={{ bottom: `${(t / top) * 100}%` }} />
        ))}
        {n > 0 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cff" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#8b5cff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,100 ${points} 100,100`} fill={`url(#${fillId})`} />
            <polyline
              points={points}
              fill="none"
              stroke="#a47bff"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {days.map((d, i) =>
          i % dotEvery === 0 || i === n - 1 || i === hover ? (
            <span
              key={d.day}
              className={i === hover ? "chart-dot active" : "chart-dot"}
              style={{ left: `${x(i)}%`, top: `${y(d.count)}%` }}
            />
          ) : null,
        )}
        {shown && hover !== null && (
          <span
            className="chart-tip"
            style={{
              left: `${Math.min(88, Math.max(12, x(hover)))}%`,
              top: `${y(shown.count)}%`,
            }}
          >
            <strong>
              {formatNumber(shown.count)} {shown.count === 1 ? unit[0] : unit[1]}
            </strong>
            <span>{shortDate(shown.day)}</span>
          </span>
        )}
      </div>
      <div className="chart-x" aria-hidden="true">
        {days.map((d, i) =>
          // Every few days, and the last, but not one crowding the last.
          (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.75) || i === n - 1 ? (
            <span key={d.day} style={{ left: `${x(i)}%` }}>
              {shortDate(d.day)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
