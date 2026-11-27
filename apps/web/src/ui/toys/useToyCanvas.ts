import { useEffect, useRef, useState } from "react";
import { usePrefersStill } from "../../display";
import { hasGraphicsHardware } from "../graphics";

/**
 * Whether this browser should draw 3D toys: WebGL on a real graphics chip (drawn in software, one
 * frame of glossy toys freezes the page), and not asking to save data.
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

export interface ToySceneHandle {
  dispose(): void;
}

/** Makes a scene on a canvas. Import the scene's module inside, so it loads only when used. */
export type MakeScene<H extends ToySceneHandle> = (
  canvas: HTMLCanvasElement,
  still: boolean,
  onReady: () => void,
) => Promise<H>;

/**
 * Puts a 3D scene on a canvas once the page is idle, if this device should draw one, and takes it
 * down again. `make` is read when the scene is (re)made, which happens when `key` changes or the
 * player's reduced-motion choice does. `live` turns true once the first frame is drawn, so a
 * still picture can hand over to the scene; `scene` is the running scene, for updates.
 */
export function useToyCanvas<H extends ToySceneHandle>(
  make: MakeScene<H> | null,
  key: string,
): {
  ref: React.RefObject<HTMLCanvasElement | null>;
  live: boolean;
  scene: React.RefObject<H | null>;
} {
  const ref = useRef<HTMLCanvasElement>(null);
  const scene = useRef<H | null>(null);
  const makeRef = useRef(make);
  const [live, setLive] = useState(false);
  // The device's reduced-motion setting, or Whizard's own "Reduce animations".
  const still = usePrefersStill();
  const enabled = make !== null;

  useEffect(() => {
    makeRef.current = make;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !enabled) return;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      const build = makeRef.current;
      if (cancelled || !build || !canRun3d()) return;
      build(canvas, still, () => !cancelled && setLive(true))
        .then((made) => {
          if (cancelled) made.dispose();
          else scene.current = made;
        })
        .catch(() => {
          // No 3D: whatever stands in for it stays.
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
      scene.current?.dispose();
      scene.current = null;
      setLive(false);
    };
  }, [key, still, enabled]);

  return { ref, live, scene };
}
