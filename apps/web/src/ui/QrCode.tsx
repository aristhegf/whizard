import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** A QR code for a link, drawn as one SVG path so it stays sharp. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: count, path: d };
  }, [value]);

  const margin = 2;
  return (
    <svg
      className="qr"
      viewBox={`${-margin} ${-margin} ${size + margin * 2} ${size + margin * 2}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect
        x={-margin}
        y={-margin}
        width={size + margin * 2}
        height={size + margin * 2}
        fill="#fff"
      />
      <path d={path} fill="#0d0b30" />
    </svg>
  );
}
