import { buildPushHTTPRequest } from "@pushforge/builder";
import { normalizeRoomCode } from "@whizard/game-core";
import { pingRequestSchema, pushSubscriptionSchema, normalizeUsername } from "@whizard/protocol";
import { requireUser } from "./account";
import { count } from "./analytics";
import type { Env } from "./env";
import { HttpError, readJson, requireSameOrigin, type RequestContext } from "./http";
import { inQuietHours } from "./quiet";

const VAPID_KEY_NAME = "vapid";
/** One ping per friend per minute. */
const PING_COOLDOWN_MS = 60_000;
/** A ping is only useful while the room is fresh. */
const PING_TTL_SECONDS = 15 * 60;

/**
 * The key pair that signs pings, made on first use and kept in the database. Push services tie
 * each subscription to its public key, so it must stay the same once browsers have subscribed.
 */
async function vapidKey(env: Env): Promise<JsonWebKey> {
  const saved = await env.DB.prepare("SELECT value FROM server_keys WHERE name = ?")
    .bind(VAPID_KEY_NAME)
    .first<{ value: string }>();
  if (saved) return JSON.parse(saved.value) as JsonWebKey;

  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  // If two requests race to make a key, the first one saved wins and both use it.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO server_keys (name, value, created_at) VALUES (?, ?, ?)",
  )
    .bind(VAPID_KEY_NAME, JSON.stringify(jwk), Date.now())
    .run();
  const winner = await env.DB.prepare("SELECT value FROM server_keys WHERE name = ?")
    .bind(VAPID_KEY_NAME)
    .first<{ value: string }>();
  return JSON.parse(winner!.value) as JsonWebKey;
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The public key in the form browsers want: an uncompressed P-256 point. */
function applicationServerKey(jwk: JsonWebKey): string {
  const x = base64UrlToBytes(jwk.x!);
  const y = base64UrlToBytes(jwk.y!);
  const point = new Uint8Array(1 + x.length + y.length);
  point[0] = 4;
  point.set(x, 1);
  point.set(y, 1 + x.length);
  return bytesToBase64Url(point);
}

export async function getPushKey(context: RequestContext): Promise<Response> {
  const publicKey = applicationServerKey(await vapidKey(context.env));
  return Response.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
}

/** Browsers' push services. Anything else is refused, so the server never posts to other URLs. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isPushService(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export async function addSubscription(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const { endpoint, keys } = await readJson(context.request, pushSubscriptionSchema);
  if (!isPushService(endpoint)) {
    throw new HttpError(
      400,
      "unknown_push_service",
      "This browser’s notifications aren’t supported.",
    );
  }
  // A browser has one endpoint; whoever signed in on it last gets its pings.
  await context.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(endpoint, user.id, keys.p256dh, keys.auth, Date.now())
    .run();
  return Response.json({ ok: true });
}

export async function removeSubscription(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const { endpoint } = await readJson(
    context.request,
    pushSubscriptionSchema.pick({ endpoint: true }),
  );
  await context.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
    .bind(endpoint, user.id)
    .run();
  return Response.json({ ok: true });
}

interface Recipient {
  id: string;
  pings: number;
  quiet_start: number | null;
  quiet_end: number | null;
  time_zone: string | null;
  /** Whether they muted the sender. */
  muted: number;
  /** When the sender last pinged them. */
  last_pinged_at: number | null;
}

/**
 * Tells a friend you're in a room and want them to join. Whether they get it depends on their
 * settings; the sender only learns whether it went out, not why not.
 */
export async function pingFriend(context: RequestContext): Promise<Response> {
  requireSameOrigin(context);
  const { user } = await requireUser(context);
  const username = normalizeUsername(decodeURIComponent(context.params[0] ?? ""));
  const body = await readJson(context.request, pingRequestSchema);
  const room = normalizeRoomCode(body.room);
  if (!room) throw new HttpError(400, "invalid_room_code", "That isn’t a valid room code.");

  const db = context.env.DB;
  const friend = await db
    .prepare(
      `SELECT u.id, u.pings, u.quiet_start, u.quiet_end, u.time_zone,
              theirs.muted, mine.last_pinged_at
         FROM users u
         JOIN friends mine ON mine.user_id = ?1 AND mine.friend_id = u.id
         JOIN friends theirs ON theirs.user_id = u.id AND theirs.friend_id = ?1
        WHERE u.username = ?2`,
    )
    .bind(user.id, username)
    .first<Recipient>();
  if (!friend) throw new HttpError(404, "not_friends", "You can only ping your friends.");

  const now = Date.now();
  if (friend.last_pinged_at !== null && now - friend.last_pinged_at < PING_COOLDOWN_MS) {
    throw new HttpError(429, "too_soon", "You just pinged them. Give them a minute.");
  }
  await db
    .prepare("UPDATE friends SET last_pinged_at = ? WHERE user_id = ? AND friend_id = ?")
    .bind(now, user.id, friend.id)
    .run();

  const quiet =
    friend.quiet_start === null || friend.quiet_end === null
      ? null
      : { start: friend.quiet_start, end: friend.quiet_end };
  if (!friend.pings || friend.muted || inQuietHours(now, quiet, friend.time_zone)) {
    return Response.json({ sent: false });
  }

  const sent = await sendPush(context, friend.id, {
    title: `${user.display_name} wants to play`,
    body: `Tap to join room ${room} on Whizard.`,
    url: `/r/${room}`,
    tag: `ping-${user.username}`,
  });
  if (sent) context.ctx.waitUntil(count(context.env, { pings_sent: 1 }));
  return Response.json({ sent });
}

interface PingPayload {
  title: string;
  body: string;
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
}

/** Sends to every browser the user turned pings on in. Drops subscriptions that have expired. */
async function sendPush(context: RequestContext, userId: string, payload: PingPayload) {
  const { env, url } = context;
  const { results: subscriptions } = await env.DB.prepare(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
  )
    .bind(userId)
    .all<{ endpoint: string; p256dh: string; auth: string }>();
  if (subscriptions.length === 0) return false;

  const privateJWK = await vapidKey(env);
  const outcomes = await Promise.all(
    subscriptions.map(async (s) => {
      try {
        const request = await buildPushHTTPRequest({
          privateJWK,
          subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message: {
            payload: { ...payload, url: new URL(payload.url, url.origin).href },
            adminContact: url.origin,
            options: { ttl: PING_TTL_SECONDS, urgency: "high" },
          },
        });
        const response = await fetch(request.endpoint, {
          method: "POST",
          headers: request.headers,
          body: request.body,
        });
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
            .bind(s.endpoint)
            .run();
          return false;
        }
        return response.ok;
      } catch (error) {
        console.error("Push failed", error);
        return false;
      }
    }),
  );
  return outcomes.some(Boolean);
}
