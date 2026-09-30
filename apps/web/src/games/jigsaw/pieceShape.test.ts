import { describe, expect, it } from "vitest";
import { KNOB_REACH, PIECE_SIZE, pieceShapes } from "./pieceShape";

/** Every point in a path, as [x, y]. */
const points = (d: string) =>
  [...d.matchAll(/-?\d+(?:\.\d+)?/g)]
    .map((m) => Number(m[0]))
    .reduce<number[][]>((all, v, i) => (i % 2 ? (all.at(-1)!.push(v), all) : [...all, [v]]), []);

/** The points on one side of a piece: those beyond, or near, that side of its square. */
const onSide = (d: string, side: "top" | "right" | "bottom" | "left") =>
  points(d).filter(([x, y]) =>
    side === "top"
      ? y! < 0
      : side === "bottom"
        ? y! > PIECE_SIZE
        : side === "left"
          ? x! < 0
          : x! > PIECE_SIZE,
  );

describe("pieceShapes", () => {
  it("gives every piece a closed outline", () => {
    const shapes = pieceShapes(4, 4, "crew");
    expect(shapes).toHaveLength(16);
    for (const d of shapes) expect(d).toMatch(/^M0 0C.*Z$/);
  });

  it("keeps the puzzle's outside edges straight and knobs within reach, any shape of grid", () => {
    for (const [cols, rows] of [
      [5, 5],
      [12, 8],
      [7, 14],
    ] as const) {
      const shapes = pieceShapes(cols, rows, "crew");
      expect(shapes).toHaveLength(cols * rows);
      shapes.forEach((d, piece) => {
        const row = Math.floor(piece / cols);
        const col = piece % cols;
        if (row === 0) expect(onSide(d, "top")).toEqual([]);
        if (row === rows - 1) expect(onSide(d, "bottom")).toEqual([]);
        if (col === 0) expect(onSide(d, "left")).toEqual([]);
        if (col === cols - 1) expect(onSide(d, "right")).toEqual([]);
        for (const [x, y] of points(d)) {
          expect(x).toBeGreaterThanOrEqual(-KNOB_REACH);
          expect(x).toBeLessThanOrEqual(PIECE_SIZE + KNOB_REACH);
          expect(y).toBeGreaterThanOrEqual(-KNOB_REACH);
          expect(y).toBeLessThanOrEqual(PIECE_SIZE + KNOB_REACH);
        }
      });
    }
  });

  it("gives each inside edge a knob on one piece and the matching hole on the other", () => {
    const side = 4;
    const shapes = pieceShapes(side, side, "lion-cub");
    for (let piece = 0; piece < side * side; piece++) {
      const col = piece % side;
      if (col < side - 1) {
        // A knob out of this piece's right side is a hole in its neighbour's left, and back.
        const out = onSide(shapes[piece]!, "right").length > 0;
        const into = onSide(shapes[piece + 1]!, "left").length > 0;
        expect(out).not.toBe(into);
      }
      if (piece + side < side * side) {
        const out = onSide(shapes[piece]!, "bottom").length > 0;
        const into = onSide(shapes[piece + side]!, "top").length > 0;
        expect(out).not.toBe(into);
      }
    }
  });

  it("cuts the same way for everyone, and differently for each picture", () => {
    expect(pieceShapes(4, 4, "crew")).toEqual(pieceShapes(4, 4, "crew"));
    expect(pieceShapes(4, 4, "crew")).not.toEqual(pieceShapes(4, 4, "lion-cub"));
  });
});
