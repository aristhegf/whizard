import { questionCounts } from "@whizard/content";
import {
  QUIZ_CATEGORIES,
  generateRoomCode,
  normalizeRoomCode,
  type AccountIdentity,
} from "@whizard/game-core";
import { PROTOCOL_VERSION } from "@whizard/protocol";
import {
  deleteMe,
  deletePasskey,
  exportMe,
  getMe,
  getPasskeys,
  signOut,
  updateMe,
} from "./account";
import { count, countryCode, networkPrefix } from "./analytics";
import type { Env } from "./env";
import {
  addFriend,
  createGroup,
  deleteGroup,
  getFriends,
  getGroupLeaderboard,
  getGroups,
  getUser,
  removeFriend,
  updateFriend,
  updateGroup,
} from "./friends";
import { HttpError, isSameOrigin, jsonError, type Handler, type RequestContext } from "./http";
import { cleanUp, getMatches, getStats } from "./matches";
import {
  addPasskeyOptions,
  addPasskeyVerify,
  signInOptions,
  signInVerify,
  signUpOptions,
  signUpVerify,
} from "./passkeys";
import { addSubscription, getPushKey, pingFriend, removeSubscription } from "./push";
import { COUNTRY_HEADER, NETWORK_HEADER } from "./presence";
import { ACCOUNT_HEADER } from "./room";
import { getSiteStats } from "./stats";
import { currentSession, hasSessionCookie } from "./sessions";

export { Presence } from "./presence";
export { Room } from "./room";

const CREATE_ATTEMPTS = 5;

/**
 * Checks a per-address rate limit. Local development and tests share one private address, so
 * only public addresses are limited.
 */
async function withinLimit(limiter: RateLimit, request: Request): Promise<boolean> {
  const network = networkPrefix(request.headers.get("CF-Connecting-IP"));
  if (!network) return true;
  const { success } = await limiter.limit({ key: network });
  return success;
}

async function health(): Promise<Response> {
  return Response.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
}

async function quizCategories(): Promise<Response> {
  const counts = questionCounts();
  const categories = QUIZ_CATEGORIES.map((c) => ({
    ...c,
    questions: counts[c.id] ?? { easy: 0, medium: 0, hard: 0 },
  }));
  return Response.json({ categories }, { headers: { "Cache-Control": "public, max-age=300" } });
}

/** Creates a room. The body can preset the game's settings, e.g. `{"settings":{"category":"music"}}`. */
async function createRoom({ env, request, ctx }: RequestContext): Promise<Response> {
  if (!(await withinLimit(env.ROOM_LIMIT, request))) {
    return jsonError(
      429,
      "too_many_rooms",
      "That’s a lot of rooms at once. Try again in a minute.",
    );
  }
  const text = await request.text();
  let settings: unknown;
  if (text.length > 0 && text.length < 2048) {
    try {
      settings = (JSON.parse(text) as { settings?: unknown }).settings;
    } catch {
      return jsonError(400, "bad_request", "Request body must be JSON.");
    }
  }
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    if (await env.ROOMS.getByName(code).create(code, settings)) {
      // The deploy's smoke test makes a room each time; it isn't a real one.
      if (!request.headers.has("X-Whizard-Smoke-Test")) {
        ctx.waitUntil(count(env, { rooms_created: 1 }));
      }
      return Response.json({ code }, { status: 201 });
    }
  }
  return jsonError(503, "no_room_code", "Couldn't find a free room code. Try again.");
}

/**
 * Hands the WebSocket to the room. If the player is signed in, the room is told who they are;
 * the header is always rebuilt here, so a client can't claim to be someone else.
 */
async function roomSocket({ request, env, url, params }: RequestContext): Promise<Response> {
  const code = normalizeRoomCode(decodeURIComponent(params[0] ?? ""));
  if (!code) return jsonError(400, "invalid_room_code", "That isn't a valid room code");
  if (request.headers.get("Upgrade") !== "websocket") {
    return jsonError(426, "upgrade_required", "Expected a WebSocket upgrade");
  }

  const headers = new Headers(request.headers);
  headers.delete(ACCOUNT_HEADER);
  // Browsers send cookies with WebSocket upgrades from any site, so only trust our own pages.
  if (hasSessionCookie(request) && isSameOrigin(request, url)) {
    const session = await currentSession(request, env, Date.now());
    if (session) {
      const account: AccountIdentity = {
        userId: session.user.id,
        username: session.user.username,
      };
      headers.set(ACCOUNT_HEADER, JSON.stringify(account));
    }
  }
  return env.ROOMS.getByName(code).fetch(new Request(request, { headers }));
}

/** The site-wide presence socket: the live "here now" count, and visit stats. */
async function presenceSocket({ request, env, url }: RequestContext): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return jsonError(426, "upgrade_required", "Expected a WebSocket upgrade");
  }
  if (!isSameOrigin(request, url)) return jsonError(403, "forbidden", "Not allowed");
  if (!(await withinLimit(env.PRESENCE_LIMIT, request))) {
    return jsonError(429, "too_many_connections", "Too many connections. Try again in a minute.");
  }
  const headers = new Headers(request.headers);
  headers.delete(COUNTRY_HEADER);
  headers.delete(NETWORK_HEADER);
  const network = networkPrefix(request.headers.get("CF-Connecting-IP"));
  if (network) headers.set(NETWORK_HEADER, network);
  const country = countryCode((request.cf as { country?: unknown } | undefined)?.country);
  if (country) headers.set(COUNTRY_HEADER, country);
  return env.PRESENCE.getByName("site").fetch(new Request(request, { headers }));
}

/** Whether a room is still open. Used to offer a way back to it from other pages. */
async function roomStatus({ env, params }: RequestContext): Promise<Response> {
  const code = normalizeRoomCode(decodeURIComponent(params[0] ?? ""));
  if (!code) return jsonError(400, "invalid_room_code", "That isn't a valid room code");
  const status = await env.ROOMS.getByName(code).status();
  if (!status) return jsonError(404, "room_not_found", "This room doesn’t exist or has expired.");
  return Response.json({ code, ...status }, { headers: { "Cache-Control": "no-store" } });
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const ROUTES: [Method, RegExp, Handler][] = [
  ["GET", /^\/api\/health$/, health],
  ["GET", /^\/api\/quiz\/categories$/, quizCategories],
  ["POST", /^\/api\/rooms$/, createRoom],
  ["GET", /^\/api\/rooms\/([^/]+)$/, roomStatus],
  ["GET", /^\/api\/rooms\/([^/]+)\/ws$/, roomSocket],
  ["GET", /^\/api\/presence$/, presenceSocket],
  ["GET", /^\/api\/stats$/, getSiteStats],

  ["POST", /^\/api\/auth\/signup\/options$/, signUpOptions],
  ["POST", /^\/api\/auth\/signup\/verify$/, signUpVerify],
  ["POST", /^\/api\/auth\/signin\/options$/, signInOptions],
  ["POST", /^\/api\/auth\/signin\/verify$/, signInVerify],
  ["POST", /^\/api\/auth\/signout$/, signOut],

  ["GET", /^\/api\/me$/, getMe],
  ["PATCH", /^\/api\/me$/, updateMe],
  ["DELETE", /^\/api\/me$/, deleteMe],
  ["GET", /^\/api\/me\/export$/, exportMe],
  ["GET", /^\/api\/me\/stats$/, getStats],
  ["GET", /^\/api\/me\/matches$/, getMatches],
  ["GET", /^\/api\/me\/passkeys$/, getPasskeys],
  ["POST", /^\/api\/me\/passkeys\/options$/, addPasskeyOptions],
  ["POST", /^\/api\/me\/passkeys\/verify$/, addPasskeyVerify],
  ["DELETE", /^\/api\/me\/passkeys\/([^/]+)$/, deletePasskey],

  ["GET", /^\/api\/users\/([^/]+)$/, getUser],
  ["GET", /^\/api\/friends$/, getFriends],
  ["POST", /^\/api\/friends$/, addFriend],
  ["PATCH", /^\/api\/friends\/([^/]+)$/, updateFriend],
  ["DELETE", /^\/api\/friends\/([^/]+)$/, removeFriend],
  ["POST", /^\/api\/friends\/([^/]+)\/ping$/, pingFriend],
  ["GET", /^\/api\/push\/key$/, getPushKey],
  ["POST", /^\/api\/push\/subscriptions$/, addSubscription],
  ["DELETE", /^\/api\/push\/subscriptions$/, removeSubscription],
  ["GET", /^\/api\/groups$/, getGroups],
  ["POST", /^\/api\/groups$/, createGroup],
  ["PATCH", /^\/api\/groups\/([^/]+)$/, updateGroup],
  ["DELETE", /^\/api\/groups\/([^/]+)$/, deleteGroup],
  ["GET", /^\/api\/groups\/([^/]+)\/leaderboard$/, getGroupLeaderboard],
];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  let pathMatched = false;
  for (const [method, pattern, handler] of ROUTES) {
    const match = pattern.exec(url.pathname);
    if (!match) continue;
    pathMatched = true;
    if (method !== request.method) continue;
    return handler({ request, env, url, params: match.slice(1), ctx });
  }
  return pathMatched
    ? jsonError(405, "method_not_allowed", "Method not allowed")
    : jsonError(404, "not_found", "Not found");
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
      console.error(error);
      return jsonError(500, "server_error", "Something went wrong. Please try again.");
    }
  },

  async scheduled(_controller, env): Promise<void> {
    await cleanUp(env, Date.now());
  },
} satisfies ExportedHandler<Env>;
