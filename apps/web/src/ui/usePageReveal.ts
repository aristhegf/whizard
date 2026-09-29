import { useEffect, useRef, useState } from "react";

/** The longest to hold a screen back for its pictures and fonts: a slow connection sees it anyway. */
const MAX_WAIT_MS = 1600;

/** Both fonts, asked for now so they're loading while the screen waits. */
function fontsReady(): Promise<unknown> {
  if (!document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load('700 1em "Bricolage Grotesque Variable"', "Whizard play"),
    document.fonts.load('500 1em "Inter Variable"', "Whizard play"),
  ]).catch(() => {});
}

/**
 * Keeps a screen hidden until its pictures are decoded and its fonts have arrived, then shows it
 * all at once, instead of the words appearing first and the mascot and game art popping in after.
 * Never holds it longer than MAX_WAIT_MS. Attach `ref` to the screen's outer element and add the
 * `reveal` class to it, plus `is-ready` once `ready` is true.
 */
export function usePageReveal(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let live = true;
    const show = () => live && setReady(true);
    // Only the pictures being shown: not ones inside something hidden, or left to load lazily.
    const waits: Promise<unknown>[] = [...root.querySelectorAll("img")]
      .filter((img) => img.loading !== "lazy" && img.getClientRects().length > 0)
      .map((img) => img.decode().catch(() => {}));
    waits.push(fontsReady());
    const timer = setTimeout(show, MAX_WAIT_MS);
    void Promise.all(waits).then(() => {
      clearTimeout(timer);
      show();
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled]);

  return { ref, ready };
}
