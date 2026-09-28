import qrcode from "qrcode-generator";
import { avatarUrl, fallbackAvatar, isAvatar } from "../ui/Avatar";

// The picture players share when a game is over: 1920 × 1080 (16:9), drawn in the browser so
// it needs no server. The QR code opens the site, whatever address it's on.

export const CARD_WIDTH = 1920;
export const CARD_HEIGHT = 1080;

export interface CardPlayer {
  nickname: string;
  avatar: string | null;
  /** What they got: points, a time. */
  label: string;
}

export interface ShareCard {
  /** "Bible Quiz", "Word Rush". */
  title: string;
  /** Short facts under the title: the mode, the level, how many rounds. */
  details: string[];
  /** The game's or topic's picture. */
  art: string;
  /** Top and bottom of the game's colour wash. */
  colors: [string, string];
  /** The big line: "Ada wins!", "You scored 8,750". */
  headline: string;
  /** A line under it, such as how the sharer did. */
  subline?: string;
  /** The top three, best first. Empty for a solo game. */
  podium: CardPlayer[];
  /** A solo game's score, shown instead of the podium. */
  score?: { value: string; detail: string };
}

const FONT = '"Poppins", system-ui, sans-serif';
const BODY = '"Nunito Variable", "Nunito", system-ui, sans-serif';
const RINGS = ["#ffd43f", "#c9d2ff", "#ffab6b"];

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    // A missing picture leaves a gap rather than spoiling the whole card.
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
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

/** Shortens text with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  size: number,
  ring: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.shadowColor = "rgb(0 0 0 / 45%)";
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#1c1a52";
  ctx.fill();
  ctx.clip();
  if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

function drawQr(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.floor(size / count);
  const offset = Math.floor((size - cell * count) / 2);
  ctx.fillStyle = "#0d0b30";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col))
        ctx.fillRect(x + offset + col * cell, y + offset + row * cell, cell, cell);
    }
  }
}

/** Draws the card and returns it as a PNG. `link` is what the QR code opens. */
export async function drawShareCard(card: ShareCard, link: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  // The site's fonts, before any text is drawn.
  await Promise.all(
    [`800 96px ${FONT}`, `700 40px ${FONT}`, `700 32px ${BODY}`].map((f) =>
      document.fonts.load(f).catch(() => []),
    ),
  );
  const avatarSrc = (id: string | null, name: string) =>
    avatarUrl(isAvatar(id) ? id : fallbackAvatar(name));
  const [logo, art, mascot, ...faces] = await Promise.all([
    loadImage("/art/logo-mark.webp"),
    loadImage(card.art),
    loadImage("/art/mascot/podium.webp"),
    ...card.podium.map((p) => loadImage(avatarSrc(p.avatar, p.nickname))),
  ]);

  // Background: the site's night purple, lit by the game's colour on the right.
  const bg = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bg.addColorStop(0, "#0b0a2b");
  bg.addColorStop(1, "#1a0f4d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const glow = ctx.createRadialGradient(1500, 380, 40, 1500, 380, 900);
  glow.addColorStop(0, `${card.colors[0]}88`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const warm = ctx.createRadialGradient(160, 1000, 20, 160, 1000, 700);
  warm.addColorStop(0, "rgb(122 58 255 / 40%)");
  warm.addColorStop(1, "transparent");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Brand, top left.
  if (logo) ctx.drawImage(logo, 100, 76, 96, 96 * (logo.height / logo.width));
  ctx.fillStyle = "#fff";
  ctx.font = `800 58px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Whizard", 214, 124);

  // What was played.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffd43f";
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText("GAME RESULTS", 104, 262);
  ctx.fillStyle = "#fff";
  ctx.font = `800 92px ${FONT}`;
  ctx.fillText(fit(ctx, card.title, 1050), 100, 360);

  // The details as pills.
  ctx.font = `700 30px ${BODY}`;
  let px = 104;
  for (const detail of card.details) {
    const w = ctx.measureText(detail).width + 48;
    roundRect(ctx, px, 392, w, 58, 29);
    ctx.fillStyle = "rgb(255 255 255 / 10%)";
    ctx.fill();
    ctx.strokeStyle = "rgb(190 170 255 / 45%)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e6e1ff";
    ctx.fillText(detail, px + 24, 432);
    px += w + 16;
  }

  // The headline.
  const headline = ctx.createLinearGradient(100, 0, 1100, 0);
  headline.addColorStop(0, "#ffffff");
  headline.addColorStop(1, "#d6b8ff");
  ctx.fillStyle = headline;
  ctx.font = `800 76px ${FONT}`;
  ctx.fillText(fit(ctx, card.headline, 1080), 100, 560);
  if (card.subline) {
    ctx.fillStyle = "#b9b5e3";
    ctx.font = `700 34px ${BODY}`;
    ctx.fillText(fit(ctx, card.subline, 1080), 104, 616);
  }

  if (card.score) {
    // Solo: the score, big.
    roundRect(ctx, 100, 668, 760, 300, 40);
    ctx.fillStyle = "rgb(13 13 44 / 70%)";
    ctx.fill();
    ctx.strokeStyle = "rgb(150 132 255 / 40%)";
    ctx.stroke();
    ctx.fillStyle = "#b9b5e3";
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText("SCORE", 150, 738);
    ctx.fillStyle = "#ffd43f";
    ctx.font = `800 130px ${FONT}`;
    ctx.fillText(fit(ctx, card.score.value, 660), 144, 874);
    ctx.fillStyle = "#e6e1ff";
    ctx.font = `700 34px ${BODY}`;
    ctx.fillText(fit(ctx, card.score.detail, 660), 150, 932);
    if (mascot) ctx.drawImage(mascot, 900, 640, 330, 330 * (mascot.height / mascot.width));
  } else {
    // The podium: second, first, third from left to right.
    const slots = [
      { i: 1, cx: 300, top: 780, size: 150 },
      { i: 0, cx: 620, top: 730, size: 190 },
      { i: 2, cx: 940, top: 810, size: 140 },
    ];
    for (const { i, cx, top, size } of slots) {
      const player = card.podium[i];
      if (!player) continue;
      const blockTop = top + size / 2 + 60;
      const block = ctx.createLinearGradient(0, blockTop, 0, CARD_HEIGHT);
      block.addColorStop(0, i === 0 ? "#7a3aff" : "#4b2fe0");
      block.addColorStop(1, "rgb(40 20 120 / 30%)");
      roundRect(ctx, cx - 140, blockTop, 280, CARD_HEIGHT - blockTop + 40, 28);
      ctx.fillStyle = block;
      ctx.fill();
      drawAvatar(ctx, faces[i] ?? null, cx, top, size, RINGS[i]!);
      // Rank badge.
      ctx.beginPath();
      ctx.arc(cx + size / 2 - 14, top + size / 2 - 14, 30, 0, Math.PI * 2);
      ctx.fillStyle = RINGS[i]!;
      ctx.fill();
      ctx.fillStyle = "#1a0f4d";
      ctx.font = `800 34px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), cx + size / 2 - 14, top + size / 2 - 12);
      if (i === 0) {
        ctx.fillStyle = "#ffd43f";
        ctx.font = `64px ${FONT}`;
        ctx.fillText("👑", cx, top - size / 2 - 40);
      }
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";
      ctx.font = `800 36px ${FONT}`;
      ctx.fillText(fit(ctx, player.nickname, 250), cx, blockTop + 58);
      ctx.fillStyle = "#ffd43f";
      ctx.font = `700 32px ${BODY}`;
      ctx.fillText(fit(ctx, player.label, 250), cx, blockTop + 102);
      ctx.textAlign = "start";
    }
  }

  // The game's picture, right.
  const tile = { x: 1310, y: 96, size: 500 };
  const wash = ctx.createLinearGradient(0, tile.y, 0, tile.y + tile.size);
  wash.addColorStop(0, card.colors[0]);
  wash.addColorStop(1, card.colors[1]);
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 50%)";
  ctx.shadowBlur = 60;
  roundRect(ctx, tile.x, tile.y, tile.size, tile.size, 56);
  ctx.fillStyle = wash;
  ctx.fill();
  ctx.restore();
  if (art) {
    ctx.save();
    roundRect(ctx, tile.x, tile.y, tile.size, tile.size, 56);
    ctx.clip();
    drawCover(ctx, art, tile.x, tile.y, tile.size, tile.size);
    ctx.restore();
  }

  // The QR code, bottom right, with no address written out: it opens the site.
  const qr = { x: 1310, y: 650, size: 330 };
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 45%)";
  ctx.shadowBlur = 40;
  roundRect(ctx, qr.x, qr.y, qr.size, qr.size, 36);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.restore();
  drawQr(ctx, link, qr.x + 26, qr.y + 26, qr.size - 52);
  ctx.fillStyle = "#fff";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("Scan to", qr.x + qr.size + 40, qr.y + 130);
  ctx.fillText("play", qr.x + qr.size + 40, qr.y + 186);
  ctx.fillStyle = "#b9b5e3";
  ctx.font = `700 28px ${BODY}`;
  ctx.fillText("It’s free", qr.x + qr.size + 42, qr.y + 240);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png"),
  );
}
