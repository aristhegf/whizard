import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "@/components/motion/tooltip";
import { hintSeen, markHintSeen } from "../storage";
import { Icon } from "./Icon";

const START_MS = 700;
const FIRST_MS = 5000;
const NEXT_MS = 4000;
const GAP_MS = 350;

interface Entry {
  id: string;
  el: HTMLElement;
  setOpen: (open: boolean) => void;
}

// The first-visit tour. A hint joins the queue once its heading is in view, and the queue plays
// one hint at a time, highest on the page first, so a page with several walks down it.
const queue: Entry[] = [];
let current: Entry | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let shown = 0;

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(playNext, ms);
}

function playNext() {
  queue.sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
  const entry = queue.shift();
  if (!entry) {
    current = null;
    timer = undefined;
    shown = 0;
    return;
  }
  current = entry;
  markHintSeen(entry.id);
  entry.setOpen(true);
  timer = setTimeout(
    () => {
      entry.setOpen(false);
      current = null;
      schedule(GAP_MS);
    },
    shown++ === 0 ? FIRST_MS : NEXT_MS,
  );
}

function enqueue(entry: Entry) {
  if (queue.includes(entry) || current === entry) return;
  queue.push(entry);
  if (!current && timer === undefined) schedule(START_MS);
}

function dequeue(entry: Entry) {
  const at = queue.indexOf(entry);
  if (at >= 0) queue.splice(at, 1);
  if (current === entry) {
    current = null;
    schedule(GAP_MS);
  }
}

/**
 * An (i) beside a heading that holds the heading's explanation, so the page stays short. It
 * opens by itself the first time a browser sees it, then on tap, hover or focus.
 */
export function HeadingHint({
  id,
  label,
  children,
}: {
  /** Remembers that this browser has seen it. */
  id: string;
  /** What the button says to a screen reader, e.g. "About quiz topics". */
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || hintSeen(id)) return;
    const entry: Entry = { id, el, setOpen };
    const observer = new IntersectionObserver(
      ([seen]) => {
        if (!seen?.isIntersecting) return;
        observer.disconnect();
        enqueue(entry);
      },
      { threshold: 1, rootMargin: "0px 0px -15% 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      dequeue(entry);
    };
  }, [id]);

  return (
    <Tooltip
      content={children}
      side="right"
      open={open}
      onOpenChange={setOpen}
      className="heading-hint-tip"
    >
      <button
        ref={ref}
        type="button"
        className={`heading-hint${open ? " is-open" : ""}`}
        aria-label={label}
      >
        <Icon name="info" size={16} stroke={2.2} />
      </button>
    </Tooltip>
  );
}
