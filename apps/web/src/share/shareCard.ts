import caveatUrl from "@fontsource/caveat/files/caveat-latin-700-normal.woff2?url";
import luckiestUrl from "@fontsource/luckiest-guy/files/luckiest-guy-latin-400-normal.woff2?url";
import qrcode from "qrcode-generator";
import { avatarUrl, fallbackAvatar, isAvatar } from "../ui/Avatar";
import type { Outcome } from "./outcomes";

// The picture players share when a game is over: 1080 × 1920 (9:16), for a WhatsApp or
// Instagram status. It's drawn in the browser, so nothing is uploaded, and its QR code opens
// the site at whatever address it's on.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

export interface CardRow {
  playerId: string;
  nickname: string;
  avatar: string | null;
  value: number;
  label: string;
  rank: number;
  me: boolean;
}

export interface ShareCard {
  outcome: Outcome;
  /** The finish's colour, for the glow, the bars and the kicker. */
  accent: string;
  game: { title: string; subtitle: string; art: string; colors: [string, string] };
  /** The big words, one entry per line. */
  headline: string[];
  emoji?: string;
  /** Above the big number: "1st place", "Your score". */
  kicker: string;
  crown: boolean;
  value: string;
  unit: string;
  /** Group games: the top five, or the top four and the sharer if lower. */
  board: CardRow[];
  /** Players not on the board. */
  more: number;
  /** Solo games: small facts under the score. */
  facts: { icon: string; value: string; label: string }[];
  cta: string;
  mascot: string;
  /** Confetti for a good finish; question marks for a bad one. */
  celebrate: boolean;
}

const DISPLAY = '"Luckiest Guy", "Poppins", system-ui, sans-serif';
const FONT = '"Poppins", system-ui, sans-serif';
const BODY = '"Nunito Variable", "Nunito", system-ui, sans-serif';
const HAND = '"Caveat", cursive';
const W = CARD_WIDTH;
const H = CARD_HEIGHT;
const PAD = 60;

let fontsLoaded: Promise<unknown> | null = null;

/** The display and handwriting fonts are only fetched for this picture. */
function loadFonts() {
  fontsLoaded ??= Promise.all([
    ...[
      new FontFace("Luckiest Guy", `url(${luckiestUrl})`),
      new FontFace("Caveat", `url(${caveatUrl})`, { weight: "700" }),
    ].map((face) =>
      face
        .load()
        .then((loaded) => document.fonts.add(loaded))
        .catch(() => undefined),
    ),
    ...[`800 60px ${FONT}`, `700 40px ${FONT}`, `700 32px ${BODY}`].map((f) =>
      document.fonts.load(f).catch(() => []),
    ),
  ]);
  return fontsLoaded;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    // A missing picture leaves a gap rather than spoiling the whole card.
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The same scattering every time for the same game, so a card doesn't change on redraw. */
function seeded(seed: string) {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

/** Draws an image as large as fits the box, standing on its bottom edge. */
function contain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + h - dh, dw, dh);
}

/** A glassy panel, like the site's cards. */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 40) {
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 45%)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 16;
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgb(18 14 58 / 82%)";
  ctx.fill();
  ctx.restore();
  rounded(ctx, x, y, w, h, r);
  ctx.strokeStyle = "rgb(170 150 255 / 38%)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Big game-show letters: a thick outline over a stepped shadow, filled top to bottom. */
function chunky(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: [string, string],
) {
  ctx.save();
  ctx.font = `${size}px ${DISPLAY}`;
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";
  const outline = size * 0.13;
  const depth = Math.round(size * 0.09);
  ctx.lineWidth = outline;
  for (let d = depth; d > 0; d -= 2) {
    ctx.fillStyle = ctx.strokeStyle = "#2b0d6e";
    ctx.strokeText(text, x + d * 0.3, y + d);
    ctx.fillText(text, x + d * 0.3, y + d);
  }
  ctx.strokeStyle = "#3a1391";
  ctx.strokeText(text, x, y);
  const gradient = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
  gradient.addColorStop(0, fill[0]);
  gradient.addColorStop(1, fill[1]);
  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const LINE_COLOURS: Record<"bright" | "gloomy", [string, string][]> = {
  bright: [["#fff6b0", "#ffb21e"]],
  gloomy: [
    ["#ffffff", "#e8e2ff"],
    ["#fff1a0", "#ffc21e"],
    ["#e4c9ff", "#a77bff"],
  ],
};

/** The headline, as large as fits the space. Returns where it ends. */
function drawHeadline(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  top: number,
  maxWidth: number,
  maxHeight: number,
) {
  const lines = card.headline;
  const outline = (size: number) => size * 0.13;
  let size = 230;
  const widest = () => {
    ctx.font = `${size}px ${DISPLAY}`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width)) + outline(size) * 2;
  };
  while (size > 70 && (widest() > maxWidth || lines.length * size * 0.92 > maxHeight)) size -= 4;
  const colours = LINE_COLOURS[card.celebrate ? "bright" : "gloomy"];
  let y = top + size * 0.82;
  lines.forEach((line, i) => {
    chunky(ctx, line, PAD + outline(size), y, size, colours[i % colours.length]!);
    if (i === lines.length - 1 && card.emoji) {
      ctx.font = `${size}px ${DISPLAY}`;
      const end = PAD + outline(size) * 2 + ctx.measureText(line).width;
      ctx.font = `${Math.round(size * 0.55)}px ${FONT}`;
      ctx.fillText(card.emoji, end + 12, y - size * 0.08);
    }
    y += size * 0.92;
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, card: ShareCard) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, card.celebrate ? "#2a1270" : "#1c1450");
  bg.addColorStop(0.55, "#140c44");
  bg.addColorStop(1, "#08061f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // A stage light from the top, and the finish's colour glowing behind the mascot.
  const light = ctx.createRadialGradient(W * 0.62, -80, 20, W * 0.62, -80, 1100);
  light.addColorStop(0, card.celebrate ? "rgb(255 190 120 / 45%)" : "rgb(170 150 255 / 25%)");
  light.addColorStop(1, "transparent");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(780, 760, 30, 780, 760, 560);
  glow.addColorStop(0, `${card.accent}66`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const game = ctx.createRadialGradient(80, 1500, 10, 80, 1500, 700);
  game.addColorStop(0, `${card.game.colors[0]}40`);
  game.addColorStop(1, "transparent");
  ctx.fillStyle = game;
  ctx.fillRect(0, 0, W, H);

  const rng = seeded(card.game.title + card.outcome);
  if (card.celebrate) {
    const colours = ["#ffd43f", "#ff6fcf", "#5ce1ff", "#9a6bff", "#ffffff"];
    for (let i = 0; i < 46; i++) {
      const x = rng() * W;
      const y = 160 + rng() * 1000;
      const w = 14 + rng() * 22;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      ctx.globalAlpha = 0.55 + rng() * 0.45;
      ctx.fillStyle = colours[i % colours.length]!;
      rounded(ctx, -w / 2, -w / 4, w, w / 2, 4);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // A few floating question marks instead of confetti.
    for (let i = 0; i < 5; i++) {
      const x = 600 + rng() * 400;
      const y = 320 + rng() * 360;
      const s = 70 + rng() * 40;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rng() - 0.5) * 0.7);
      ctx.globalAlpha = 0.6;
      rounded(ctx, -s / 2, -s / 2, s, s, 18);
      ctx.fillStyle = i % 2 ? "#8b5cf6" : "#ec4899";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `800 ${Math.round(s * 0.6)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 0, 4);
      ctx.restore();
    }
  }
}

function drawTop(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  logo: HTMLImageElement | null,
  art: HTMLImageElement | null,
) {
  if (logo) ctx.drawImage(logo, PAD, 52, 96, 96);
  ctx.fillStyle = "#fff";
  ctx.font = `800 60px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Whizard", PAD + 110, 102);

  // A handwritten note in the corner.
  ctx.save();
  ctx.translate(W - PAD - 10, 96);
  ctx.rotate(-0.12);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e4c9ff";
  ctx.font = `700 50px ${HAND}`;
  ctx.fillText("Games are", 0, -18);
  ctx.fillText("better together", 10, 34);
  ctx.strokeStyle = "#c79bff";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-250, 70);
  ctx.quadraticCurveTo(-120, 56, 4, 62);
  ctx.stroke();
  ctx.restore();

  // The game, as a pill with its picture.
  ctx.font = `700 36px ${FONT}`;
  const label = fit(ctx, card.game.title, 540);
  const labelWidth = ctx.measureText(label).width;
  ctx.font = `600 30px ${BODY}`;
  const sub = card.game.subtitle ? fit(ctx, card.game.subtitle, 900 - 126 - labelWidth) : "";
  const subWidth = sub ? ctx.measureText(sub).width + 26 : 0;
  const y = 196;
  rounded(ctx, PAD, y, 90 + labelWidth + subWidth + 36, 84, 42);
  ctx.fillStyle = "rgb(30 20 90 / 80%)";
  ctx.fill();
  ctx.strokeStyle = "rgb(190 160 255 / 55%)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (art) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(PAD + 44, y + 42, 30, 0, Math.PI * 2);
    ctx.clip();
    const s = Math.max(60 / art.width, 60 / art.height);
    ctx.drawImage(
      art,
      PAD + 44 - (art.width * s) / 2,
      y + 42 - (art.height * s) / 2,
      art.width * s,
      art.height * s,
    );
    ctx.restore();
  }
  ctx.fillStyle = "#fff";
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(label, PAD + 90, y + 44);
  if (sub) {
    ctx.fillStyle = "#b9b5e3";
    ctx.font = `600 30px ${BODY}`;
    ctx.fillText(sub, PAD + 90 + labelWidth + 26, y + 45);
  }
  ctx.textBaseline = "alphabetic";
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  panel(ctx, x, y, w, h);
  ctx.textAlign = "center";
  const cx = x + w / 2;
  ctx.fillStyle = card.accent;
  ctx.font = `800 38px ${FONT}`;
  ctx.fillText(fit(ctx, `${card.crown ? "👑 " : ""}${card.kicker}`, w - 60), cx, y + 76);
  ctx.fillStyle = "#fff";
  let size = Math.min(160, h * 0.5);
  ctx.font = `${size}px ${DISPLAY}`;
  while (size > 60 && ctx.measureText(card.value).width > w - 70) {
    size -= 6;
    ctx.font = `${size}px ${DISPLAY}`;
  }
  ctx.save();
  ctx.shadowColor = `${card.accent}aa`;
  ctx.shadowBlur = 30;
  ctx.fillText(card.value, cx, y + (h + size * 0.7) / 2 + 4);
  ctx.restore();
  ctx.fillStyle = "#cfc9f5";
  ctx.font = `700 36px ${BODY}`;
  ctx.fillText(fit(ctx, card.unit, w - 60), cx, y + h - 40);
  ctx.textAlign = "start";
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  faces: (HTMLImageElement | null)[],
  y: number,
) {
  const rowH = 74;
  const h = card.board.length * rowH + 36 + (card.more > 0 ? 66 : 0);
  panel(ctx, PAD, y, W - PAD * 2, h);
  const best = Math.max(1, ...card.board.map((r) => r.value));
  card.board.forEach((row, i) => {
    const ry = y + 18 + i * rowH;
    if (row.me) {
      rounded(ctx, PAD + 14, ry + 4, W - PAD * 2 - 28, rowH - 8, 26);
      ctx.fillStyle = `${card.accent}26`;
      ctx.fill();
      ctx.strokeStyle = `${card.accent}cc`;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (i > 0 && !card.board[i - 1]?.me) {
      ctx.fillStyle = "rgb(170 150 255 / 16%)";
      ctx.fillRect(PAD + 40, ry, W - PAD * 2 - 80, 2);
    }
    const cy = ry + rowH / 2;
    // Rank badge: gold, silver and bronze for the top three.
    const badge =
      row.rank === 1
        ? "#ffd43f"
        : row.rank === 2
          ? "#cfd6ff"
          : row.rank === 3
            ? "#ff9f5a"
            : "rgb(255 255 255 / 14%)";
    rounded(ctx, PAD + 34, cy - 24, 48, 48, 14);
    ctx.fillStyle = badge;
    ctx.fill();
    ctx.fillStyle = row.rank <= 3 ? "#241060" : "#fff";
    ctx.font = `800 28px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(row.rank), PAD + 58, cy + 2);
    ctx.textAlign = "start";
    // Avatar with a ring.
    const ax = PAD + 136;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, cy, 32, 0, Math.PI * 2);
    ctx.fillStyle = row.me ? card.accent : "#6d4fe0";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, cy, 28, 0, Math.PI * 2);
    ctx.clip();
    const face = faces[i];
    if (face) ctx.drawImage(face, ax - 28, cy - 28, 56, 56);
    ctx.restore();
    // Name, a bar for the score, the score.
    ctx.fillStyle = row.me ? card.accent : "#fff";
    ctx.font = `${row.me ? 800 : 700} 34px ${FONT}`;
    ctx.fillText(fit(ctx, row.me ? "You" : row.nickname, 210), ax + 52, cy + 2);
    const bx = 480;
    const bw = 250;
    rounded(ctx, bx, cy - 11, bw, 22, 11);
    ctx.fillStyle = "rgb(255 255 255 / 10%)";
    ctx.fill();
    const bright = row.me || row.rank === 1;
    const fill = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    fill.addColorStop(0, bright ? "#ffd43f" : "#8b5cf6");
    fill.addColorStop(1, bright ? "#ffb21e" : "#c084fc");
    rounded(ctx, bx, cy - 11, Math.max(22, (bw * row.value) / best), 22, 11);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.textAlign = "right";
    ctx.fillStyle = row.me ? card.accent : "#fff";
    ctx.font = `800 32px ${FONT}`;
    ctx.fillText(fit(ctx, row.label, 200), W - PAD - 34, cy + 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  });
  if (card.more > 0) {
    const my = y + 18 + card.board.length * rowH + 4;
    rounded(ctx, PAD + 20, my, W - PAD * 2 - 40, 56, 22);
    ctx.fillStyle = "rgb(255 255 255 / 6%)";
    ctx.fill();
    ctx.fillStyle = "#cfc9f5";
    ctx.font = `700 30px ${BODY}`;
    ctx.textBaseline = "middle";
    ctx.fillText(
      `👥  + ${card.more} more ${card.more === 1 ? "player" : "players"}`,
      PAD + 50,
      my + 29,
    );
    ctx.textBaseline = "alphabetic";
  }
}

function drawFacts(ctx: CanvasRenderingContext2D, card: ShareCard, y: number) {
  if (card.facts.length === 0) return;
  const h = 150;
  panel(ctx, PAD, y, W - PAD * 2, h, 34);
  const w = (W - PAD * 2) / card.facts.length;
  card.facts.forEach((f, i) => {
    const x = PAD + i * w;
    if (i > 0) {
      ctx.fillStyle = "rgb(170 150 255 / 22%)";
      ctx.fillRect(x, y + 34, 2, h - 68);
    }
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = `48px ${FONT}`;
    ctx.fillText(f.icon, x + 30, y + h / 2);
    ctx.fillStyle = "#fff";
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(fit(ctx, f.value, w - 120), x + 100, y + h / 2 - 20);
    ctx.fillStyle = "#b9b5e3";
    ctx.font = `600 28px ${BODY}`;
    ctx.fillText(fit(ctx, f.label, w - 120), x + 100, y + h / 2 + 26);
    ctx.textBaseline = "alphabetic";
  });
}

function drawQr(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 50%)";
  ctx.shadowBlur = 40;
  rounded(ctx, x, y, size, size, 30);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const inner = size - 40;
  const cell = Math.floor(inner / count);
  const left = x + 20 + Math.floor((inner - cell * count) / 2);
  const top = y + 20 + Math.floor((inner - cell * count) / 2);
  ctx.fillStyle = "#12093d";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(left + col * cell, top + row * cell, cell, cell);
    }
  }
}

function drawCta(ctx: CanvasRenderingContext2D, card: ShareCard, link: string) {
  const qrSize = 250;
  const qrX = W - PAD - qrSize;
  const qrY = H - PAD - qrSize;
  drawQr(ctx, link, qrX, qrY, qrSize);

  const w = qrX - PAD - 40;
  const h = 128;
  const y = qrY + 14;
  // Little bursts beside the button.
  ctx.strokeStyle = "#ffd43f";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (const [x1, y1, x2, y2] of [
    [PAD - 34, y + 8, PAD - 12, y + 26],
    [PAD - 40, y + h / 2, PAD - 14, y + h / 2],
    [PAD - 34, y + h - 8, PAD - 12, y + h - 26],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = "rgb(255 190 40 / 55%)";
  ctx.shadowBlur = 40;
  rounded(ctx, PAD, y, w, h, h / 2);
  const button = ctx.createLinearGradient(0, y, 0, y + h);
  button.addColorStop(0, "#ffe45c");
  button.addColorStop(1, "#ffb81c");
  ctx.fillStyle = button;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#1c0b4a";
  const text = `${card.cta} →`;
  let size = 54;
  ctx.font = `${size}px ${DISPLAY}`;
  while (size > 26 && ctx.measureText(text).width > w - 60) {
    size -= 2;
    ctx.font = `${size}px ${DISPLAY}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, PAD + w / 2, y + h / 2 + size * 0.08);
  ctx.textBaseline = "alphabetic";
  // There's no address to print yet: the QR code opens the site.
  ctx.fillStyle = "#e4c9ff";
  ctx.font = `700 34px ${BODY}`;
  ctx.fillText("Scan the code to play, free", PAD + w / 2, y + h + 64);
  ctx.textAlign = "start";
}

/** Draws the card and returns it as a PNG. `link` is what the QR code opens. */
export async function drawShareCard(card: ShareCard, link: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  await loadFonts();
  const avatarSrc = (id: string | null, name: string) =>
    avatarUrl(isAvatar(id) ? id : fallbackAvatar(name));
  const [logo, art, mascot, ...faces] = await Promise.all([
    loadImage("/art/logo-mark.webp"),
    loadImage(card.game.art),
    loadImage(card.mascot),
    ...card.board.map((r) => loadImage(avatarSrc(r.avatar, r.nickname))),
  ]);

  drawBackground(ctx, card);
  drawTop(ctx, card, logo, art);

  const drawMascot = (x: number, y: number, w: number, h: number) => {
    if (!mascot) return;
    ctx.save();
    // A bad day looks a little greyer.
    if (!card.celebrate) ctx.filter = "saturate(0.65) brightness(0.9)";
    contain(ctx, mascot, x, y, w, h);
    ctx.restore();
  };

  if (card.board.length === 0) {
    // Solo: a big mascot beside the headline, then the score and the facts.
    drawMascot(470, 380, 560, 640);
    drawHeadline(ctx, card, 330, 640, 620);
    drawScore(ctx, card, PAD, 1040, W - PAD * 2, 300);
    drawFacts(ctx, card, 1370);
  } else {
    drawMascot(530, 380, 510, 580);
    drawHeadline(ctx, card, 320, 660, 440);
    drawScore(ctx, card, PAD, 790, 480, 300);
    drawBoard(ctx, card, faces, 1116);
  }
  drawCta(ctx, card, link);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"),
  );
}
