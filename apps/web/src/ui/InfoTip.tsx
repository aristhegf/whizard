import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cssZoom } from "./common";
import { Icon } from "./Icon";

/** How far the tip sits from its (i), and from the edge of the screen, in screen pixels. */
const GAP = 8;
const EDGE = 8;

/**
 * An (i) that holds a line or two of explanation, so a label can stay short. It opens on a tap,
 * on Enter, and on hover with a mouse (where a click then keeps it open); a second tap, a tap
 * elsewhere, Escape or scrolling closes it.
 *
 * The tip is a popover, which the browser draws above everything, so it shows over a sheet or a
 * dialog it's in (where a tooltip drawn on the page would be underneath) and isn't cut off by
 * anything that scrolls.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  // Opened by a tap or a click, so it stays when the mouse moves off; opened by hover, it goes.
  const pinned = useRef(false);

  // Above the (i) where there's room, below it otherwise, and kept on the screen sideways.
  const place = () => {
    const el = tip.current;
    const at = button.current?.getBoundingClientRect();
    if (!el || !at) return;
    const size = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(EDGE, at.left + at.width / 2 - size.width / 2),
      innerWidth - size.width - EDGE,
    );
    const above = at.top - size.height - GAP;
    const top = above >= EDGE ? above : at.bottom + GAP;
    // The tip's own pixels differ from the screen's when the page is scaled.
    const zoom = cssZoom(el);
    el.style.left = `${left / zoom}px`;
    el.style.top = `${top / zoom}px`;
  };

  const show = () => {
    const el = tip.current;
    if (!el || el.matches(":popover-open")) return;
    el.showPopover();
    place();
    setOpen(true);
  };

  const hide = () => {
    const el = tip.current;
    if (el?.matches(":popover-open")) el.hidePopover();
    pinned.current = false;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => {
      const el = tip.current;
      if (el?.matches(":popover-open")) el.hidePopover();
      pinned.current = false;
      setOpen(false);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !tip.current?.contains(target)) close();
    };
    // Escape closes the tip and nothing else: not a sheet or dialog the tip is in.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", close, true);
    addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`heading-hint info-tip-button${open ? " is-open" : ""}`}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          // A click on a tip the mouse had opened by hovering keeps it, rather than closing it.
          if (open && pinned.current) return hide();
          show();
          pinned.current = true;
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") show();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" && !pinned.current) hide();
        }}
      >
        <Icon name="info" size={16} stroke={2.2} />
      </button>
      <span ref={tip} id={id} role="tooltip" popover="manual" className="info-tip">
        {children}
      </span>
    </>
  );
}
