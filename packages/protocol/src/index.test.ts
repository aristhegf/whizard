import { describe, expect, it } from "vitest";
import { encode, MAX_MESSAGE_BYTES, parseClientMessage, parseServerMessage } from "./index";

describe("parseClientMessage", () => {
  it("accepts a valid ping", () => {
    expect(parseClientMessage(encode({ type: "ping", t: 12.5 }))).toEqual({
      type: "ping",
      t: 12.5,
    });
  });

  it("rejects malformed JSON", () => {
    expect(parseClientMessage("{not json")).toBeNull();
  });

  it("rejects unknown message types", () => {
    expect(parseClientMessage(JSON.stringify({ type: "hack" }))).toBeNull();
  });

  it("rejects messages with missing fields", () => {
    expect(parseClientMessage(JSON.stringify({ type: "ping" }))).toBeNull();
  });

  it("rejects binary frames", () => {
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it("rejects oversized messages", () => {
    const padded = JSON.stringify({ type: "ping", t: 1, pad: "x".repeat(MAX_MESSAGE_BYTES) });
    expect(parseClientMessage(padded)).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("round-trips a pong", () => {
    const pong = { type: "pong", t: 1, serverTime: 2 } as const;
    expect(parseServerMessage(encode(pong))).toEqual(pong);
  });
});
