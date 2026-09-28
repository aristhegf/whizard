import { useCallback, useEffect, useRef, useState } from "react";

/** A CSS time variable in milliseconds, from the transitions.dev tokens. */
function cssMs(name: string, fallback: number): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The transitions.dev "error state shake" for a field that turned a value down. Put `ref` on the
 * `.t-input` element (the field, or whatever owns its border); `shake()` plays the shake again.
 */
export function useErrorShake<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const shake = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    // Replay the shake from a clean baseline.
    element.classList.remove("is-shaking");
    void element.offsetWidth; // force reflow
    element.classList.add("is-shaking");
    const shakeMs = cssMs("--shake-dur-a", 80) * 2 + cssMs("--shake-dur-b", 60) * 2;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => element.classList.remove("is-shaking"), shakeMs + 20);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { ref, shake };
}

/**
 * Shakes the field each time `error` becomes a new message, or `attempt` changes while it
 * shows one (trying the same wrong value again). `message` keeps the last error so it can fade
 * out in the `.t-error-msg` rather than vanish.
 */
export function useShakeOnError<T extends HTMLElement = HTMLElement>(
  error: string | null | undefined,
  attempt = 0,
) {
  const { ref, shake } = useErrorShake<T>();
  const [last, setLast] = useState(error ?? "");
  if (error && error !== last) setLast(error);

  useEffect(() => {
    if (error) shake();
  }, [error, attempt, shake]);

  return { ref, shake, message: error ?? last, isError: !!error };
}
