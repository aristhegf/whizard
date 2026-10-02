import { describe, expect, it } from "vitest";
import { areNeighbors, colOf, expectedPos, gidOf, homeOf, rowOf, withinSnap } from "./clusters";

describe("jigsaw clusters", () => {
  it("maps pieces to grid spots on a 4-wide board", () => {
    expect([colOf(0, 4), rowOf(0, 4)]).toEqual([0, 0]);
    expect([colOf(5, 4), rowOf(5, 4)]).toEqual([1, 1]);
    expect(homeOf(5, 4)).toEqual({ x: 100, y: 100 });
  });

  it("only side neighbours can snap", () => {
    expect(areNeighbors(0, 1, 4)).toBe(true);
    expect(areNeighbors(0, 4, 4)).toBe(true);
    expect(areNeighbors(0, 5, 4)).toBe(false);
    expect(areNeighbors(0, 2, 4)).toBe(false);
    expect(areNeighbors(3, 4, 4)).toBe(false);
  });

  it("expects a neighbour one piece away, and snaps within tolerance", () => {
    expect(expectedPos({ x: 10, y: 20 }, 0, 1, 4)).toEqual({ x: 110, y: 20 });
    expect(expectedPos({ x: 10, y: 20 }, 0, 4, 4)).toEqual({ x: 10, y: 120 });
    expect(withinSnap({ x: 112, y: 21 }, { x: 110, y: 20 }, 24)).toBe(true);
    expect(withinSnap({ x: 140, y: 20 }, { x: 110, y: 20 }, 24)).toBe(false);
  });

  it("leaves singletons in their own group", () => {
    expect(gidOf({}, 7)).toBe(7);
    expect(gidOf({ 7: 3 }, 7)).toBe(3);
  });
});
