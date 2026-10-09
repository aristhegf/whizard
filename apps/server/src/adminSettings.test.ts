import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomState } from "@whizard/game-core";
import { parseServerMessage } from "@whizard/protocol";
import type { Env } from "./env";
import { forgetSettings } from "./settings";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";
import { forgetTopics } from "./topics";

// The Worker's Durable Object base isn't Node's to load; the routes under test never touch one.
vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const app = (await import("./index")).default;
const { Room } = await import("./room");

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

/** A request through the real route table, as the runtime would hand it over. */
async function call(
  env: Env,
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: BodyInit },
): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init), env, ctx);
}

/** The rejection every settings write answers with when a topic id names no live topic. */
const MESSAGE = "That topic isn't available. Pick another.";

/** A namespace that accepts every code, so a create succeeds without a real Durable Object. */
const ROOMS = { getByName: () => ({ create: async () => true }) } as unknown as Env["ROOMS"];

async function roomEnv(): Promise<Env> {
  return { DB: await testDb(), ROOMS } as unknown as Env;
}

// A signed-in admin's request, as a page of the admin UI would send it.
async function adminEnv(): Promise<{ env: Env; headers: Record<string, string> }> {
  const env = { DB: await testDb() } as unknown as Env;
  await addUser(env.DB, "boss");
  await env.DB.prepare("UPDATE users SET is_admin = 1 WHERE id = 'boss'").run();
  const cookie = (await createSession(env, "boss", Date.now())).split(";")[0]!;
  return { env, headers: { Cookie: cookie, Origin: "http://localhost" } };
}

const jsonBody = (headers: Record<string, string>, body: unknown) => ({
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function errorOf(response: Response): Promise<{ code: string; message: string }> {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return body.error;
}

/** A joined player's socket: its attachment, and every message the server sent it. */
function socket(playerId: string): { ws: WebSocket; sent: string[] } {
  const sent: string[] = [];
  let attachment: unknown = { playerId, account: null };
  const ws = {
    readyState: 1,
    serializeAttachment: (value: unknown) => {
      attachment = value;
    },
    deserializeAttachment: () => attachment,
    send: (data: string) => {
      sent.push(data);
    },
    close: () => {},
  };
  return { ws: ws as unknown as WebSocket, sent };
}

/**
 * Sends a `configure` message through the room's own WebSocket handler and returns the error
 * it answered with, or null if it didn't answer with one. This is the rejection path spec §9
 * designates for settings that arrive after a room exists (line 234): createRoom itself never
 * rejects an unknown id — spec §9 line 233 stores presets unvalidated and lets `newRoomSettings`
 * substitute a live topic with a 201.
 */
async function configureRejection(
  env: Env,
  settings: unknown,
): Promise<{ code: string; message: string } | null> {
  const room = new Room({} as never, env) as unknown as {
    env: Env;
    ctx: { storage: { get: (key: string) => Promise<unknown> } };
    webSocketMessage: (ws: WebSocket, data: string) => Promise<void>;
  };
  room.env = env;
  room.ctx = { storage: { get: async () => createRoomState("ABC234", Date.now()) } };
  const { ws, sent } = socket("p1");
  await room.webSocketMessage(ws, JSON.stringify({ type: "configure", settings }));
  const [first] = sent;
  const message = first ? parseServerMessage(first) : null;
  return message?.type === "error" ? { code: message.code, message: message.message } : null;
}

/** A custom topic's row, as the admin create would leave it: colours parse, sorts last. */
const MARS_TOPIC = `INSERT INTO topics (id, name, tagline, colors, sort_order)
  VALUES ('mars', 'Mars', 'Red dust and rovers', '["#ff0000","#5a2014"]', 13)`;

describe("topic ids in settings", () => {
  beforeEach(() => {
    forgetTopics();
    forgetSettings();
  });

  // These two drove POST /api/rooms in the first draft; spec §9 (line 233) has createRoom
  // store unknown presets instead, substituting a live topic, so they now target the
  // configure gate (line 234), which had no coverage.
  it("rejects unknown category in quiz settings", async () => {
    const env = await roomEnv();
    expect(await configureRejection(env, { category: "nope" })).toEqual({
      code: "bad_settings",
      message: MESSAGE,
    });
  });

  it("rejects unknown ids in elimination topics", async () => {
    const env = await roomEnv();
    expect(await configureRejection(env, { topics: ["bible", "nope"] })).toEqual({
      code: "bad_settings",
      message: MESSAGE,
    });
  });

  it("accepts every live id including a freshly created one", async () => {
    const env = await roomEnv();
    await env.DB.prepare(MARS_TOPIC).run();
    const response = await call(env, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({ settings: { category: "mars" } }),
    });
    expect(response.status).toBe(201);
    expect((await response.json()) as { code: string }).toHaveProperty("code");
    // Spec §9 line 233: this path never rejects an unknown id — newRoomSettings swaps it
    // for a live topic instead, so the preset `{ category: "nope" }` still creates a room.
    const substituted = await call(env, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({ settings: { category: "nope" } }),
    });
    expect(substituted.status).toBe(201);
  });

  it("adminGames game-config write validates too", async () => {
    const { env, headers } = await adminEnv();
    const response = await call(env, "/api/admin/settings", {
      method: "PATCH",
      ...jsonBody(headers, { quizDefaults: { category: "nope" } }),
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe(MESSAGE);
  });

  it("rejects unknown ids in the topics-off list, and keeps live ones", async () => {
    const { env, headers } = await adminEnv();
    const unknown = await call(env, "/api/admin/settings", {
      method: "PATCH",
      ...jsonBody(headers, { topicsOff: ["bible", "nope"] }),
    });
    expect(unknown.status).toBe(400);
    expect((await errorOf(unknown)).message).toBe(MESSAGE);

    await env.DB.prepare(MARS_TOPIC).run();
    forgetTopics(); // the failed write read the catalogue; drop it for the seeded row
    const live = await call(env, "/api/admin/settings", {
      method: "PATCH",
      ...jsonBody(headers, { topicsOff: ["mars"] }),
    });
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ ok: true });
  });

  it("admin games lists the live catalogue", async () => {
    const { env, headers } = await adminEnv();
    await env.DB.prepare(MARS_TOPIC).run();
    forgetTopics();
    const response = await call(env, "/api/admin/games", { headers });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { topics: { id: string }[] };
    expect(body.topics.map((topic) => topic.id)).toContain("mars");
  });
});
