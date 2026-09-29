const PATHS = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5",
  games:
    "M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.2 2.2L13.6 14h-3.2l-1.2 1.7A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4zM7.5 10.5v3M6 12h3M15.5 11.5h.01M17.5 13h.01",
  users:
    "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
  user: "M19 20v-1a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  bell: "M18 16V11a6 6 0 1 0-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 0 0 4 0",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  play: "M7 4.5v15l12-7.5z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  clock: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M10 2h4",
  plus: "M12 5v14M5 12h14",
  plusCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v8M8 12h8",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  invite:
    "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M16 11h6",
  device: "M4 5h16v11H4zM8 20h8M12 16v4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  gift: "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7s-1.5-4-4-4a2 2 0 0 0 0 4M12 7s1.5-4 4-4a2 2 0 0 1 0 4",
  crown: "M4 18h16M5 15 3 7l5 4 4-6 4 6 5-4-2 8z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pencil: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z",
  chart: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8M12 17h.01",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z",
  wallet:
    "M3 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm0 0V6a2 2 0 0 1 2-2h11M16 13.5h.01",
  userPlus:
    "M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M16 11h6",
  checkCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16 9.8",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  link2: "M9 15l6-6M10.5 6.5l1-1a4.2 4.2 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4.2 4.2 0 0 1-6-6l1-1",
  sound: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  muted: "M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3.5 21h17M14.5 12h.01",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9",
  flame:
    "M12 22c4 0 7-2.7 7-6.5 0-3-2-5.5-3.5-7-.3 1.8-1.3 3-2.5 3.5.5-3-1-6.5-4-9 0 3-1.5 5-3 6.8C4.7 11.3 5 13 5 15.5 5 19.3 8 22 12 22z",
  layers: "M12 3 3 7.5l9 4.5 9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  puzzle:
    "M10 4.5a2 2 0 1 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 1 0 0 4H19v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 1 0-4 0V20H6a1 1 0 0 1-1-1v-4h1.5a2 2 0 1 0 0-4H5V7a1 1 0 0 1 1-1h4V4.5z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 22,
  stroke = 2,
  fill = false,
  className,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  /** Filled instead of outlined, for solid shapes like play or star. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
