import { z } from "zod";

export const PROTOCOL_VERSION = 1;

export const MAX_MESSAGE_BYTES = 4096;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), t: z.number() }),
]);

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pong"), t: z.number(), serverTime: z.number() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
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
