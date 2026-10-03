import { z } from "zod";
import { CUSTOM_AVATAR_MAX_LENGTH } from "./accounts";

export const PROTOCOL_VERSION = 10;

/** The most a player may send in one message. Server messages can be far bigger: a finished
 * game's review or a full lobby easily passes this, so they have their own, looser cap. */
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_SERVER_MESSAGE_BYTES = 1024 * 1024;

/** WebSocket close codes the client treats as final: it shows a message instead of reconnecting. */
export const CloseCode = {
  OutdatedClient: 4400,
  RoomNotFound: 4404,
  Replaced: 4409,
  RoomExpired: 4410,
  /** Closed by a Whizard admin. */
  RoomClosed: 4403,
  /** Ended by the room's own host, for everybody in it. */
  RoomEnded: 4405,
  /** This player was removed from the room by a Whizard admin. */
  Removed: 4406,
} as const;

export const FINAL_CLOSE_CODES: ReadonlySet<number> = new Set(Object.values(CloseCode));

export const ErrorCode = {
  BadMessage: "bad_message",
  NotJoined: "not_joined",
  OutdatedClient: "outdated_client",
  RoomNotFound: "room_not_found",
  RoomFull: "room_full",
  NicknameInvalid: "nickname_invalid",
  NicknameTaken: "nickname_taken",
  NotHost: "not_host",
  BadSettings: "bad_settings",
  NotEnoughPlayers: "not_enough_players",
  GameInProgress: "game_in_progress",
  NoGame: "no_game",
  NoContent: "no_content",
  BadAction: "bad_action",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const playerSnapshotSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  connected: z.boolean(),
  username: z.string().nullable(),
  avatar: z.string().nullable(),
});

export const roomSnapshotSchema = z.object({
  code: z.string(),
  hostId: z.string().nullable(),
  players: z.array(playerSnapshotSchema),
  phase: z.enum(["lobby", "playing", "finished"]),
  // Game settings and views are validated by each game's own schema in game-core.
  game: z.object({ id: z.string(), settings: z.unknown() }),
  settings: z.object({ maxPlayers: z.number().int(), lateJoin: z.boolean() }),
  /** Players who quit the current game and wait in the lobby for the next one. */
  sittingOut: z.array(z.string()),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    protocolVersion: z.number().int(),
    nickname: z.string().max(100),
    sessionToken: z.string().max(100).optional(),
    guestId: z.string().max(64).optional(),
    avatar: z.string().max(CUSTOM_AVATAR_MAX_LENGTH).optional(),
  }),
  z.object({ type: z.literal("leave") }),
  /** Host only: end the room for everybody, closing it for everyone in it. */
  z.object({ type: z.literal("endRoom") }),
  /** Change your own nickname or avatar between games. */
  z.object({
    type: z.literal("profile"),
    nickname: z.string().max(100),
    avatar: z.string().max(CUSTOM_AVATAR_MAX_LENGTH).optional(),
  }),
  z.object({ type: z.literal("ping"), t: z.number() }),
  z.object({ type: z.literal("chooseGame"), game: z.string().max(32) }),
  z.object({ type: z.literal("configure"), settings: z.unknown() }),
  z.object({
    type: z.literal("roomSettings"),
    settings: z
      .object({ maxPlayers: z.number().int().min(2).max(20), lateJoin: z.boolean() })
      .partial(),
  }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("action"), action: z.unknown() }),
  z.object({ type: z.literal("backToLobby") }),
  /** Quit the running game but stay in the room, for the next one. */
  z.object({ type: z.literal("quitGame") }),
  /** Go back into the running game after quitting it, with your score. */
  z.object({ type: z.literal("rejoinGame") }),
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    playerId: z.string(),
    sessionToken: z.string(),
    room: roomSnapshotSchema,
    serverTime: z.number(),
  }),
  z.object({ type: z.literal("room"), room: roomSnapshotSchema }),
  z.object({ type: z.literal("game"), view: z.unknown() }),
  z.object({ type: z.literal("pong"), t: z.number(), serverTime: z.number() }),
  z.object({
    type: z.literal("error"),
    code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

function parse<T>(schema: z.ZodType<T>, raw: unknown, maxBytes: number): T | null {
  if (typeof raw !== "string" || raw.length > maxBytes) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  return parse(clientMessageSchema, raw, MAX_MESSAGE_BYTES);
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  return parse(serverMessageSchema, raw, MAX_SERVER_MESSAGE_BYTES);
}

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

export * from "./accounts";
export * from "./presence";
export * from "./stats";
export * from "./reports";
export * from "./admin";
export * from "./moderation";
