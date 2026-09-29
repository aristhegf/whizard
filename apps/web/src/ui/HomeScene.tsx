import { useEffect, useRef, useState, type CSSProperties } from "react";
import { prefersStill, usePrefersStill } from "../display";

/**
 * The Play screen's living background: the Whizard games room in layers. Far away, the night sky
 * through the windows; then the room, with flickering candles and lanterns, a slow glow on the
 * crown rug and swaying banners; then drifting sparkles; and nearest, a sofa, a plant and a chair
 * in the corners. Each layer leans a different amount with the mouse, so the room has depth.
 * It's all pictures and CSS, except the sparkles (a small canvas). It stays still for anyone who
 * asks for less motion, and rests while the tab is hidden.
 */

/** The picture's size: every effect is placed in its pixels, as a percentage. */
const W = 1672;
const H = 941;
const at = (x: number, y: number, size: number) =>
  ({
    left: `${(x / W) * 100}%`,
    top: `${(y / H) * 100}%`,
    width: `${(size / W) * 100}%`,
  }) as CSSProperties;

/** Candle flames and lanterns: [x, y, glow size, "warm" or "orb"]. */
const LIGHTS: [number, number, number, "warm" | "orb"][] = [
  [580, 112, 120, "warm"],
  [842, 200, 110, "warm"],
  [1297, 168, 120, "warm"],
  [357, 295, 90, "warm"],
  [622, 162, 70, "warm"],
  [1455, 385, 90, "warm"],
  [118, 35, 70, "warm"],
  [352, 78, 60, "warm"],
  [1417, 118, 60, "warm"],
  [1603, 48, 70, "warm"],
  [1497, 268, 60, "warm"],
  [572, 398, 50, "warm"],
  [615, 418, 50, "warm"],
  [512, 495, 55, "warm"],
  [292, 515, 55, "warm"],
  [83, 515, 55, "warm"],
  [885, 525, 55, "warm"],
  [975, 528, 55, "warm"],
  [1210, 530, 55, "warm"],
  [165, 655, 120, "warm"],
  [1428, 650, 70, "warm"],
  [325, 795, 80, "warm"],
  [470, 462, 110, "orb"],
  [1420, 472, 120, "orb"],
  [240, 190, 70, "orb"],
];

/** A picture's worth of pixels, cut to a shape and swayed from its top, like cloth or leaves. */
function Sway({ className, clip, origin }: { className: string; clip: string; origin: string }) {
  return (
    <div
      className={`scene-sway ${className}`}
      style={{ clipPath: `polygon(${clip})`, transformOrigin: origin }}
    />
  );
}

export function HomeScene() {
  const root = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const still = usePrefersStill();
  // The room fades in behind the screen once its picture is here, so the screen isn't held up for it.
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (picture.current?.complete) setLit(true);
  }, []);

  // Rest while the tab is hidden.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sync = () => el.classList.toggle("scene-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // The room leans a little with the mouse: far things less, near things more.
  useEffect(() => {
    const el = root.current;
    if (!el || still || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    const step = () => {
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      el.style.setProperty("--px", x.toFixed(4));
      el.style.setProperty("--py", y.toFixed(4));
      frame =
        Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (event: PointerEvent) => {
      targetX = (event.clientX / innerWidth) * 2 - 1;
      targetY = (event.clientY / innerHeight) * 2 - 1;
      if (!frame && !document.hidden) frame = requestAnimationFrame(step);
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => {
      removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [still]);

  return (
    <div
      className={`home-scene${lit ? " is-lit" : ""}`}
      ref={root}
      aria-hidden="true"
      data-reveal-later
    >
      <div className="scene-parallax">
        <div className="scene-frame">
          <img
            ref={picture}
            onLoad={() => setLit(true)}
            className="scene-base"
            src="/art/scenes/home.webp"
            srcSet="/art/scenes/home-960.webp 960w, /art/scenes/home.webp 1672w"
            sizes="(max-aspect-ratio: 16/9) 180vh, 100vw"
            alt=""
            width={W}
            height={H}
            fetchPriority="high"
          />
          {/* The night sky through the windows: its own picture, further away than the room, so
              it moves less, showing only through the glass. */}
          <div className="scene-sky">
            <div className="sky-far">
              <img className="sky-art" src="/art/scenes/home-sky.webp" alt="" />
              <div className="sky-glow">
                <div className="sky-stars" />
                <div className="sky-nebula" />
                <div className="sky-cloud one" />
                <div className="sky-cloud two" />
                <div className="sky-shooting" />
              </div>
            </div>
          </div>
          <Sway
            className="banner"
            clip="23.2% 0%, 30.2% 0%, 30.2% 35%, 26.8% 38.8%, 23.2% 35%"
            origin="26.8% 0%"
          />
          <Sway
            className="small-banner"
            clip="78.8% 24.8%, 81.3% 24.8%, 81.3% 40%, 78.8% 40%"
            origin="80% 24.8%"
          />
          <Sway className="ivy" clip="0% 0%, 6.2% 0%, 6.2% 42%, 0% 42%" origin="3% 0%" />
          <Sway
            className="fern"
            clip="88.6% 60%, 100% 60%, 100% 100%, 88.6% 100%"
            origin="95% 100%"
          />
          <div className="scene-lights">
            {LIGHTS.map(([x, y, size, kind], i) => (
              <span
                key={i}
                className={`scene-light ${kind}`}
                style={
                  {
                    ...at(x - size / 2, y - size / 2, size),
                    "--flicker": `${2.6 + ((i * 0.37) % 1.8)}s`,
                    "--delay": `${-((i * 0.53) % 3)}s`,
                  } as CSSProperties
                }
              />
            ))}
            <span className="scene-rug" style={at(560, 660, 1000)} />
            <span className="scene-crown" style={at(900, 700, 330)} />
            <span className="scene-neon" style={at(690, 130, 130)} />
            <span className="scene-neon later" style={at(1520, 150, 140)} />
            <span className="scene-ambient purple" />
            <span className="scene-ambient gold" />
          </div>
          {/* Nearest of all: the sofa, its plant and the chair, drawn again on their own over the
              room's, so they can lean more than the room behind them. */}
          <div className="scene-near">
            <div className="near-sofa">
              <div className="near-leaves" />
              <span className="near-candle" />
            </div>
            <div className="near-chair" />
          </div>
        </div>
      </div>
      {!still && <Sparkles />}
      <div className="scene-scrim" />
    </div>
  );
}

/** Motes of gold and violet light drifting up through the room, and the odd twinkle. */
function Sparkles() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = innerWidth;
      height = innerHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener("resize", resize);

    type Mote = {
      x: number;
      y: number;
      r: number;
      vy: number;
      drift: number;
      phase: number;
      gold: boolean;
    };
    const count = width < 700 ? 16 : 34;
    const motes: Mote[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.8 + Math.random() * 1.8,
      vy: 6 + Math.random() * 14,
      drift: 6 + Math.random() * 12,
      phase: Math.random() * Math.PI * 2,
      gold: Math.random() < 0.6,
    }));
    // Now and then a four-pointed twinkle somewhere in the room.
    let twinkle: { x: number; y: number; born: number } | null = null;
    let nextTwinkle = performance.now() + 2500;

    let frame = 0;
    let last = performance.now();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      // About 30 frames a second is plenty for slow motes, and halves the work.
      if (dt < 1 / 32) return;
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (const m of motes) {
        m.y -= m.vy * dt;
        m.phase += dt * 0.8;
        if (m.y < -10) {
          m.y = height + 10;
          m.x = Math.random() * width;
        }
        const x = m.x + Math.sin(m.phase) * m.drift;
        const glow = 0.35 + 0.35 * Math.sin(m.phase * 1.7);
        ctx.beginPath();
        ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = m.gold ? `rgba(255, 206, 110, ${glow})` : `rgba(200, 150, 255, ${glow})`;
        ctx.shadowColor = m.gold ? "rgba(255, 180, 60, 0.9)" : "rgba(170, 90, 255, 0.9)";
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      if (!twinkle && now > nextTwinkle) {
        twinkle = {
          x: width * (0.1 + Math.random() * 0.8),
          y: height * (0.15 + Math.random() * 0.6),
          born: now,
        };
      }
      if (twinkle) {
        const age = (now - twinkle.born) / 1200;
        if (age >= 1) {
          twinkle = null;
          nextTwinkle = now + 3500 + Math.random() * 5000;
        } else {
          const size = 10 * Math.sin(age * Math.PI);
          ctx.save();
          ctx.translate(twinkle.x, twinkle.y);
          ctx.rotate(age * 0.6);
          ctx.fillStyle = `rgba(255, 236, 170, ${0.9 * Math.sin(age * Math.PI)})`;
          ctx.shadowColor = "rgba(255, 200, 90, 0.9)";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? size : size * 0.22;
            const a = (i * Math.PI) / 4;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    };

    // Only while the tab is showing, and never for anyone who asked for stillness.
    const start = () => {
      if (!frame && !document.hidden && !prefersStill()) {
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas className="scene-sparkles" ref={canvas} />;
}
