import { useEffect, useState } from "react";
import { decodeAvatar, type AvatarParts } from "./code";
import { avatarLayers, tintTable, type BrowPose, type Face, type Layer } from "./layers";
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

/** How big the avatar is in its circle: a little smaller than the grid, as in the reference art. */
export const FRAME = 0.85;

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadPart(src: string): Promise<HTMLImageElement | null> {
  let image = images.get(src);
  if (!image) {
    image = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      // A part that won't load is left out rather than breaking the avatar, and is asked for
      // again next time (it may only have been the connection).
      img.onerror = () => {
        images.delete(src);
        resolve(null);
      };
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
    // Brightness, so painted parts colour as well as grey ones.
    const grey = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) | 0;
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

/** The middle of the face on the head's art: pairs are flipped around it. */
const FACE_MIDDLE = 509;
const BROW_Y = 375;
const BROW_X = { left: 382, right: 636 };

function drawLayer(ctx: CanvasRenderingContext2D, img: HTMLImageElement, layer: Layer) {
  const brows = BROWS[layer.brows ?? "relaxed"];
  const moved = layer.brows !== undefined && (brows.dy !== 0 || brows.tilt !== 0);
  const sided = layer.pair || moved || layer.half !== undefined;
  const sides: ("left" | "right" | null)[] = layer.half
    ? [layer.half]
    : sided
      ? ["left", "right"]
      : [null];
  for (const side of sides) {
    ctx.save();
    if (side) {
      ctx.beginPath();
      ctx.rect(side === "left" ? 0 : FACE_MIDDLE, 0, side === "left" ? FACE_MIDDLE : GRID, GRID);
      ctx.clip();
      // Eyes further apart (or closer) move out from (or in to) the middle.
      if (layer.shift) ctx.translate(side === "left" ? -layer.shift : layer.shift, 0);
    }
    if (layer.dy) ctx.translate(0, layer.dy);
    if (moved && side) {
      const x = BROW_X[side];
      const tilt = ((side === "left" ? brows.tilt : -brows.tilt) * Math.PI) / 180;
      ctx.translate(x, BROW_Y + brows.dy);
      ctx.rotate(tilt);
      ctx.translate(-x, -BROW_Y);
    }
    // A pair's art is the left one; the right is the same, flipped.
    if (layer.pair && side === "right") {
      ctx.translate(FACE_MIDDLE * 2, 0);
      ctx.scale(-1, 1);
    }
    const above = layer.above ?? 0;
    ctx.drawImage(img, 0, -above, GRID, GRID + above);
    ctx.restore();
  }
}

/** The Whizard disc behind an avatar: a glowing circle with a bright rim, as in the art. */
function drawDisc(ctx: CanvasRenderingContext2D, colour: string, round: boolean) {
  const glow = ctx.createRadialGradient(512, 360, 30, 512, 470, 620);
  glow.addColorStop(0, shade(colour, 0.42));
  glow.addColorStop(0.5, colour);
  glow.addColorStop(1, shade(colour, -0.32));
  ctx.fillStyle = glow;
  if (round) {
    ctx.beginPath();
    ctx.arc(512, 512, 512, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A close-up can reach past the grid, above tall hair.
    ctx.fillRect(-GRID, -GRID, GRID * 3, GRID * 3);
  }
}

function drawRim(ctx: CanvasRenderingContext2D, colour: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(512, 512, 512, 0, Math.PI * 2);
  ctx.clip();
  // A soft inner glow, then the bright rim itself.
  ctx.shadowColor = shade(colour, 0.5);
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(512, 512, 500, 0, Math.PI * 2);
  ctx.lineWidth = 20;
  ctx.strokeStyle = shade(colour, 0.55);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 8;
  ctx.strokeStyle = shade(colour, 0.8);
  ctx.stroke();
  ctx.restore();
}

/** The picture, and whether every part of it loaded. */
async function draw(
  parts: AvatarParts,
  px: number,
  face: Face,
  view: View,
): Promise<{ url: string; whole: boolean }> {
  const { layers, mirror } = avatarLayers(parts, face);
  const loaded = await Promise.all(layers.map((l) => loadPart(l.src)));
  const whole = loaded.every((img) => img !== null);
  const full = view === FULL_VIEW;
  // A mirrored pose draws the other side of its art, then flips the picture.
  const area = mirror ? { ...view, x: GRID - view.x - view.size } : view;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  const scratch = document.createElement("canvas");
  scratch.width = scratch.height = px;
  const sctx = scratch.getContext("2d", { willReadFrequently: true })!;
  const scale = px / area.size;
  const toView = (c: CanvasRenderingContext2D) =>
    c.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
  // The whole avatar sits a little smaller in its circle, from the bottom, leaving room above
  // the head for tall hair. Close-ups show the parts as they are on the grid.
  const toParts = (c: CanvasRenderingContext2D) => {
    toView(c);
    if (!full) return;
    c.translate(GRID / 2, GRID);
    c.scale(FRAME, FRAME);
    c.translate(-GRID / 2, -GRID);
  };

  const colour = swatchOf("background", parts.background).colour;
  toView(ctx);
  drawDisc(ctx, colour, full);

  layers.forEach((layer, i) => {
    const img = loaded[i];
    if (!img) return;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, px, px);
    toParts(sctx);
    drawLayer(sctx, img, layer);
    if (layer.tint) tint(sctx, px, layer.tint);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch, 0, 0);
  });

  if (full) {
    // Round, like the built-in pictures, with the rim over anything that reaches the edge.
    toView(ctx);
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(512, 512, 512, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    drawRim(ctx, colour);
  }

  if (mirror) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, px, px);
    sctx.setTransform(-1, 0, 0, 1, px, 0);
    sctx.drawImage(canvas, 0, 0);
    return { url: scratch.toDataURL("image/png"), whole };
  }
  return { url: canvas.toDataURL("image/png"), whole };
}

const MAX_KEPT = 400;
const pictures = new Map<string, Promise<string>>();

/** A picture of the avatar, `px` pixels square, as an image URL. */
export function avatarPicture(
  code: string,
  px: number,
  face: Face = {},
  view: View = FULL_VIEW,
): Promise<string> {
  const key = [code, px, face.eyes, face.mouth, face.brows, view.x, view.y, view.size].join("|");
  let picture = pictures.get(key);
  if (!picture) {
    picture = draw(decodeAvatar(code), px, face, view).then(({ url, whole }) => {
      // A picture with a part missing isn't kept, so the next one tries for the whole avatar.
      if (!whole && pictures.get(key) === picture) pictures.delete(key);
      return url;
    });
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
  face?: Face,
  view?: View,
): string | null {
  const [picture, setPicture] = useState<{ key: string; url: string } | null>(null);
  const px = picturePixels(size);
  const key = code === null ? "" : `${code}|${px}|${JSON.stringify(face)}|${JSON.stringify(view)}`;
  useEffect(() => {
    if (code === null) return;
    let live = true;
    void avatarPicture(code, px, face, view).then((url) => {
      if (live) setPicture({ key, url });
    });
    return () => {
      live = false;
    };
    // The key covers the face and view objects, which callers often make fresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // While a new picture draws, the last one stays up, so the creator doesn't flicker.
  return code === null ? null : (picture?.url ?? null);
}
