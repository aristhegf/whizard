import { describe, expect, it } from "vitest";
import { randomToken } from "./ids";

describe("randomToken", () => {
  it("encodes bytes as URL-safe base64 without padding", () => {
    const bytes = [0xfb, 0xff, 0xbf];
    expect(randomToken(3, (buffer) => (buffer.set(bytes), buffer))).toBe("-_-_");
  });

  it("produces URL-safe tokens of the expected length", () => {
    const token = randomToken(24);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => randomToken(16)));
    expect(tokens.size).toBe(1000);
  });
});
