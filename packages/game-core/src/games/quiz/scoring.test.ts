import { describe, expect, it } from "vitest";
import { NETWORK_ALLOWANCE_MS, creditedElapsed, pointsFor } from "./scoring";

describe("creditedElapsed", () => {
  it("uses the client's time when it's within the network allowance", () => {
    expect(creditedElapsed(4200, 4600, 20_000)).toBe(4200);
  });

  it("doesn't let a client claim an impossibly fast answer", () => {
    expect(creditedElapsed(100, 5000, 20_000)).toBe(5000 - NETWORK_ALLOWANCE_MS);
  });

  it("never credits more time than the server saw", () => {
    expect(creditedElapsed(9000, 5000, 20_000)).toBe(5000);
  });

  it("stays within zero and the time limit", () => {
    expect(creditedElapsed(0, -300, 20_000)).toBe(0);
    expect(creditedElapsed(25_000, 26_000, 20_000)).toBe(20_000);
  });
});

describe("pointsFor", () => {
  it("gives full points for an instant correct answer", () => {
    expect(pointsFor(true, 0, 20_000, "easy")).toBe(1000);
    expect(pointsFor(true, 0, 20_000, "hard")).toBe(1500);
  });

  it("gives half points for a correct answer at the buzzer", () => {
    expect(pointsFor(true, 20_000, 20_000, "medium")).toBe(625);
  });

  it("scales with speed in between", () => {
    expect(pointsFor(true, 5000, 20_000, "easy")).toBe(875);
  });

  it("gives nothing for a wrong answer", () => {
    expect(pointsFor(false, 0, 20_000, "hard")).toBe(0);
  });
});
