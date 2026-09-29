/**
 * Runs `run` once the page has finished loading and the browser has nothing better to do, so
 * fetching something for later never competes with what's on screen now. Returns a way to cancel.
 */
export function whenIdle(run: () => void): () => void {
  let cancelled = false;
  let cancelIdle = () => {};
  const go = () => {
    if (cancelled) return;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(run, 500);
      cancelIdle = () => clearTimeout(id);
    }
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", go);
    cancelIdle();
  };
}
