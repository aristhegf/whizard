import type { QuizDifficulty } from "./settings";

export const BASE_POINTS: Record<QuizDifficulty, number> = {
  easy: 1000,
  medium: 1250,
  hard: 1500,
};

/**
 * How much faster than the server's own measurement a client may claim to have answered.
 * Covers the network delay on a slow connection without allowing impossible times.
 */
export const NETWORK_ALLOWANCE_MS = 1500;

/**
 * The answer time we credit. The client's measurement is fairest (it excludes network delay),
 * so we use it whenever it's within reach of what the server saw.
 */
export function creditedElapsed(clientMs: number, serverMs: number, limitMs: number): number {
  const server = Math.min(Math.max(serverMs, 0), limitMs);
  const lowest = Math.max(0, server - NETWORK_ALLOWANCE_MS);
  return Math.min(Math.max(clientMs, lowest), server);
}

/** 50% to 100% of the base points for a correct answer, depending on speed. */
export function pointsFor(
  correct: boolean,
  elapsedMs: number,
  limitMs: number,
  difficulty: QuizDifficulty,
): number {
  if (!correct) return 0;
  const fraction = Math.min(Math.max(elapsedMs / limitMs, 0), 1);
  return Math.round(BASE_POINTS[difficulty] * (0.5 + 0.5 * (1 - fraction)));
}
