import { drawContent } from "@whizard/content";
import {
  createRoomState,
  DEFAULT_IMPOSTOR_SETTINGS,
  defaultGameConfig,
  QUIZ_CATEGORIES,
  startGame,
  type ImpostorState,
  type RoomState,
} from "@whizard/game-core";
import { describe, expect, it } from "vitest";
import { addMonths } from "./adminPayments";
import { blockedTypedText, newRoomSettings } from "./gameRules";
import { DEFAULT_SETTINGS } from "./settings";

const room = () => createRoomState("ABC234", 0);
/** The live catalogue as a room-create sees it: the shipped twelve. */
const TOPIC_IDS = QUIZ_CATEGORIES.map((category) => category.id);

describe("new room settings", () => {
  it("start from the admins' defaults, with the room's own choice on top", () => {
    const site = { ...DEFAULT_SETTINGS, quizDefaults: { difficulty: "medium", count: 15 } };
    expect(newRoomSettings(room(), site, undefined, TOPIC_IDS)).toMatchObject({
      category: "bible",
      difficulty: "medium",
      count: 15,
    });
    expect(newRoomSettings(room(), site, { category: "music" }, TOPIC_IDS)).toMatchObject({
      category: "music",
      difficulty: "medium",
    });
  });

  it("ignore defaults that don't fit, and swap a topic that's turned off", () => {
    const site = {
      ...DEFAULT_SETTINGS,
      quizDefaults: { count: 7 },
      topicsOff: ["bible", "music"],
    };
    const settings = newRoomSettings(room(), site, { category: "music" }, TOPIC_IDS) as {
      category: string;
      count: number;
    };
    expect(settings.count).toBe(10);
    expect(["bible", "music"]).not.toContain(settings.category);
  });

  it("swap a topic the catalogue doesn't hold for one that's in it and on", () => {
    const site = { ...DEFAULT_SETTINGS, topicsOff: ["bible"] };
    const settings = newRoomSettings(room(), site, { category: "nope" }, TOPIC_IDS) as {
      category: string;
    };
    expect(settings.category).toBe("quran");
    // No topic anywhere: the shipped default is what's left, dead catalogue or not.
    const none = newRoomSettings(room(), site, { category: "nope" }, []) as {
      category: string;
    };
    expect(none.category).toBe("bible");
  });

  it("leave the quiz defaults out of other games", () => {
    const site = { ...DEFAULT_SETTINGS, quizDefaults: { count: 15 } };
    const wordRush = { ...room(), game: defaultGameConfig("word-rush") };
    const defaults = { mode: "speed", level: "auto", rounds: 10, timeLimitSeconds: 30 };
    expect(newRoomSettings(wordRush, site, undefined, TOPIC_IDS)).toEqual(defaults);
    expect(newRoomSettings(wordRush, site, { rounds: 5, colour: "red" }, TOPIC_IDS)).toEqual({
      ...defaults,
      rounds: 5,
    });
  });
});

describe("typed text in games", () => {
  const BLOCKED = [{ word: "rudeword", anywhere: false }];
  const players = ["ada", "bola", "chidi", "dayo"];

  /** A room running a game of the given kind, with everyone connected. */
  function running(game: "impostor" | "quiz"): RoomState {
    const room: RoomState = {
      ...createRoomState("ABC234", 0, defaultGameConfig(game)),
      hostId: "ada",
      players: players.map((id) => ({
        id,
        nickname: id,
        sessionToken: `${id}-token`,
        joinedAt: 0,
        lastSeenAt: 0,
        account: null,
        guestId: null,
        avatar: null,
      })),
    };
    const result = startGame(room, "ada", new Set(players), 0, 5, (request, seed) =>
      drawContent(request, seed),
    );
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }

  it("refuse an Impostor clue with a blocked word, the way nicknames are", () => {
    const room = running("impostor");
    const game = room.session!.state as ImpostorState;
    expect(game.settings).toEqual(DEFAULT_IMPOSTOR_SETTINGS);
    expect(game.rounds[0]!.word).toBeTruthy();
    const clue = (text: string) => blockedTypedText(room, { type: "clue", text }, BLOCKED);
    expect(clue("rudeword")).toBe("rudeword");
    expect(clue(" RUDEWORD ")).toBe("rudeword");
    // Look-alikes and stretched letters too.
    expect(clue("rud3w0rd")).toBe("rudeword");
    expect(clue("ruuudeword")).toBe("rudeword");
    expect(clue("sunny")).toBeNull();
    expect(blockedTypedText(room, { type: "vote", playerId: "bola" }, BLOCKED)).toBeNull();
    expect(blockedTypedText(room, { type: "clue" }, BLOCKED)).toBeNull();
  });

  it("let other games' actions through untouched", () => {
    expect(blockedTypedText(running("quiz"), { type: "clue", text: "rudeword" }, BLOCKED)).toBe(
      null,
    );
    expect(blockedTypedText(room(), { type: "clue", text: "rudeword" }, BLOCKED)).toBeNull();
  });
});

describe("Pro lengths", () => {
  it("adds calendar months, keeping to the end of shorter months", () => {
    const day = (s: string) => Date.parse(`${s}T12:00:00Z`);
    expect(addMonths(day("2026-01-15"), 1)).toBe(day("2026-02-15"));
    expect(addMonths(day("2026-01-31"), 1)).toBe(day("2026-02-28"));
    expect(addMonths(day("2028-01-31"), 1)).toBe(day("2028-02-29"));
    expect(addMonths(day("2026-11-30"), 3)).toBe(day("2027-02-28"));
    expect(addMonths(day("2026-03-10"), 12)).toBe(day("2027-03-10"));
  });
});
