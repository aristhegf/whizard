import { PIECE_SIZE } from "./pieceShape";

const U = PIECE_SIZE;

export interface Point {
  x: number;
  y: number;
}

/** Which stuck-together cluster a loose piece belongs to (itself when alone). */
export type Groups = Record<number, number>;
export const gidOf = (groups: Groups, piece: number): number => groups[piece] ?? piece;

export const colOf = (piece: number, cols: number): number => piece % cols;
export const rowOf = (piece: number, cols: number): number => Math.floor(piece / cols);
export const homeOf = (piece: number, cols: number): Point => ({
  x: colOf(piece, cols) * U,
  y: rowOf(piece, cols) * U,
});

/** Grid neighbours: share one side. Only those can snap together. */
export const areNeighbors = (a: number, b: number, cols: number): boolean => {
  const dx = Math.abs(colOf(a, cols) - colOf(b, cols));
  const dy = Math.abs(rowOf(a, cols) - rowOf(b, cols));
  return dx + dy === 1;
};

/** Where `target` should be if `anchor` is at `anchorAt` and the two belong together. */
export const expectedPos = (
  anchorAt: Point,
  anchor: number,
  target: number,
  cols: number,
): Point => {
  const ha = homeOf(anchor, cols);
  const ht = homeOf(target, cols);
  return { x: anchorAt.x + (ht.x - ha.x), y: anchorAt.y + (ht.y - ha.y) };
};

export const withinSnap = (at: Point, want: Point, tolerance: number): boolean =>
  Math.abs(at.x - want.x) < tolerance && Math.abs(at.y - want.y) < tolerance;
