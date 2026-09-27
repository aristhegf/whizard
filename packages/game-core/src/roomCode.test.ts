import { describe, expect, it } from "vitest";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  normalizeRoomCode,
} from "./roomCode";

describe("generateRoomCode", () => {
  it("produces codes of the right length from the allowed alphabet", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });

  it("never uses look-alike characters", () => {
    for (const char of "0O1IL") {
      expect(ROOM_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("skips bytes that would bias the distribution", () => {
    const biased = 255;
    const bytes = [biased, 0, biased, 1, 2, 3, 4, 5];
    let call = 0;
    const code = generateRoomCode((buffer) => {
      buffer.fill(0);
      if (call++ === 0) buffer.set(bytes.slice(0, buffer.length));
      return buffer;
    });
    expect(code).toBe([0, 1, 2, 3, 4, 5].map((i) => ROOM_CODE_ALPHABET[i]).join(""));
  });
});

describe("normalizeRoomCode", () => {
  it("trims whitespace and uppercases", () => {
    expect(normalizeRoomCode("  k7qx2m ")).toBe("K7QX2M");
  });

  it("rejects wrong lengths", () => {
    expect(normalizeRoomCode("K7QX2")).toBeNull();
    expect(normalizeRoomCode("K7QX2MM")).toBeNull();
  });

  it("rejects look-alike characters", () => {
    expect(normalizeRoomCode("K7QX20")).toBeNull();
    expect(normalizeRoomCode("K7QXIM")).toBeNull();
  });
});
