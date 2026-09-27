import { z } from "zod";

export const PROTOCOL_VERSION = 2;

export const MAX_MESSAGE_BYTES = 4096;

/** WebSocket close codes the client treats as final: it shows a message instead of reconnecting. */
export const CloseCode = {
  OutdatedClient: 4400,
  RoomNotFound: 4404,
  Replaced: 4409,
  RoomExpired: 4410,
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
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const playerSnapshotSchema = z.object({
  id: z.string(),
  nickname: z.string(),
  connected: z.boolean(),
});

export const roomSnapshotSchema = z.object({
  code: z.string(),
  hostId: z.string().nullable(),
  players: z.array(playerSnapshotSchema),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    protocolVersion: z.number().int(),
    nickname: z.string().max(100),
    sessionToken: z.string().max(100).optional(),
  }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    playerId: z.string(),
    sessionToken: z.string(),
    room: roomSnapshotSchema,
  }),
  z.object({ type: z.literal("room"), room: roomSnapshotSchema }),
  z.object({ type: z.literal("pong"), t: z.number(), serverTime: z.number() }),
  z.object({
    type: z.literal("error"),
    code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

function parse<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return null;
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
  return parse(clientMessageSchema, raw);
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  return parse(serverMessageSchema, raw);
}

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
