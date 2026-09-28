import { createRoomState, joinRoom, type RoomState } from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { liveRoomOf } from "./liveRooms";

const T0 = 1_700_000_000_000;

function join(state: RoomState, nickname: string, id: string): RoomState {
  const result = joinRoom(state, { nickname }, new Set(), T0, () => ({
    id,
    sessionToken: `token-${id}`,
  }));
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("the admin rooms list", () => {
  it("shows the game, who's in and who's connected", () => {
    const room = join(join(createRoomState("ABC234", T0), "Ada", "p1"), "Tolu", "p2");
    expect(liveRoomOf(room, new Set(["p2"]))).toEqual({
      code: "ABC234",
      game: "quiz",
      topic: "bible",
      difficulty: "easy",
      questions: 10,
      phase: "lobby",
      players: 2,
      online: 1,
      host: "Ada",
      nicknames: ["Ada", "Tolu"],
      createdAt: T0,
    });
  });
});
