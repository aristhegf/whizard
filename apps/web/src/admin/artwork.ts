import { DEFAULT_TOPIC_COLORS } from "@whizard/game-core";

/** The largest edge a picked picture keeps; anything bigger is scaled down to fit. */
const MAX_EDGE = 1024;
/** The quality the browser's WebP encoder gets; the server checks the result, not this. */
const WEBP_QUALITY = 0.85;
/** Below this, a pixel is treated as invisible and left out of the colour count. */
const OPAQUE_ENOUGH = 128;

/**
 * One picture's pixels as RGBA bytes — what a canvas's `ImageData` holds, and what a test
 * can hand over without a browser. The browser half draws the picture onto a canvas first.
 */
export interface PixelImage {
  readonly data: Uint8ClampedArray;
}

/** Everything one bin collected: how many pixels fell in, and their colour totals. */
interface Bin {
  count: number;
  red: number;
  green: number;
  blue: number;
}

const byte = (value: number): string =>
  Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");

/** One pixel's colour as `#rrggbb`, from its averaged red, green and blue. */
const hex = (red: number, green: number, blue: number): string =>
  `#${byte(red)}${byte(green)}${byte(blue)}`;

/**
 * The two colours a topic's tile should wash between, read from a picture's pixels: every
 * opaque pixel falls into a bin of its r/g/b >> 4 bucket, the two fullest bins win (ties go
 * to the lower bin key, lexicographically), and each colour is the average of its own
 * pixels rather than the bucket they shared. Fewer than two bins means the defaults fill
 * the slots that are left, so an empty or single-colour picture still gets a pair.
 */
export function dominantColors(img: PixelImage): readonly [string, string] {
  const bins = new Map<number, Bin>();
  const data = img.data;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < OPAQUE_ENOUGH) continue;
    const red = data[i]!;
    const green = data[i + 1]!;
    const blue = data[i + 2]!;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.count += 1;
      bin.red += red;
      bin.green += green;
      bin.blue += blue;
    } else {
      bins.set(key, { count: 1, red, green, blue });
    }
  }
  const fullest = [...bins.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]);
  const colors = fullest
    .slice(0, 2)
    .map(([, bin]) => hex(bin.red / bin.count, bin.green / bin.count, bin.blue / bin.count));
  return [colors[0] ?? DEFAULT_TOPIC_COLORS[0], colors[1] ?? DEFAULT_TOPIC_COLORS[1]];
}

/** Draws a picked file onto a square canvas of at most 1024 px, cropped from the centre. */
async function squareCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn’t a picture we can use."));
      img.src = url;
    });
    const side = Math.min(picture.naturalWidth, picture.naturalHeight);
    const size = Math.min(MAX_EDGE, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can’t prepare pictures right now.");
    context.drawImage(
      picture,
      (picture.naturalWidth - side) / 2,
      (picture.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Encodes a prepared canvas as the WebP the server expects. */
function toWebP(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("This browser couldn’t turn that picture into a WebP.")),
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

/** The picture alone: a square ≤ 1024 px WebP, the form the server validates and stores. */
export async function squareWebP(file: File): Promise<Blob> {
  return toWebP(await squareCanvas(file));
}

/** The picture's pixels as the colour sampler reads them — the same square crop, undecoded twice. */
export async function imagePixels(file: File): Promise<PixelImage> {
  const canvas = await squareCanvas(file);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can’t read colours right now.");
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
