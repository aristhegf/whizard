import {
  DEFAULT_QUIZ_SETTINGS,
  gameModule,
  generateRoomCode,
  isGameId,
  normalizeRoomCode,
  type AccountIdentity,
  type GameId,
} from "@whizard/game-core";
import { PROTOCOL_VERSION } from "@whizard/protocol";
import {
  deleteMe,
  deletePasskey,
  exportMe,
  getMe,
  changeUsername,
  checkUsername,
  getPasskeys,
  signOut,
  updateMe,
} from "./account";
import { count, countryCode, logActivity, networkPrefix } from "./analytics";
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
import {
  HttpError,
  isSameOrigin,
  jsonError,
  withinLimit,
  type Handler,
  type RequestContext,
} from "./http";
import { cleanUp, getMatches, getStats } from "./matches";
import { getProfile } from "./profiles";
import {
  addPasskeyOptions,
  addPasskeyVerify,
  signInOptions,
  signInVerify,
  signUpOptions,
  signUpVerify,
} from "./passkeys";
import { addSubscription, getPings, getPushKey, pingFriend, removeSubscription } from "./push";
import { COUNTRY_HEADER, NETWORK_HEADER } from "./presence";
import { ACCOUNT_HEADER } from "./room";
import { decideReport, getAdminActivity, getAdminOverview, getAdminReports } from "./admin";
import { getAdminAnalytics } from "./adminAnalytics";
import { getAdminGames } from "./adminGames";
import { importQuestions } from "./adminImport";
import { endPro, getAdminPayments, giveProFree, recordPayment } from "./adminPayments";
import { actOnName, addBlockedWord, getModeration, removeBlockedWord } from "./adminModeration";
import {
  addQuestion,
  getQuestion,
  getQuestionsSummary,
  listQuestions,
  revertQuestion,
  updateQuestion,
} from "./adminQuestions";
import { createTopic, deleteTopic, listTopics, updateTopic, uploadTopicArt } from "./adminTopics";
import {
  addBankQuestion,
  createBank,
  deleteBank,
  deleteBankQuestion,
  getBank,
  listBanks,
  updateBank,
  updateBankQuestion,
} from "./banks";
import { loadBank } from "./bank";
import { getPhoto, uploadPhoto } from "./photos";
import { getSite, siteSettings } from "./settings";
import { closeRoom, getAdminRooms } from "./adminRooms";
import { getAdminSettings, grantAdmin, revokeAdmin, updateSettings } from "./adminSettings";
import { getAdminUsers, manageUser } from "./adminUsers";
import { reportQuestion } from "./reports";
import { categoriesPayload, getTopics, isKnown, topicArt } from "./topics";
import { getSiteStats } from "./stats";
import { getCommunityStats } from "./community";
import { currentSession, hasSessionCookie } from "./sessions";

export { Presence } from "./presence";
export { Room } from "./room";

const CREATE_ATTEMPTS = 5;

async function health(): Promise<Response> {
  return Response.json({ ok: true, protocolVersion: PROTOCOL_VERSION });
}

/**
 * `GET /api/quiz/categories`: the live topic catalogue — ordered, minus the topics an admin
 * turned off, each with playable question counts and its artwork URL. Never cached by HTTP:
 * an admin's change has to reach every client immediately.
 */
async function quizCategories({ env }: RequestContext): Promise<Response> {
  const payload = await categoriesPayload(env, await loadBank(env));
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

/**
 * `GET /api/topics/:id/art`: a topic's uploaded WebP behind its immutable versioned URL, or
 * a redirect to the artwork that ships. Only an id nobody knows gets a 404.
 */
async function getTopicArt({ env, params }: RequestContext): Promise<Response> {
  const art = await topicArt(env, decodeURIComponent(params[0] ?? ""));
  if (art.kind === "unknown") {
    return jsonError(404, "not_found", "That topic doesn't exist.");
  }
  if (art.kind === "redirect") {
    return new Response(null, { status: 302, headers: { Location: art.location } });
  }
  return new Response(art.bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Creates a room. The body can pick the game and preset its settings, e.g.
 * `{"settings":{"category":"music"}}` or `{"game":"word-rush"}`. The quiz is the default.
 * Settings are stored as they arrive: a preset naming a topic the catalogue doesn't hold is
 * not rejected here but swapped by `newRoomSettings` for one that is live and on (spec §9 —
 * the rejection gates are configure, handleStart and the admin settings writes).
 */
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
  let game: GameId = "quiz";
  if (text.length > 0 && text.length < 2048) {
    try {
      const body = JSON.parse(text) as { settings?: unknown; game?: unknown };
      settings = body.settings;
      if (body.game !== undefined) {
        if (typeof body.game !== "string" || !isGameId(body.game)) {
          return jsonError(400, "bad_request", "There's no game by that name.");
        }
        game = body.game;
      }
    } catch {
      return jsonError(400, "bad_request", "Request body must be JSON.");
    }
  }
  // The deploy's smoke test still gets a room, so a pause can't fail a deploy.
  const site = await siteSettings(env);
  if (!request.headers.has("X-Whizard-Smoke-Test")) {
    if (site.roomsPaused) {
      return jsonError(503, "rooms_paused", "New rooms are paused. Try again soon.");
    }
    if (site.gamesOff.includes(game)) {
      const name = gameModule(game).name;
      return jsonError(503, "game_off", `${name} is turned off for now. Try again soon.`);
    }
  }
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    if (await env.ROOMS.getByName(code).create(code, settings, game)) {
      // The deploy's smoke test makes a room each time; it isn't a real one.
      if (!request.headers.has("X-Whizard-Smoke-Test")) {
        const topic = (settings as { category?: unknown } | undefined)?.category;
        const topics = game === "quiz" ? await getTopics(env) : [];
        ctx.waitUntil(
          Promise.all([
            count(env, { rooms_created: 1 }),
            logActivity(env, "room_created", {
              game,
              topic:
                game !== "quiz"
                  ? null
                  : typeof topic === "string" && isKnown(topics, topic)
                    ? topic
                    : DEFAULT_QUIZ_SETTINGS.category,
            }),
          ]),
        );
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
  if (!(await withinLimit(env.JOIN_LIMIT, request))) {
    return jsonError(429, "too_many_connections", "Too many connections. Try again in a minute.");
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

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const ROUTES: [Method, RegExp, Handler][] = [
  ["GET", /^\/api\/health$/, health],
  ["GET", /^\/api\/quiz\/categories$/, quizCategories],
  ["GET", /^\/api\/topics\/([^/]+)\/art$/, getTopicArt],
  ["POST", /^\/api\/rooms$/, createRoom],
  ["GET", /^\/api\/rooms\/([^/]+)$/, roomStatus],
  ["GET", /^\/api\/rooms\/([^/]+)\/ws$/, roomSocket],
  ["POST", /^\/api\/rooms\/([^/]+)\/photo$/, uploadPhoto],
  ["GET", /^\/api\/rooms\/([^/]+)\/photo\/([^/]+)$/, getPhoto],
  ["GET", /^\/api\/presence$/, presenceSocket],
  ["GET", /^\/api\/stats$/, getSiteStats],
  ["GET", /^\/api\/community$/, getCommunityStats],
  ["GET", /^\/api\/site$/, getSite],
  ["POST", /^\/api\/questions\/([^/]+)\/report$/, reportQuestion],

  ["GET", /^\/api\/admin\/overview$/, getAdminOverview],
  ["GET", /^\/api\/admin\/activity$/, getAdminActivity],
  ["GET", /^\/api\/admin\/reports$/, getAdminReports],
  ["POST", /^\/api\/admin\/reports\/([^/]+)$/, decideReport],
  ["GET", /^\/api\/admin\/users$/, getAdminUsers],
  ["POST", /^\/api\/admin\/users\/([^/]+)$/, manageUser],
  ["GET", /^\/api\/admin\/rooms$/, getAdminRooms],
  ["POST", /^\/api\/admin\/rooms\/([^/]+)\/close$/, closeRoom],
  ["GET", /^\/api\/admin\/analytics$/, getAdminAnalytics],
  ["GET", /^\/api\/admin\/questions\/summary$/, getQuestionsSummary],
  ["GET", /^\/api\/admin\/questions$/, listQuestions],
  ["POST", /^\/api\/admin\/questions$/, addQuestion],
  ["POST", /^\/api\/admin\/questions\/import$/, importQuestions],
  ["GET", /^\/api\/admin\/questions\/([^/]+)$/, getQuestion],
  ["PATCH", /^\/api\/admin\/questions\/([^/]+)$/, updateQuestion],
  ["DELETE", /^\/api\/admin\/questions\/([^/]+)$/, revertQuestion],
  ["GET", /^\/api\/admin\/moderation$/, getModeration],
  ["POST", /^\/api\/admin\/moderation\/words$/, addBlockedWord],
  ["DELETE", /^\/api\/admin\/moderation\/words\/([^/]+)$/, removeBlockedWord],
  ["POST", /^\/api\/admin\/moderation\/names\/(\d+)$/, actOnName],
  ["GET", /^\/api\/admin\/settings$/, getAdminSettings],
  ["GET", /^\/api\/admin\/topics$/, listTopics],
  ["POST", /^\/api\/admin\/topics$/, createTopic],
  ["PUT", /^\/api\/admin\/topics\/([^/]+)\/art$/, uploadTopicArt],
  ["PATCH", /^\/api\/admin\/topics\/([^/]+)$/, updateTopic],
  ["DELETE", /^\/api\/admin\/topics\/([^/]+)$/, deleteTopic],
  ["GET", /^\/api\/admin\/games$/, getAdminGames],
  ["GET", /^\/api\/admin\/payments$/, getAdminPayments],
  ["POST", /^\/api\/admin\/payments$/, recordPayment],
  ["POST", /^\/api\/admin\/pro$/, giveProFree],
  ["DELETE", /^\/api\/admin\/pro\/([^/]+)$/, endPro],
  ["PATCH", /^\/api\/admin\/settings$/, updateSettings],
  ["POST", /^\/api\/admin\/admins$/, grantAdmin],
  ["DELETE", /^\/api\/admin\/admins\/([^/]+)$/, revokeAdmin],

  ["POST", /^\/api\/auth\/signup\/options$/, signUpOptions],
  ["POST", /^\/api\/auth\/signup\/verify$/, signUpVerify],
  ["POST", /^\/api\/auth\/signin\/options$/, signInOptions],
  ["POST", /^\/api\/auth\/signin\/verify$/, signInVerify],
  ["POST", /^\/api\/auth\/signout$/, signOut],

  ["GET", /^\/api\/me$/, getMe],
  ["PATCH", /^\/api\/me$/, updateMe],
  ["DELETE", /^\/api\/me$/, deleteMe],
  ["POST", /^\/api\/me\/username$/, changeUsername],
  ["GET", /^\/api\/usernames\/([^/]+)$/, checkUsername],
  ["GET", /^\/api\/me\/export$/, exportMe],
  ["GET", /^\/api\/me\/stats$/, getStats],
  ["GET", /^\/api\/me\/matches$/, getMatches],
  ["GET", /^\/api\/me\/passkeys$/, getPasskeys],
  ["POST", /^\/api\/me\/passkeys\/options$/, addPasskeyOptions],
  ["POST", /^\/api\/me\/passkeys\/verify$/, addPasskeyVerify],
  ["DELETE", /^\/api\/me\/passkeys\/([^/]+)$/, deletePasskey],

  ["GET", /^\/api\/users\/([^/]+)$/, getUser],
  ["GET", /^\/api\/users\/([^/]+)\/profile$/, getProfile],
  ["GET", /^\/api\/friends$/, getFriends],
  ["POST", /^\/api\/friends$/, addFriend],
  ["PATCH", /^\/api\/friends\/([^/]+)$/, updateFriend],
  ["DELETE", /^\/api\/friends\/([^/]+)$/, removeFriend],
  ["POST", /^\/api\/friends\/([^/]+)\/ping$/, pingFriend],
  ["GET", /^\/api\/pings$/, getPings],
  ["GET", /^\/api\/push\/key$/, getPushKey],
  ["POST", /^\/api\/push\/subscriptions$/, addSubscription],
  ["DELETE", /^\/api\/push\/subscriptions$/, removeSubscription],
  ["GET", /^\/api\/groups$/, getGroups],
  ["POST", /^\/api\/groups$/, createGroup],
  ["PATCH", /^\/api\/groups\/([^/]+)$/, updateGroup],
  ["DELETE", /^\/api\/groups\/([^/]+)$/, deleteGroup],
  ["GET", /^\/api\/groups\/([^/]+)\/leaderboard$/, getGroupLeaderboard],

  ["GET", /^\/api\/banks$/, listBanks],
  ["POST", /^\/api\/banks$/, createBank],
  ["GET", /^\/api\/banks\/([^/]+)$/, getBank],
  ["PATCH", /^\/api\/banks\/([^/]+)$/, updateBank],
  ["DELETE", /^\/api\/banks\/([^/]+)$/, deleteBank],
  ["POST", /^\/api\/banks\/([^/]+)\/questions$/, addBankQuestion],
  ["PATCH", /^\/api\/banks\/([^/]+)\/questions\/([^/]+)$/, updateBankQuestion],
  ["DELETE", /^\/api\/banks\/([^/]+)\/questions\/([^/]+)$/, deleteBankQuestion],
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
