import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

/** How far down, or how fast, a drag has to go to close the sheet rather than spring back. */
const CLOSE_DISTANCE = 110;
const CLOSE_SPEED = 0.6; // px per ms

/**
 * A panel that slides up from the bottom of the screen. It closes by dragging its top down,
 * tapping outside it, the back gesture or Escape, always sliding away rather than vanishing.
 */
export function BottomSheet({
  labelledBy,
  className,
  onClose,
  header,
  children,
}: {
  labelledBy: string;
  className?: string;
  onClose: () => void;
  /** The top of the sheet, which is also what's dragged. Gets `close`, which slides it away. */
  header: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const [settling, setSettling] = useState(false);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const last = useRef({ y: 0, t: 0 });

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const close = () => {
    if (closing) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else setClosing(true);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (closing || (event.pointerType === "mouse" && event.button !== 0)) return;
    // Buttons in the header keep their taps.
    if ((event.target as Element).closest("button, a")) return;
    start.current = { y: event.clientY, t: event.timeStamp, id: event.pointerId };
    last.current = { y: event.clientY, t: event.timeStamp };
    setSettling(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (start.current?.id !== event.pointerId) return;
    last.current = { y: event.clientY, t: event.timeStamp };
    const dy = event.clientY - start.current.y;
    // Pulling up gives a little, then stops: the sheet is already all the way open.
    setDrag(dy > 0 ? dy : dy / 6);
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const from = start.current;
    if (from?.id !== event.pointerId) return;
    start.current = null;
    const dy = event.clientY - from.y;
    const recent = Math.max(1, event.timeStamp - last.current.t);
    const speed = (event.clientY - last.current.y) / recent;
    if (dy > CLOSE_DISTANCE || (dy > 20 && speed > CLOSE_SPEED)) {
      close();
    } else {
      setSettling(true);
      setDrag(0);
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      className={`sheet${closing ? " closing" : ""}${settling ? " settling" : ""} ${className ?? ""}`}
      style={{ "--drag": `${drag}px` } as CSSProperties}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // A tap on the dimmed backdrop closes it.
        if (event.target === dialog.current) close();
      }}
      onAnimationEnd={(event) => {
        if (closing && event.target === dialog.current) onClose();
      }}
      onTransitionEnd={() => setSettling(false)}
    >
      <div
        className="sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="sheet-handle" aria-hidden="true" />
        {header(close)}
      </div>
      {children}
    </dialog>
  );
}
