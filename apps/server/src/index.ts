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
import { ACCOUNT_HEADER } from "./room";
import { currentSession, hasSessionCookie } from "./sessions";

export { Room } from "./room";

const CREATE_ATTEMPTS = 5;

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

async function createRoom({ env }: RequestContext): Promise<Response> {
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    if (await env.ROOMS.getByName(code).create(code)) {
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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const ROUTES: [Method, RegExp, Handler][] = [
  ["GET", /^\/api\/health$/, health],
  ["GET", /^\/api\/quiz\/categories$/, quizCategories],
  ["POST", /^\/api\/rooms$/, createRoom],
  ["GET", /^\/api\/rooms\/([^/]+)\/ws$/, roomSocket],

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
