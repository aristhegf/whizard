import { useId } from "react";

export type TileKind = "question" | "image" | "list" | "csv";
export type TileColor = "orange" | "purple" | "blue" | "pink" | "green";

const COLORS: Record<TileColor, [string, string]> = {
  orange: ["#ffc04a", "#ff6a1a"],
  purple: ["#b27dff", "#6b35f0"],
  blue: ["#62d0ff", "#3b62f5"],
  pink: ["#ff8fe0", "#d23ba8"],
  green: ["#4df0ab", "#0e9e63"],
};

/** A glossy square card with a question, picture, list or CSV file on it. Decoration only. */
export function Tile({
  kind,
  color,
  className,
}: {
  kind: TileKind;
  color: TileColor;
  className?: string;
}) {
  const id = useId();
  const [top, bottom] = COLORS[color];
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill={`url(#${id}f)`} />
      <rect
        x="5.5"
        y="5.5"
        width="89"
        height="89"
        rx="20.5"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.4"
        strokeWidth="3"
      />
      <path
        d="M14 30c4-12 12-17 26-17h26"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {kind === "question" && (
        <text
          x="50"
          y="72"
          textAnchor="middle"
          fontFamily="Poppins, system-ui, sans-serif"
          fontWeight="800"
          fontSize="60"
          fill="#fff"
        >
          ?
        </text>
      )}
      {kind === "image" && (
        <g fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
          <rect x="24" y="27" width="52" height="46" rx="8" />
          <path d="M26 66l15-16 11 11 7-7 15 13" />
          <circle cx="62" cy="40" r="4.5" fill="#fff" stroke="none" />
        </g>
      )}
      {kind === "list" && (
        <g stroke="#fff" strokeWidth="8" strokeLinecap="round">
          <path d="M28 34h44M28 50h44M28 66h28" />
        </g>
      )}
      {kind === "csv" && (
        <>
          <path
            d="M32 20h26l14 14v26H32z"
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M58 20v14h14" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
          <text
            x="50"
            y="84"
            textAnchor="middle"
            fontFamily="Poppins, system-ui, sans-serif"
            fontWeight="800"
            fontSize="22"
            fill="#fff"
          >
            CSV
          </text>
        </>
      )}
    </svg>
  );
}

/** A four-point sparkle, for scattering around art. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z" fill="#ffd43f" />
    </svg>
  );
}
