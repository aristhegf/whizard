import type { PointerEvent } from "react";

const set = (el: HTMLElement, x: number, y: number) => {
  el.style.setProperty("--tilt-x", `${(0.5 - y) * 9}deg`);
  el.style.setProperty("--tilt-y", `${(x - 0.5) * 11}deg`);
  el.style.setProperty("--shine-x", `${x * 100}%`);
  el.style.setProperty("--shine-y", `${y * 100}%`);
};

/**
 * Spread onto a `.game-poster` to lean it toward the mouse and move its shine with it. It sets CSS
 * variables straight on the element, so there's no re-render per move. Touch and pen leave the
 * card flat, and reduced motion is handled in CSS.
 */
export const tilt = {
  onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    set(el, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  },
  onPointerLeave(event: PointerEvent<HTMLElement>) {
    set(event.currentTarget, 0.5, 0.5);
  },
};
