import { describe, expect, it } from "vitest";
import { DEFAULT_QUIZ_SETTINGS } from "./games/quiz/settings";
import {
  DISCONNECTED_PLAYER_TTL_MS,
  HOST_GRACE_MS,
  MAX_PLAYERS,
  ROOM_IDLE_TTL_MS,
  createRoomState,
  isExpired,
  joinRoom,
  leaveRoom,
  markDisconnected,
  nextDeadline,
  settle,
  toSnapshot,
  type ConnectedIds,
  type RoomState,
} from "./room";

const T0 = 1_000_000;

function ids() {
  let n = 0;
  return () => {
    n++;
    return { id: `p${n}`, sessionToken: `token${n}` };
  };
}

/** Joins each nickname in order, all staying connected. */
function roomWith(...nicknames: string[]): { state: RoomState; connected: Set<string> } {
  const newIds = ids();
  let state = createRoomState("ABCDEF", T0);
  const connected = new Set<string>();
  nicknames.forEach((nickname, i) => {
    const result = joinRoom(state, { nickname }, connected, T0 + i, newIds);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    connected.add(result.player.id);
  });
  return { state, connected };
}

function join(state: RoomState, nickname: string, connected: ConnectedIds = new Set()) {
  return joinRoom(state, { nickname }, connected, T0, () => ({ id: "new", sessionToken: "new" }));
}

describe("joinRoom", () => {
  it("makes the first player the host", () => {
    const { state } = roomWith("Ada");
    expect(state.hostId).toBe("p1");
    expect(state.players.map((p) => p.nickname)).toEqual(["Ada"]);
  });

  it("keeps the first player as host when others join", () => {
    const { state } = roomWith("Ada", "Tolu", "Sarah");
    expect(state.hostId).toBe("p1");
    expect(state.players).toHaveLength(3);
  });

  it("tidies nicknames", () => {
    const { state } = roomWith("  Ada \n  Lovelace ");
    expect(state.players[0]?.nickname).toBe("Ada Lovelace");
  });

  it("rejects empty and over-long nicknames", () => {
    const { state } = roomWith();
    expect(join(state, "   ")).toEqual({ ok: false, error: "nickname_invalid" });
    expect(join(state, "x".repeat(21))).toEqual({ ok: false, error: "nickname_invalid" });
  });

  it("counts emoji as single characters", () => {
    const { state } = roomWith();
    expect(join(state, "🦉".repeat(20)).ok).toBe(true);
  });

  it("rejects a nickname already in the room, ignoring case", () => {
    const { state, connected } = roomWith("Ada");
    expect(join(state, "ada", connected)).toEqual({ ok: false, error: "nickname_taken" });
  });

  it("rejects players once the room is full", () => {
    const names = Array.from({ length: MAX_PLAYERS }, (_, i) => `Player ${i}`);
    const { state, connected } = roomWith(...names);
    expect(join(state, "One more", connected)).toEqual({ ok: false, error: "room_full" });
  });

  it("restores the same player when rejoining with a session token", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    connected.delete("p2");
    const result = joinRoom(
      state,
      { nickname: "ignored", sessionToken: "token2" },
      connected,
      T0 + 50,
      ids(),
    );
    expect(result.ok && result.rejoined).toBe(true);
    if (!result.ok) return;
    expect(result.player.id).toBe("p2");
    expect(result.player.nickname).toBe("Tolu");
    expect(result.state.players).toHaveLength(2);
  });

  it("treats an unknown session token as a new player", () => {
    const { state, connected } = roomWith("Ada");
    const result = joinRoom(
      state,
      { nickname: "Tolu", sessionToken: "stale" },
      connected,
      T0,
      ids(),
    );
    expect(result.ok && !result.rejoined).toBe(true);
  });
});

describe("leaveRoom", () => {
  it("hands the host role to the longest-connected player", () => {
    const { state, connected } = roomWith("Ada", "Tolu", "Sarah");
    const next = leaveRoom(state, "p1", connected, T0 + 100);
    expect(next.players.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(next.hostId).toBe("p2");
  });

  it("skips disconnected players when choosing a new host", () => {
    const { state, connected } = roomWith("Ada", "Tolu", "Sarah");
    connected.delete("p2");
    expect(leaveRoom(state, "p1", connected, T0 + 100).hostId).toBe("p3");
  });

  it("leaves the room without a host when the last player leaves", () => {
    const { state, connected } = roomWith("Ada");
    expect(leaveRoom(state, "p1", connected, T0 + 100).hostId).toBeNull();
  });
});

describe("host handover after a disconnect", () => {
  it("keeps the host during the grace period", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    const next = markDisconnected(state, "p1", connected, T0 + 1000);
    connected.delete("p1");
    expect(settle(next, connected, T0 + 1000 + HOST_GRACE_MS - 1).hostId).toBe("p1");
  });

  it("hands over once the grace period ends", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    const next = markDisconnected(state, "p1", connected, T0 + 1000);
    connected.delete("p1");
    expect(settle(next, connected, T0 + 1000 + HOST_GRACE_MS).hostId).toBe("p2");
  });

  it("keeps an absent host when nobody else is connected", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    let next = markDisconnected(state, "p2", connected, T0 + 1000);
    connected.delete("p2");
    next = markDisconnected(next, "p1", connected, T0 + 1000);
    connected.delete("p1");
    expect(settle(next, connected, T0 + 1000 + HOST_GRACE_MS * 2).hostId).toBe("p1");
  });
});

describe("removing players who don't come back", () => {
  it("keeps a disconnected player until the time limit", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    const next = markDisconnected(state, "p2", connected, T0 + 1000);
    connected.delete("p2");
    const later = settle(next, connected, T0 + 1000 + DISCONNECTED_PLAYER_TTL_MS - 1);
    expect(later.players).toHaveLength(2);
    const expired = settle(next, connected, T0 + 1000 + DISCONNECTED_PLAYER_TTL_MS);
    expect(expired.players.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("nextDeadline", () => {
  it("is null while everyone is connected", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    expect(nextDeadline(state, connected)).toBeNull();
  });

  it("is the host grace period when the host drops", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    const next = markDisconnected(state, "p1", connected, T0 + 1000);
    connected.delete("p1");
    expect(nextDeadline(next, connected)).toBe(T0 + 1000 + HOST_GRACE_MS);
  });

  it("is the room expiry once nobody is connected", () => {
    const { state, connected } = roomWith("Ada");
    const next = markDisconnected(state, "p1", connected, T0 + 1000);
    expect(nextDeadline(next, new Set())).toBe(T0 + 1000 + DISCONNECTED_PLAYER_TTL_MS);
    const empty = leaveRoom(state, "p1", connected, T0 + 1000);
    expect(nextDeadline(empty, new Set())).toBe(T0 + 1000 + ROOM_IDLE_TTL_MS);
  });
});

describe("isExpired", () => {
  it("expires an empty room after the idle time", () => {
    const state = createRoomState("ABCDEF", T0);
    expect(isExpired(state, new Set(), T0 + ROOM_IDLE_TTL_MS - 1)).toBe(false);
    expect(isExpired(state, new Set(), T0 + ROOM_IDLE_TTL_MS)).toBe(true);
  });

  it("never expires while someone is connected", () => {
    const { state, connected } = roomWith("Ada");
    expect(isExpired(state, connected, T0 + ROOM_IDLE_TTL_MS * 10)).toBe(false);
  });
});

describe("toSnapshot", () => {
  it("includes presence but never session tokens", () => {
    const { state, connected } = roomWith("Ada", "Tolu");
    connected.delete("p2");
    const snapshot = toSnapshot(state, connected);
    expect(snapshot).toEqual({
      code: "ABCDEF",
      hostId: "p1",
      players: [
        { id: "p1", nickname: "Ada", connected: true },
        { id: "p2", nickname: "Tolu", connected: false },
      ],
      phase: "lobby",
      game: { id: "quiz", settings: DEFAULT_QUIZ_SETTINGS },
    });
    expect(JSON.stringify(snapshot)).not.toContain("token");
  });
});
