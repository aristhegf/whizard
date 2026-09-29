import { useSyncExternalStore } from "react";

/**
 * Display choices remembered on this device. "Reduce animations" works on top of the device's own
 * reduced-motion setting: either one turns the movement off.
 */

const REDUCE_MOTION_KEY = "whizard:reduceMotion";
const DEVICE_QUERY = "(prefers-reduced-motion: reduce)";

let reduceMotion = readReduceMotion();
const listeners = new Set<() => void>();

function readReduceMotion(): boolean {
  try {
    return localStorage.getItem(REDUCE_MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

/** The stylesheet turns animations off while the page carries this mark. */
function mark() {
  if (typeof document === "undefined") return;
  if (reduceMotion) document.documentElement.dataset.reduceMotion = "";
  else delete document.documentElement.dataset.reduceMotion;
}
mark();

export function setReduceMotion(value: boolean): void {
  reduceMotion = value;
  try {
    localStorage.setItem(REDUCE_MOTION_KEY, value ? "1" : "0");
  } catch {
    // Not remembered, but still on for now.
  }
  mark();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the player turned on "Reduce animations" here. */
export function useReduceMotionSetting(): boolean {
  return useSyncExternalStore(subscribe, () => reduceMotion);
}

function deviceReducesMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(DEVICE_QUERY).matches;
}

/** Whether to keep things still, from either the setting or the device. */
export function prefersStill(): boolean {
  return reduceMotion || deviceReducesMotion();
}

/** {@link prefersStill}, kept up to date. */
export function usePrefersStill(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const unsubscribe = subscribe(listener);
      const list = typeof matchMedia === "undefined" ? null : matchMedia(DEVICE_QUERY);
      list?.addEventListener("change", listener);
      return () => {
        unsubscribe();
        list?.removeEventListener("change", listener);
      };
    },
    prefersStill,
    () => false,
  );
}
