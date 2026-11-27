import { useEffect, useRef, useState } from "react";
import { usePrefersStill } from "../../display";
import { hasGraphicsHardware } from "../graphics";
import type { ToyLayout } from "./toyScene";

/**
 * Whether this browser should draw the 3D toys: WebGL on a real graphics chip (drawn in software,
 * one frame of glossy toys freezes the page), and not asking to save data.
 */
function canRun3d(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  if ((navigator.hardwareConcurrency ?? 4) < 3) return false;
  return hasGraphicsHardware();
}

/** Runs `task` once the browser has a quiet moment, so the page itself is drawn first. */
function whenIdle(task: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = requestIdleCallback(task, { timeout: 1500 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 300);
  return () => clearTimeout(id);
}

/**
 * Glossy 3D toys floating around the mascot. The mascot shows as a plain picture straight away
 * (and stays that way where 3D can't run); once the Three.js scene has drawn its first frame, the
 * picture hands over to the scene's own copy of it. Purely decorative, so hidden from screen
 * readers and never in the way of a click.
 */
export function ToyScene({
  mascot,
  layout,
  className,
  width,
  height,
}: {
  mascot: string;
  layout: ToyLayout;
  className?: string;
  /** The mascot picture's own size, so the fallback keeps its shape while it loads. */
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  // The device's reduced-motion setting, or Whizard's own "Reduce animations".
  const still = usePrefersStill();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const cancelIdle = whenIdle(() => {
      if (cancelled || !canRun3d()) return;
      import("./toyScene")
        .then(({ createToyScene }) => {
          if (cancelled) return;
          dispose = createToyScene(canvas, {
            mascot,
            layout,
            reducedMotion: still,
            onReady: () => !cancelled && setLive(true),
          }).dispose;
        })
        .catch(() => {
          // No 3D: the picture stays.
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      dispose?.();
      setLive(false);
    };
  }, [mascot, layout, still]);

  return (
    <div
      className={`toy-scene toy-scene-${layout}${live ? " is-live" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <img className="toy-scene-still" src={mascot} alt="" width={width} height={height} />
      <canvas ref={canvasRef} className="toy-scene-canvas" />
    </div>
  );
}
