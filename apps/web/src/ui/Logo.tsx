import { useId } from "react";

/** The crowned W. Drawn inline so it stays sharp at any size. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a66bff" />
          <stop offset="1" stopColor="#6a2cf0" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset="1" stopColor="#f5a623" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id}b)`}
        d="M8 22c-.6-3.4 3-5.4 5.4-3l9.4 9.6 10-12.8c1.5-1.9 4.4-1.9 5.8.1l7.8 10.6L52.6 12c1-3 5.4-2.3 5.4.8l-3.2 33.4C54.3 51.8 50 56 44.4 56H20.2c-5.4 0-9.8-4-10.4-9.4z"
      />
      <path
        fill="#fff"
        d="M20 34.5h5.2l2.8 9.3 3-9.3h4.2l3 9.3 2.8-9.3h5.2L41 50h-4.6l-3.3-9.4-3.3 9.4h-4.6z"
      />
      <g transform="rotate(-18 14 12)">
        <path fill={`url(#${id}c)`} d="M3 17 1 5l7 5 5-8 5 8 7-5-2 12z" />
        <rect x="3" y="16.2" width="20" height="3.4" rx="1.4" fill="#f59e0b" />
      </g>
    </svg>
  );
}
