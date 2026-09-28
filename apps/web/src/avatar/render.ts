import { useEffect, useState } from "react";
import { decodeAvatar, type AvatarParts } from "./code";
import { avatarLayers, tintTable, type BrowPose, type Layer, type Pose } from "./layers";
import { swatchOf } from "./parts";

// Draws a made-up avatar from its parts on a canvas, in the browser. Nothing is uploaded, and
// each picture is kept once drawn, so a lobby full of the same avatars draws it once.

const GRID = 1024;

/** `colour` moved `t` of the way to white (or, for a negative `t`, to black). */
function shade(colour: string, t: number): string {
  const n = parseInt(colour.slice(1), 16);
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (target - v) * k),
  );
  return `rgb(${r} ${g} ${b})`;
}

/** The part of the 1024 grid to show: the whole avatar, or a close-up for the creator. */
export interface View {
  x: number;
  y: number;
  size: number;
}
export const FULL_VIEW: View = { x: 0, y: 0, size: GRID };

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadPart(src: string): Promise<HTMLImageElement | null> {
  let image = images.get(src);
  if (!image) {
    image = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      // A missing part is left out rather than breaking the avatar.
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, image);
  }
  return image;
}

const tables = new Map<string, Uint8ClampedArray>();

function tint(ctx: CanvasRenderingContext2D, px: number, colour: string) {
  let table = tables.get(colour);
  if (!table) {
    table = tintTable(colour);
    tables.set(colour, table);
  }
  const image = ctx.getImageData(0, 0, px, px);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const grey = ((d[i]! + d[i + 1]! + d[i + 2]!) / 3) | 0;
    d[i] = table[grey * 3]!;
    d[i + 1] = table[grey * 3 + 1]!;
    d[i + 2] = table[grey * 3 + 2]!;
  }
  ctx.putImageData(image, 0, 0);
}

/** How far the eyebrows move and tilt for each look, for the left brow; the right mirrors it. */
const BROWS: Record<BrowPose, { dy: number; tilt: number }> = {
  relaxed: { dy: 0, tilt: 0 },
  raised: { dy: -20, tilt: 0 },
  worried: { dy: -8, tilt: -10 },
  cross: { dy: 8, tilt: 12 },
};
const BROW_Y = 398;
const BROW_X = { left: 421, right: 603 };

function drawLayer(ctx: CanvasRenderingContext2D, img: HTMLImageElement, layer: Layer) {
  const clipTo = (side: "left" | "right") => {
    ctx.beginPath();
    ctx.rect(side === "left" ? 0 : GRID / 2, 0, GRID / 2, GRID);
    ctx.clip();
  };
  const brows = BROWS[layer.brows ?? "relaxed"];
  if (layer.brows && (brows.dy !== 0 || brows.tilt !== 0)) {
    for (const side of ["left", "right"] as const) {
      ctx.save();
      clipTo(side);
      const x = BROW_X[side];
      const tilt = ((side === "left" ? brows.tilt : -brows.tilt) * Math.PI) / 180;
      ctx.translate(x, BROW_Y + brows.dy);
      ctx.rotate(tilt);
      ctx.translate(-x, -BROW_Y);
      ctx.drawImage(img, 0, 0, GRID, GRID);
      ctx.restore();
    }
    return;
  }
  ctx.save();
  if (layer.half) clipTo(layer.half);
  ctx.drawImage(img, 0, 0, GRID, GRID);
  ctx.restore();
}

async function draw(parts: AvatarParts, px: number, pose: Pose, view: View) {
  const layers = avatarLayers(parts, pose);
  const loaded = await Promise.all(layers.map((l) => loadPart(l.src)));

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  const scratch = document.createElement("canvas");
  scratch.width = scratch.height = px;
  const sctx = scratch.getContext("2d", { willReadFrequently: true })!;
  const scale = px / view.size;
  const toView = (c: CanvasRenderingContext2D) =>
    c.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);

  const colour = swatchOf("background", parts.background).colour;
  toView(ctx);
  const glow = ctx.createRadialGradient(420, 330, 40, 512, 512, 600);
  glow.addColorStop(0, shade(colour, 0.45));
  glow.addColorStop(0.55, colour);
  glow.addColorStop(1, shade(colour, -0.3));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, GRID, GRID);

  layers.forEach((layer, i) => {
    const img = loaded[i];
    if (!img) return;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, px, px);
    toView(sctx);
    drawLayer(sctx, img, layer);
    if (layer.tint) tint(sctx, px, layer.tint);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch, 0, 0);
  });

  if (view === FULL_VIEW) {
    // A round avatar with a lighter rim, like the built-in pictures.
    toView(ctx);
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(512, 512, 512, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.arc(512, 512, 496, 0, Math.PI * 2);
    ctx.lineWidth = 32;
    ctx.strokeStyle = shade(colour, 0.4);
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

const MAX_KEPT = 400;
const pictures = new Map<string, Promise<string>>();

/** A picture of the avatar, `px` pixels square, as an image URL. */
export function avatarPicture(
  code: string,
  px: number,
  pose: Pose = {},
  view: View = FULL_VIEW,
): Promise<string> {
  const key = [code, px, pose.eyes, pose.mouth, pose.brows, view.x, view.y, view.size].join("|");
  let picture = pictures.get(key);
  if (!picture) {
    picture = draw(decodeAvatar(code), px, pose, view);
    pictures.set(key, picture);
    if (pictures.size > MAX_KEPT) pictures.delete(pictures.keys().next().value!);
  }
  return picture;
}

/** Canvas pixels for an avatar shown `size` CSS pixels wide: sharp, in a few cached sizes. */
export function picturePixels(size: number): number {
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  return Math.min(GRID, Math.ceil((size * ratio) / 32) * 32);
}

export function useAvatarPicture(
  code: string | null,
  size: number,
  pose?: Pose,
  view?: View,
): string | null {
  const [picture, setPicture] = useState<{ key: string; url: string } | null>(null);
  const px = picturePixels(size);
  const key = code === null ? "" : `${code}|${px}|${JSON.stringify(pose)}|${JSON.stringify(view)}`;
  useEffect(() => {
    if (code === null) return;
    let live = true;
    void avatarPicture(code, px, pose, view).then((url) => {
      if (live) setPicture({ key, url });
    });
    return () => {
      live = false;
    };
    // The key covers the pose and view objects, which callers often make fresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // While a new picture draws, the last one stays up, so the creator doesn't flicker.
  return code === null ? null : (picture?.url ?? null);
}
