import { shuffled, type Rng } from "../../random";
import { logicShape, type LogicSize } from "./settings";

// Grids for Logic: every row, column and box holds each number from 1 to the grid's size once.
// Cells are numbered left to right, top to bottom; 0 is an empty cell.

export interface LogicPuzzle {
  size: LogicSize;
  boxRows: number;
  boxCols: number;
  /** The clues: a number, or 0 for a cell to fill. */
  givens: number[];
  solution: number[];
}

/** The fewest clues a grid keeps, so the hard ones stay fair for a timed race. */
const MIN_GIVENS: Record<LogicSize, number> = { 4: 5, 6: 12, 9: 28 };

/** The cells that share a row, column or box with each cell. */
function peersOf(size: number, boxRows: number, boxCols: number): number[][] {
  return Array.from({ length: size * size }, (_, cell) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const top = row - (row % boxRows);
    const left = col - (col % boxCols);
    const peers = new Set<number>();
    for (let i = 0; i < size; i++) {
      peers.add(row * size + i);
      peers.add(i * size + col);
    }
    for (let r = top; r < top + boxRows; r++) {
      for (let c = left; c < left + boxCols; c++) peers.add(r * size + c);
    }
    peers.delete(cell);
    return [...peers];
  });
}

/** How many ways the grid can be finished, counting no further than `limit`. */
export function countSolutions(
  grid: readonly number[],
  size: number,
  boxRows: number,
  boxCols: number,
  limit = 2,
): number {
  const peers = peersOf(size, boxRows, boxCols);
  const cells = [...grid];
  const all = (1 << (size + 1)) - 2;
  let found = 0;

  const candidates = (cell: number) => {
    let used = 0;
    for (const p of peers[cell]!) used |= 1 << cells[p]!;
    return all & ~used;
  };

  const search = (): void => {
    // Fill the cell with the fewest choices first.
    let best = -1;
    let bestMask = 0;
    let bestCount = Infinity;
    for (let cell = 0; cell < cells.length; cell++) {
      if (cells[cell] !== 0) continue;
      const mask = candidates(cell);
      let count = 0;
      for (let m = mask; m; m &= m - 1) count++;
      if (count < bestCount) {
        best = cell;
        bestMask = mask;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    if (best === -1) {
      found++;
      return;
    }
    for (let n = 1; n <= size && found < limit; n++) {
      if (!(bestMask & (1 << n))) continue;
      cells[best] = n;
      search();
      cells[best] = 0;
    }
  };

  search();
  return found;
}

/** A full grid: a fixed pattern with its rows, columns, bands, stacks and numbers shuffled. */
function fullGrid(size: number, boxRows: number, boxCols: number, rng: Rng): number[] {
  const bandCount = size / boxRows;
  const stackCount = size / boxCols;
  const rows = shuffled([...Array(bandCount).keys()], rng).flatMap((band) =>
    shuffled([...Array(boxRows).keys()], rng).map((r) => band * boxRows + r),
  );
  const cols = shuffled([...Array(stackCount).keys()], rng).flatMap((stack) =>
    shuffled([...Array(boxCols).keys()], rng).map((c) => stack * boxCols + c),
  );
  const numbers = shuffled(
    Array.from({ length: size }, (_, i) => i + 1),
    rng,
  );
  // The pattern: each row shifts by a box's width, and each band by one.
  const pattern = (r: number, c: number) =>
    (boxCols * (r % boxRows) + Math.floor(r / boxRows) + c) % size;
  return rows.flatMap((r) => cols.map((c) => numbers[pattern(r, c)]!));
}

/** A puzzle with exactly one solution, made from the seed's random numbers. */
export function logicPuzzle(size: LogicSize, rng: Rng): LogicPuzzle {
  const { boxRows, boxCols } = logicShape(size);
  const solution = fullGrid(size, boxRows, boxCols, rng);
  const givens = [...solution];
  let left = givens.length;
  // Take clues away one at a time, keeping each only if the answer would stop being certain.
  for (const cell of shuffled([...givens.keys()], rng)) {
    if (left <= MIN_GIVENS[size]) break;
    const kept = givens[cell]!;
    givens[cell] = 0;
    if (countSolutions(givens, size, boxRows, boxCols) === 1) left--;
    else givens[cell] = kept;
  }
  return { size, boxRows, boxCols, givens, solution };
}
