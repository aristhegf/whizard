import { z } from "zod";

/**
 * Every open tab keeps one small WebSocket to the presence service. It powers the live
 * "here now" count and records visits for the site's stats.
 */

/** Pages the stats count views of. Anything else is counted as "other". */
export const PAGE_NAMES = [
  "home",
  "games",
  "topics",
  "jigsaw",
  "room",
  "account",
  "friends",
  "add",
  "group",
  "privacy",
  "stats",
  "pricing",
  "admin",
  "other",
] as const;

export type PageName = (typeof PAGE_NAMES)[number];

export const DEVICE_TYPES = ["phone", "tablet", "desktop"] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

/** A random ID saved in the browser, not linked to a name or an account. */
const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Where the visitor came from: a site's host name or a campaign tag such as `whatsapp`. */
export const SOURCE_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

const sourceSchema = z.string().regex(SOURCE_PATTERN);

export const presenceClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    visitor: visitorIdSchema,
    page: z.enum(PAGE_NAMES),
    device: z.enum(DEVICE_TYPES),
    source: sourceSchema.nullable(),
    /** False when the socket reconnects, so a dropped connection isn't a second visit. */
    newVisit: z.boolean(),
  }),
  z.object({ type: z.literal("view"), page: z.enum(PAGE_NAMES) }),
  /** The player shared their room's code or link. */
  z.object({ type: z.literal("invite") }),
]);

export type PresenceClientMessage = z.infer<typeof presenceClientMessageSchema>;

export const presenceServerMessageSchema = z.object({
  type: z.literal("presence"),
  /** People with the site open right now, each counted once however many tabs they have. */
  online: z.number().int().nonnegative(),
  /** Everyone who has ever visited. */
  visitors: z.number().int().nonnegative(),
});

export type PresenceServerMessage = z.infer<typeof presenceServerMessageSchema>;

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length > 1024) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parsePresenceClientMessage(raw: unknown): PresenceClientMessage | null {
  return parseWith(presenceClientMessageSchema, raw);
}

export function parsePresenceServerMessage(raw: unknown): PresenceServerMessage | null {
  return parseWith(presenceServerMessageSchema, raw);
}
