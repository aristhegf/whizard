import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cssZoom } from "./common";
import { Icon } from "./Icon";

/** How far along a slide has to be let go to count, and how long before it's offered again. */
const DONE_AT = 0.7;
/** A quick flick counts from further back: px per ms, and how far along it must have got. */
const FLICK_SPEED = 0.6;
const FLICK_FROM = 0.3;
const RESET_AFTER = 1500;

/**
 * Slide to start the game, so a stray tap can't start it. The slide can begin anywhere on the
 * bar, not only on the handle; it keeps hold of the finger even if it drifts off the bar, and
 * springs back if it's let go early or the phone takes the gesture away. Enter or Space on the
 * handle does the same for a keyboard, as does a screen reader's double-tap.
 *
 * The handle follows the finger by writing straight to the bar's style, with no re-render on
 * the way, so it stays with the finger on slow phones too.
 */
export function SlideToPlay({
  label,
  name,
  doneLabel,
  onDone,
}: {
  /** The words on the bar. */
  label: string;
  /** The handle's spoken name; it should start with the words on the bar. */
  name: string;
  doneLabel: string;
  onDone: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  // Where the slide began and how it's going, in screen pixels; `zoom` turns those into the
  // bar's own, which differ when the page is scaled.
  const slide = useRef<{
    id: number;
    from: number;
    x: number;
    t: number;
    speed: number;
    zoom: number;
  } | null>(null);
  const at = useRef(0);
  const finished = useRef(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [done, setDone] = useState(false);
  const [sliding, setSliding] = useState(false);

  useEffect(() => () => void (reset.current && clearTimeout(reset.current)), []);

  /** How far the handle can travel. */
  const reach = () => {
    const el = bar.current;
    const knob = handle.current;
    if (!el || !knob) return 0;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    return Math.max(0, el.clientWidth - knob.offsetWidth - pad * 2);
  };

  const moveTo = (x: number) => {
    at.current = x;
    const max = reach();
    bar.current?.style.setProperty("--x", `${x}px`);
    bar.current?.style.setProperty("--p", max ? String(x / max) : "0");
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    setDone(true);
    moveTo(reach());
    onDone();
    // If the server says no (say, a player left), it's offered again.
    reset.current = setTimeout(() => {
      finished.current = false;
      setDone(false);
      moveTo(0);
    }, RESET_AFTER);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (finished.current || slide.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const zoom = cssZoom(event.currentTarget);
    slide.current = {
      id: event.pointerId,
      from: event.clientX - at.current * zoom,
      x: event.clientX,
      t: event.timeStamp,
      speed: 0,
      zoom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSliding(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const now = slide.current;
    if (now?.id !== event.pointerId) return;
    const max = reach();
    const dt = event.timeStamp - now.t;
    if (dt > 0) now.speed = (event.clientX - now.x) / dt;
    now.x = event.clientX;
    now.t = event.timeStamp;
    moveTo(Math.min(max, Math.max(0, (event.clientX - now.from) / now.zoom)));
    // All the way across: no need to wait for the finger to lift.
    if (max > 0 && at.current >= max - 1) end(event, true);
  };

  const end = (event: PointerEvent<HTMLDivElement>, arrived = false) => {
    const now = slide.current;
    if (now?.id !== event.pointerId) return;
    slide.current = null;
    setSliding(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const max = reach();
    const along = max ? at.current / max : 0;
    const flicked = now.speed > FLICK_SPEED && along > FLICK_FROM;
    // A gesture the phone took away never counts, however far it got.
    if (event.type !== "pointercancel" && max > 0 && (arrived || along >= DONE_AT || flicked)) {
      finish();
    } else {
      moveTo(0);
    }
  };

  return (
    <div
      ref={bar}
      className={`slide-play${sliding ? " sliding" : ""}${done ? " done" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      // A long press mustn't open the phone's menu in the middle of a slide.
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="slide-play-fill" aria-hidden="true" />
      <span className="slide-play-label" aria-hidden="true">
        {label}
        <span className="slide-play-hint">
          <Icon name="chevronRight" size={18} stroke={2.6} />
          <Icon name="chevronRight" size={18} stroke={2.6} />
          <Icon name="chevronRight" size={18} stroke={2.6} />
        </span>
      </span>
      <span className="slide-play-done" aria-live="polite">
        {done ? doneLabel : null}
      </span>
      <button
        ref={handle}
        type="button"
        className="slide-play-thumb"
        aria-label={name}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          finish();
        }}
        // A screen reader's double-tap arrives as a click with no pointer behind it.
        onClick={(event) => {
          if (event.detail === 0) finish();
        }}
      >
        <Icon name={done ? "check" : "chevronRight"} size={26} stroke={2.6} />
      </button>
    </div>
  );
}
