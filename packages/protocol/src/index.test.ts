import { describe, expect, it } from "vitest";
import {
  encode,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ServerMessage,
} from "./index";

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

describe("join messages", () => {
  it("accepts a first join and a rejoin", () => {
    const first = { type: "join", protocolVersion: PROTOCOL_VERSION, nickname: "Ada" } as const;
    expect(parseClientMessage(encode(first))).toEqual(first);
    const rejoin = { ...first, sessionToken: "abc" };
    expect(parseClientMessage(encode(rejoin))).toEqual(rejoin);
  });

  it("requires a protocol version", () => {
    expect(parseClientMessage(JSON.stringify({ type: "join", nickname: "Ada" }))).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("round-trips a pong", () => {
    const pong = { type: "pong", t: 1, serverTime: 2 } as const;
    expect(parseServerMessage(encode(pong))).toEqual(pong);
  });

  it("round-trips a welcome", () => {
    const welcome: ServerMessage = {
      type: "welcome",
      playerId: "p1",
      sessionToken: "secret",
      room: {
        code: "ABCDEF",
        hostId: "p1",
        players: [{ id: "p1", nickname: "Ada", connected: true }],
      },
    };
    expect(parseServerMessage(encode(welcome))).toEqual(welcome);
  });

  it("rejects unknown error codes", () => {
    expect(
      parseServerMessage(JSON.stringify({ type: "error", code: "mystery", message: "?" })),
    ).toBeNull();
  });
});
