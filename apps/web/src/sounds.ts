import { useSyncExternalStore } from "react";

/**
 * Game sounds, made in the browser with the Web Audio API: no files to download, and nothing
 * plays until the player has tapped something (browsers require that). Muting is remembered.
 */

export type Sound = "tick" | "go" | "correct" | "wrong" | "hurry" | "fanfare" | "join" | "place";

const MUTED_KEY = "whizard:muted";

let context: AudioContext | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Browsers only allow sound after a tap or key press, so the audio starts on the first one. */
function unlock() {
  if (typeof window === "undefined") return;
  const start = () => {
    try {
      context ??= new AudioContext();
      void context.resume();
    } catch {
      // No Web Audio: the game just stays quiet.
    }
  };
  window.addEventListener("pointerdown", start, { once: true, capture: true });
  window.addEventListener("keydown", start, { once: true, capture: true });
}
unlock();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {
    // Not remembered, but still muted for now.
  }
  for (const listener of listeners) listener();
}

export function useMuted(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => muted,
  );
}

interface Note {
  /** Hertz. */
  freq: number;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds. */
  length: number;
  type?: OscillatorType;
  gain?: number;
  /** Slide to this pitch over the note. */
  to?: number;
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

const SOUNDS: Record<Sound, Note[]> = {
  tick: [{ freq: 880, at: 0, length: 0.09, type: "sine", gain: 0.25 }],
  go: [{ freq: 1320, at: 0, length: 0.22, type: "sine", gain: 0.3 }],
  correct: [
    { freq: E5, at: 0, length: 0.12, type: "triangle", gain: 0.35 },
    { freq: C6, at: 0.1, length: 0.22, type: "triangle", gain: 0.35 },
  ],
  wrong: [{ freq: 240, at: 0, length: 0.32, type: "square", gain: 0.12, to: 150 }],
  hurry: [{ freq: 1200, at: 0, length: 0.05, type: "square", gain: 0.06 }],
  fanfare: [
    { freq: C5, at: 0, length: 0.14, type: "triangle", gain: 0.3 },
    { freq: E5, at: 0.13, length: 0.14, type: "triangle", gain: 0.3 },
    { freq: G5, at: 0.26, length: 0.14, type: "triangle", gain: 0.3 },
    { freq: C6, at: 0.39, length: 0.45, type: "triangle", gain: 0.35 },
  ],
  join: [{ freq: 700, at: 0, length: 0.1, type: "sine", gain: 0.2, to: 1000 }],
  /** A jigsaw piece clicking into its place. */
  place: [{ freq: 620, at: 0, length: 0.12, type: "sine", gain: 0.16, to: 930 }],
};

export function play(sound: Sound): void {
  if (muted || !context || context.state !== "running") return;
  const start = context.currentTime + 0.01;
  for (const note of SOUNDS[sound]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, start + note.at);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.length);
    // A quick fade in and out, so notes don't click.
    const peak = note.gain ?? 0.25;
    gain.gain.setValueAtTime(0.0001, start + note.at);
    gain.gain.exponentialRampToValueAtTime(peak, start + note.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
    osc.connect(gain).connect(context.destination);
    osc.start(start + note.at);
    osc.stop(start + note.at + note.length + 0.02);
  }
}
