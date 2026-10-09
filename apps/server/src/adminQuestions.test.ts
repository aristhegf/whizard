import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { forgetBank } from "./bank";
import { forgetSettings } from "./settings";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";
import { forgetTopics } from "./topics";
import { suggestedLevel } from "./adminQuestions";

// The Worker's Durable Object base isn't Node's to load; the routes under test never touch one.
vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const app = (await import("./index")).default;

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

/** A question the form could post, with its topic swapped per test. */
function question(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: "mars",
    topic: "Rovers",
    difficulty: "easy",
    prompt: "Which rover filmed its own landing on 18 February 2021?",
    choices: ["Perseverance", "Curiosity", "Spirit", "Opportunity"],
    explanation: "Perseverance recorded its descent minutes before touching down.",
    reference: null,
    ...over,
  };
}

/** A custom topic's row, as the admin create would leave it: colours parse, sorts last. */
const MARS_TOPIC = `INSERT INTO topics (id, name, tagline, colors, sort_order)
  VALUES ('mars', 'Mars', 'Red dust and rovers', '["#ff0000","#5a2014"]', 13)`;

describe("the level check", () => {
  it("flags easy questions most people miss and hard ones nearly everyone gets", () => {
    expect(suggestedLevel("easy", 0.3)).toBe("medium");
    expect(suggestedLevel("easy", 0.6)).toBeNull();
    expect(suggestedLevel("medium", 0.95)).toBe("easy");
    expect(suggestedLevel("medium", 0.2)).toBe("hard");
    expect(suggestedLevel("hard", 0.9)).toBe("medium");
    expect(suggestedLevel("hard", 0.1)).toBeNull();
  });
});

describe("topic membership on question writes", () => {
  beforeEach(() => {
    forgetTopics();
    forgetBank();
    forgetSettings();
  });

  it("question create accepts a custom topic and rejects a dead one", async () => {
    const { env, headers } = await adminEnv();
    await env.DB.prepare(MARS_TOPIC).run();
    forgetTopics(); // the table was seeded before the custom row; drop the cached twelve

    const live = await call(env, "/api/admin/questions", {
      method: "POST",
      ...jsonBody(headers, question()),
    });
    expect(live.status).toBe(201);
    expect(((await live.json()) as { id: string }).id).toMatch(/^mars-/);

    const dead = await call(env, "/api/admin/questions", {
      method: "POST",
      ...jsonBody(headers, question({ category: "nope", prompt: "Something else altogether?" })),
    });
    expect(dead.status).toBe(400);
    expect(await errorOf(dead)).toEqual({ code: "invalid_question", message: "Pick a topic." });
  });

  it("question edit keeps its category whatever the body asks for", async () => {
    const { env, headers } = await adminEnv();
    await env.DB.prepare(MARS_TOPIC).run();
    forgetTopics();
    const created = await call(env, "/api/admin/questions", {
      method: "POST",
      ...jsonBody(headers, question()),
    });
    const { id } = (await created.json()) as { id: string };

    const edited = await call(env, `/api/admin/questions/${id}`, {
      method: "PATCH",
      ...jsonBody(headers, question({ category: "nope", prompt: "Which rover landed first?" })),
    });
    expect(edited.status).toBe(200);
    const detail = (await (
      await call(env, `/api/admin/questions/${id}`, { headers })
    ).json()) as { category: string };
    expect(detail.category).toBe("mars");
  });
});
