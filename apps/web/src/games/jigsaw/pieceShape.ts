/**
 * Jigsaw piece outlines: each inside edge has a knob on one side and the matching hole on the
 * other, so a piece only fits its own place. Pieces are drawn on a 100-unit square; knobs stick
 * out up to KNOB_REACH beyond it.
 */

export const PIECE_SIZE = 100;
/** How far a knob reaches past its piece's square, in the same units. */
export const KNOB_REACH = 32;

type Point = readonly [number, number];

/**
 * One knob along an edge from (0, 0) to (1, 0), bulging towards +y: a cubic Bézier chain as
 * the control points after the start, three to a curve. The straight runs are curves too.
 */
const KNOB: Point[] = [
  [0.36, 0],
  [0.36, 0],
  [0.36, 0],
  [0.41, 0],
  [0.44, 0.03],
  [0.43, 0.08],
  [0.42, 0.13],
  [0.36, 0.15],
  [0.37, 0.21],
  [0.38, 0.28],
  [0.46, 0.3],
  [0.5, 0.3],
  [0.54, 0.3],
  [0.62, 0.28],
  [0.63, 0.21],
  [0.64, 0.15],
  [0.58, 0.13],
  [0.57, 0.08],
  [0.56, 0.03],
  [0.59, 0],
  [0.64, 0],
  [1, 0],
  [1, 0],
  [1, 0],
];

interface Edge {
  /** 1: the knob points down (or right); -1: up (or left). */
  dir: 1 | -1;
  /** Moves the knob along the edge, so the pieces don't all look alike. */
  shift: number;
  scale: number;
}

/** A small seeded random number generator (mulberry32), so every player gets the same cut. */
function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The points of an edge from `from` to `to`, knob towards `normal` (or straight, for none). */
function edgePoints(from: Point, to: Point, normal: Point, edge: Edge | null): Point[] {
  if (!edge) return [from, from, to, to];
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const at = ([u, w]: Point): Point => {
    // Only the knob moves and resizes; the ends of the edge stay at the corners.
    const knob = u > 0 && u < 1;
    const along = knob ? 0.5 + edge.shift + (u - 0.5) * edge.scale : u;
    const out = (knob ? w * edge.scale : w) * edge.dir * length;
    return [
      from[0] + (to[0] - from[0]) * along + normal[0] * out,
      from[1] + (to[1] - from[1]) * along + normal[1] * out,
    ];
  };
  return [from, ...KNOB.map(at)];
}

/**
 * The outline of every piece for a `side` × `side` puzzle, as SVG path data on its own
 * 100-unit square, indexed by piece. `key` (the picture) picks the cut.
 */
export function pieceShapes(side: number, key: string): string[] {
  const random = rngFrom(hash(`${key}:${side}`));
  const newEdge = (): Edge => ({
    dir: random() < 0.5 ? 1 : -1,
    shift: (random() - 0.5) * 0.1,
    scale: 0.88 + random() * 0.16,
  });
  // across[r][c]: the edge under piece (r, c); down[r][c]: the edge to its right.
  const across = Array.from({ length: side - 1 }, () => Array.from({ length: side }, newEdge));
  const down = Array.from({ length: side }, () => Array.from({ length: side - 1 }, newEdge));

  const S = PIECE_SIZE;
  return Array.from({ length: side * side }, (_, piece) => {
    const row = Math.floor(piece / side);
    const col = piece % side;
    // Clockwise from the top left. The bottom and left edges are the ones shared with the
    // pieces below and to the left, walked backwards, so both pieces trace the same curve.
    const top = edgePoints([0, 0], [S, 0], [0, 1], row > 0 ? across[row - 1]![col]! : null);
    const right = edgePoints([S, 0], [S, S], [1, 0], col < side - 1 ? down[row]![col]! : null);
    const bottom = edgePoints([0, S], [S, S], [0, 1], row < side - 1 ? across[row]![col]! : null);
    const left = edgePoints([0, 0], [0, S], [1, 0], col > 0 ? down[row]![col - 1]! : null);
    const outline = [
      ...top,
      ...right.slice(1),
      ...[...bottom].reverse().slice(1),
      ...[...left].reverse().slice(1),
    ];
    const n = (v: number) => Math.round(v * 10) / 10;
    let d = `M${n(outline[0]![0])} ${n(outline[0]![1])}`;
    for (let i = 1; i + 2 < outline.length; i += 3) {
      const [a, b, c] = [outline[i]!, outline[i + 1]!, outline[i + 2]!];
      d += `C${n(a[0])} ${n(a[1])} ${n(b[0])} ${n(b[1])} ${n(c[0])} ${n(c[1])}`;
    }
    return `${d}Z`;
  });
}
