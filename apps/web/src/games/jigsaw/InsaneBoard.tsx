import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Icon } from "../../ui/Icon";
import { KNOB_REACH, PIECE_SIZE, pieceShapes } from "./pieceShape";

/**
 * Insane: the picture's canvas, which zooms and pans but never moves on its own, and a tray of
 * pieces underneath. Drag a piece out of the tray and drop it on its spot and it snaps in and
 * locks; drop it anywhere else on the canvas and it stays there until you move it again.
 *
 * Pinch (or the mouse wheel) zooms. Double-tap the canvas to zoom in until it fills the view,
 * and double-tap around it to zoom back out until it all fits.
 */

const U = PIECE_SIZE;
const R = KNOB_REACH;
/** How near its spot a dropped piece snaps in, in canvas units (a piece is 100)... */
const SNAP = 24;
/** ...and never less than this on screen, so small pieces still snap when zoomed out. */
const SNAP_PX = 14;
/** How far in you can zoom, from the whole canvas fitting. */
const MAX_ZOOM = 8;
/** How much of the view the canvas takes when it fits. */
const FIT = 0.94;
/** How far past the view's edge the canvas can be pulled. */
const PAN_MARGIN = 40;
const DOUBLE_TAP_MS = 320;
const TAP_SLOP = 10;
/** A piece placed but not yet confirmed goes back if the server doesn't agree by then. */
const OPTIMISTIC_MS = 2500;

interface Transform {
  scale: number;
  x: number;
  y: number;
}
interface Point {
  x: number;
  y: number;
}
/** Pieces left on the canvas, not in their place: where their top-left corner is. */
type Loose = Record<number, Point>;

interface Drag {
  piece: number;
  from: "tray" | "canvas";
  pointerId: number;
  /** Where on the piece it was picked up, in canvas units from its top-left corner. */
  grab: Point;
}

type Gesture =
  | { kind: "pan"; start: Point; origin: Transform; moved: boolean }
  | { kind: "pinch"; distance: number; origin: Transform; mid: Point };

export function InsaneBoard({
  cols,
  rows,
  src,
  board,
  tray,
  done,
  storageKey,
  onPlace,
}: {
  cols: number;
  rows: number;
  src: string;
  /** From the server: `board[spot] === spot` once that piece is placed. */
  board: number[];
  tray: number[];
  done: boolean;
  /** Where loose pieces are kept on this device, one game at a time. */
  storageKey: string;
  onPlace: (piece: number) => void;
}) {
  // The canvas, in the picture's own shape.
  const width = cols * U;
  const height = rows * U;
  const shapes = useMemo(() => pieceShapes(cols, rows, src), [cols, rows, src]);
  const clipId = `insane${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;

  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const view = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  // Until someone zooms, the canvas keeps fitting the view as it changes size.
  const zoomed = useRef(false);

  const [loose, setLoose] = useState<Loose>(() => readLoose(storageKey));
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => writeLoose(storageKey, loose), [storageKey, loose]);

  // Pieces the server has placed, and yours it hasn't confirmed yet.
  const isPlaced = (piece: number) => board[piece] === piece || pending.has(piece);

  const placed = Array.from({ length: cols * rows }, (_, i) => i).filter(isPlaced);
  const onCanvas = Object.keys(loose)
    .map(Number)
    .filter((p) => !isPlaced(p));
  const inTray = tray.filter((p) => !isPlaced(p) && loose[p] === undefined);

  // The canvas's place in the view --------------------------------------------------------

  const bounds = useCallback(() => viewport.current?.getBoundingClientRect() ?? null, []);

  const apply = useCallback((next: Transform, animate = false) => {
    view.current = next;
    const el = stage.current;
    if (!el) return;
    el.style.transition = animate ? "transform 220ms ease" : "none";
    el.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
  }, []);

  const fitScale = useCallback(() => {
    const r = bounds();
    return r ? Math.min(r.width / width, r.height / height) * FIT : 1;
  }, [bounds, width, height]);

  const clamp = useCallback(
    (t: Transform): Transform => {
      const r = bounds();
      if (!r) return t;
      const scale = Math.min(Math.max(t.scale, fitScale()), fitScale() * MAX_ZOOM);
      const w = width * scale;
      const h = height * scale;
      const x = Math.min(
        Math.max(t.x, Math.min(0, r.width - w) - PAN_MARGIN),
        Math.max(0, r.width - w) + PAN_MARGIN,
      );
      const y = Math.min(
        Math.max(t.y, Math.min(0, r.height - h) - PAN_MARGIN),
        Math.max(0, r.height - h) + PAN_MARGIN,
      );
      return { scale, x, y };
    },
    [bounds, fitScale, width, height],
  );

  const fit = useCallback(
    (animate = false) => {
      const r = bounds();
      if (!r) return;
      const scale = fitScale();
      zoomed.current = false;
      apply(
        { scale, x: (r.width - width * scale) / 2, y: (r.height - height * scale) / 2 },
        animate,
      );
    },
    [apply, bounds, fitScale, width, height],
  );

  /** Zooms in until the canvas fills the view, around a point on the canvas. */
  const fill = (at: Point) => {
    const r = bounds();
    if (!r) return;
    let scale = Math.max(r.width / width, r.height / height);
    // A canvas that already nearly fills the view goes in closer instead.
    if (scale < view.current.scale * 1.2) scale = view.current.scale * 2;
    zoomed.current = true;
    apply(clamp({ scale, x: r.width / 2 - at.x * scale, y: r.height / 2 - at.y * scale }), true);
  };

  /** Zooms to `scale`, keeping the canvas point under `screen` where it is. */
  const zoomAt = (screen: Point, scale: number) => {
    const t = view.current;
    const world = { x: (screen.x - t.x) / t.scale, y: (screen.y - t.y) / t.scale };
    zoomed.current = true;
    apply(clamp({ scale, x: screen.x - world.x * scale, y: screen.y - world.y * scale }));
  };

  useLayoutEffect(() => {
    fit();
    const el = viewport.current;
    if (!el) return;
    const resized = new ResizeObserver(() => {
      if (zoomed.current) apply(clamp(view.current));
      else fit();
    });
    resized.observe(el);
    return () => resized.disconnect();
  }, [apply, clamp, fit]);

  // The mouse wheel zooms the canvas, and scrolls the tray sideways.
  useEffect(() => {
    const el = viewport.current;
    const strip = trayRef.current;
    if (!el || !strip) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      zoomAt({ x: event.clientX - r.left, y: event.clientY - r.top }, view.current.scale * factor);
    };
    const onTrayWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    strip.addEventListener("wheel", onTrayWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      strip.removeEventListener("wheel", onTrayWheel);
    };
  });

  // Dragging a piece ----------------------------------------------------------------------

  const moveGhost = (at: Point, d: Drag) => {
    const el = ghost.current;
    if (!el) return;
    const s = view.current.scale;
    el.style.width = `${(U + 2 * R) * s}px`;
    el.style.height = `${(U + 2 * R) * s}px`;
    el.style.transform = `translate(${at.x - (d.grab.x + R) * s}px, ${at.y - (d.grab.y + R) * s}px)`;
  };

  const inside = (at: Point, el: HTMLElement | null) => {
    const r = el?.getBoundingClientRect();
    return !!r && at.x >= r.left && at.x <= r.right && at.y >= r.top && at.y <= r.bottom;
  };

  const drop = (at: Point, d: Drag) => {
    const put = (next: Point | null) =>
      setLoose((all) => {
        const copy = { ...all };
        if (next) copy[d.piece] = next;
        else delete copy[d.piece];
        return copy;
      });
    if (inside(at, trayRef.current)) return put(null);
    if (!inside(at, viewport.current)) {
      // Let go somewhere else: back where it came from.
      if (d.from === "tray") put(null);
      return;
    }
    const r = bounds()!;
    const t = view.current;
    const x = (at.x - r.left - t.x) / t.scale - d.grab.x;
    const y = (at.y - r.top - t.y) / t.scale - d.grab.y;
    const home = { x: (d.piece % cols) * U, y: Math.floor(d.piece / cols) * U };
    const tolerance = Math.max(SNAP, SNAP_PX / t.scale);
    if (Math.abs(x - home.x) < tolerance && Math.abs(y - home.y) < tolerance) {
      put(null);
      setPending((all) => new Set(all).add(d.piece));
      onPlace(d.piece);
      // Once the server agrees the board shows it placed anyway; if it doesn't, it goes back
      // to the tray.
      setTimeout(
        () =>
          setPending((all) => {
            const next = new Set(all);
            next.delete(d.piece);
            return next;
          }),
        OPTIMISTIC_MS,
      );
      return;
    }
    // It stays on the canvas where it was dropped.
    put({
      x: Math.min(Math.max(x, 0), width - U),
      y: Math.min(Math.max(y, 0), height - U),
    });
  };

  const startDrag = (d: Drag, at: Point) => {
    dragRef.current = d;
    setDrag(d);
    requestAnimationFrame(() => moveGhost(at, d));
    const move = (event: PointerEvent) => {
      if (event.pointerId !== d.pointerId) return;
      moveGhost({ x: event.clientX, y: event.clientY }, d);
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== d.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (event.type === "pointerup") drop({ x: event.clientX, y: event.clientY }, d);
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  // From the tray: a mouse drags at once; a finger drags when it moves up out of the tray,
  // and swipes the tray along when it moves sideways.
  const trayPress = useRef<{
    piece: number;
    pointerId: number;
    start: Point;
    mouse: boolean;
  } | null>(null);
  const onTrayDown = (event: ReactPointerEvent, piece: number) => {
    if (done || dragRef.current) return;
    trayPress.current = {
      piece,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      mouse: event.pointerType === "mouse",
    };
  };
  const onTrayMove = (event: ReactPointerEvent) => {
    const press = trayPress.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const dx = event.clientX - press.start.x;
    const dy = event.clientY - press.start.y;
    const far = Math.hypot(dx, dy) > (press.mouse ? 4 : 8);
    if (!far) return;
    trayPress.current = null;
    if (!press.mouse && !(dy < 0 && Math.abs(dy) > Math.abs(dx))) return;
    event.preventDefault();
    startDrag(
      {
        piece: press.piece,
        from: "tray",
        pointerId: event.pointerId,
        grab: { x: U / 2, y: U / 2 },
      },
      { x: event.clientX, y: event.clientY },
    );
  };

  // On the canvas: a loose piece drags; anywhere else pans; two fingers pinch ----------------

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);

  const local = (event: { clientX: number; clientY: number }): Point => {
    const r = bounds();
    return { x: event.clientX - (r?.left ?? 0), y: event.clientY - (r?.top ?? 0) };
  };

  const beginPinch = () => {
    const [a, b] = [...pointers.current.values()] as [Point, Point];
    const t = view.current;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      origin: t,
      mid: { x: (mid.x - t.x) / t.scale, y: (mid.y - t.y) / t.scale },
    };
  };
  const beginPan = (at: Point) => {
    gesture.current = { kind: "pan", start: at, origin: view.current, moved: false };
  };

  const onViewDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const piece = (event.target as HTMLElement).closest<HTMLElement>("[data-loose]");
    if (piece && pointers.current.size === 0 && !done) {
      const n = Number(piece.dataset.loose);
      const t = view.current;
      const at = local(event);
      const spot = loose[n]!;
      startDrag(
        {
          piece: n,
          from: "canvas",
          pointerId: event.pointerId,
          grab: { x: (at.x - t.x) / t.scale - spot.x, y: (at.y - t.y) / t.scale - spot.y },
        },
        { x: event.clientX, y: event.clientY },
      );
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) beginPinch();
    else if (pointers.current.size === 1) beginPan(local(event));
  };

  const onViewMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const at = local(event);
    pointers.current.set(event.pointerId, at);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      const dx = at.x - g.start.x;
      const dy = at.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      g.moved = true;
      zoomed.current = true;
      apply(clamp({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy }));
    } else if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = (g.origin.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.distance;
      zoomed.current = true;
      apply(clamp({ scale, x: mid.x - g.mid.x * scale, y: mid.y - g.mid.y * scale }));
    }
  };

  const onViewUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const g = gesture.current;
    if (pointers.current.size === 1) {
      // One finger left after a pinch carries on panning.
      beginPan([...pointers.current.values()][0]!);
      if (gesture.current?.kind === "pan") gesture.current.moved = true;
      return;
    }
    gesture.current = null;
    if (event.type !== "pointerup" || g?.kind !== "pan" || g.moved) return;
    const at = local(event);
    const last = lastTap.current;
    if (
      last &&
      event.timeStamp - last.at < DOUBLE_TAP_MS &&
      Math.hypot(at.x - last.point.x, at.y - last.point.y) < 30
    ) {
      lastTap.current = null;
      const t = view.current;
      const world = { x: (at.x - t.x) / t.scale, y: (at.y - t.y) / t.scale };
      const onTheCanvas = world.x >= 0 && world.x <= width && world.y >= 0 && world.y <= height;
      if (onTheCanvas) fill(world);
      else fit(true);
    } else {
      lastTap.current = { at: event.timeStamp, point: at };
    }
  };

  // Drawing -------------------------------------------------------------------------------

  const art = (piece: number) => {
    const row = Math.floor(piece / cols);
    const col = piece % cols;
    return (
      <svg
        className="insane-art"
        viewBox={`${-R} ${-R} ${U + 2 * R} ${U + 2 * R}`}
        aria-hidden="true"
      >
        <image
          href={src}
          x={-col * U}
          y={-row * U}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId}${piece})`}
        />
        <path className="jigsaw-edge" d={shapes[piece]} />
      </svg>
    );
  };

  const at = (p: Point): CSSProperties => ({ left: p.x - R, top: p.y - R });

  return (
    <div className={`insane${done ? " done" : ""}`}>
      <svg className="insane-defs" aria-hidden="true">
        <defs>
          {shapes.map((d, piece) => (
            <clipPath key={piece} id={`${clipId}${piece}`}>
              <path d={d} />
            </clipPath>
          ))}
        </defs>
      </svg>

      <div
        ref={viewport}
        className="insane-view"
        role="group"
        aria-label={`Puzzle canvas, ${cols * rows} pieces. Pinch or scroll to zoom; double-tap to zoom in or out.`}
        onPointerDown={onViewDown}
        onPointerMove={onViewMove}
        onPointerUp={onViewUp}
        onPointerCancel={onViewUp}
      >
        <div ref={stage} className="insane-stage" style={{ width, height }}>
          <div className="insane-canvas" />
          {placed.map((piece) => (
            <div
              key={piece}
              className="insane-piece placed"
              data-placed={piece}
              style={at({ x: (piece % cols) * U, y: Math.floor(piece / cols) * U })}
            >
              {art(piece)}
            </div>
          ))}
          {onCanvas.map((piece) => (
            <div
              key={piece}
              className={`insane-piece loose${drag?.piece === piece ? " lifted" : ""}`}
              data-loose={piece}
              style={at(loose[piece]!)}
            >
              {art(piece)}
            </div>
          ))}
        </div>
      </div>

      <div className="insane-tray-wrap">
        <TrayArrow tray={trayRef} direction={-1} count={inTray.length} />
        <div
          ref={trayRef}
          className="insane-tray"
          role="list"
          aria-label={`Pieces to place, ${inTray.length} left in the tray`}
          onPointerMove={onTrayMove}
          onPointerUp={() => (trayPress.current = null)}
          onPointerCancel={() => (trayPress.current = null)}
        >
          <img className="insane-peek" src={src} alt="The picture" />
          {inTray.map((piece) => (
            <div
              key={piece}
              role="listitem"
              className={`insane-piece in-tray${drag?.piece === piece ? " lifted" : ""}`}
              data-piece={piece}
              aria-label={`Piece ${piece + 1}`}
              onPointerDown={(event) => onTrayDown(event, piece)}
            >
              {art(piece)}
            </div>
          ))}
        </div>
        <TrayArrow tray={trayRef} direction={1} count={inTray.length} />
      </div>

      {drag && (
        <div ref={ghost} className="insane-ghost" aria-hidden="true">
          {art(drag.piece)}
        </div>
      )}
    </div>
  );
}

const STORE = "whizard:insane";

/** Loose pieces for this game from this device, so a reload keeps them where they were. */
function readLoose(key: string): Loose {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as {
      key: string;
      loose: Loose;
    } | null;
    return saved?.key === key ? saved.loose : {};
  } catch {
    return {};
  }
}

function writeLoose(key: string, loose: Loose) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ key, loose }));
  } catch {
    // Private windows and full storage: the pieces just won't survive a reload.
  }
}

/** How fast the tray slides while the pointer rests on an arrow, in pixels a second. */
const SLIDE_SPEED = 520;

/**
 * An arrow at one end of the tray, for a mouse: resting the pointer on it slides the tray along
 * until it's moved away, and a click jumps a trayful. Hidden at the tray's end, and on touch
 * screens, where a swipe does it.
 */
function TrayArrow({
  tray,
  direction,
  count,
}: {
  tray: RefObject<HTMLDivElement | null>;
  direction: -1 | 1;
  /** Pieces in the tray, so the arrow shows again as the tray changes. */
  count: number;
}) {
  const [more, setMore] = useState(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const el = tray.current;
    if (!el) return;
    const check = () =>
      setMore(
        direction < 0 ? el.scrollLeft > 1 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      );
    check();
    el.addEventListener("scroll", check, { passive: true });
    const resized = new ResizeObserver(check);
    resized.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      resized.disconnect();
    };
  }, [tray, direction, count]);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => stop, []);

  const slide = () => {
    stop();
    let last = performance.now();
    const step = (time: number) => {
      const el = tray.current;
      if (!el) return;
      el.scrollLeft += (direction * SLIDE_SPEED * (time - last)) / 1000;
      last = time;
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  return (
    <button
      type="button"
      className={`tray-arrow ${direction < 0 ? "left" : "right"}`}
      aria-label={direction < 0 ? "Slide the tray left" : "Slide the tray right"}
      hidden={!more}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") slide();
      }}
      onPointerLeave={stop}
      onClick={() => {
        const el = tray.current;
        el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
      }}
    >
      <Icon name={direction < 0 ? "chevronLeft" : "chevronRight"} size={22} stroke={2.4} />
    </button>
  );
}
