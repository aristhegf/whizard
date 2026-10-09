import { questionVersion, type StoredQuestion } from "@whizard/content";
import { QUIZ_CATEGORIES } from "@whizard/game-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetBank, type Bank } from "./bank";
import type { Env } from "./env";
import { forgetSettings, siteSettings } from "./settings";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";
import {
  categoriesPayload,
  customCounts,
  forgetTopics,
  getTopics,
  hasQuestions,
  nextSlug,
  playableCounts,
  slugify,
  webpDimensions,
} from "./topics";

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

// The migration as plain text. Node is named at run time so the Worker's type check doesn't go
// looking for its modules, as in testDb.ts; the `URL` and `import.meta` casts are the same ones.
const fsModule = "node:fs";
const fs = (await import(fsModule)) as {
  readFileSync(path: URL, encoding: "utf8"): string;
  readFileSync(path: URL): Uint8Array;
};
const sql = fs.readFileSync(
  new URL("../migrations/0020_topics.sql", (import.meta as ImportMeta & { url: string }).url),
  "utf8",
);

describe("the topics migration", () => {
  it("seeds exactly the shipped twelve, in order, with taglines and colours", () => {
    const rows = [
      ...sql.matchAll(/\('([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(\[[^\]]*\])', (\d+)\)/g),
    ].map((m) => ({ id: m[1]!, name: m[2]!, tagline: m[3]!, colors: m[4]!, sort: Number(m[5]) }));
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.id)).toEqual(QUIZ_CATEGORIES.map((c) => c.id));
    rows.forEach((row, i) => {
      const shipped = QUIZ_CATEGORIES[i]!;
      expect(row.name).toBe(shipped.name);
      expect(row.tagline).toBe(shipped.tagline);
      expect(row.tagline.length).toBeGreaterThan(0);
      expect(JSON.parse(row.colors)).toEqual([...shipped.colors]);
      expect(row.sort).toBe(i + 1);
    });
  });
});

// The catalogue's fakes: rows as the table returns them, plus the slugs the `first()` probes
// find taken. Any other query gets the same rows or the same empty answer.
function envWith(rows: Record<string, unknown>[], taken: readonly string[] = []): Env {
  return {
    DB: {
      prepare: () => ({
        all: async () => ({ results: rows }),
        bind: (id: string) => ({
          first: async () => (taken.includes(id) ? { exists: 1 } : null),
        }),
      }),
    },
  } as unknown as Env;
}

const d1Row = {
  id: "mars",
  name: "Mars",
  tagline: "Red dust and rovers",
  colors: '["#ff0000","#5a2014"]',
  sort_order: 13,
  has_art: 1,
  art_version: 2,
};

function question(id: string, category: string): StoredQuestion {
  return {
    id,
    category,
    topic: "Topic",
    difficulty: "easy",
    prompt: "Prompt?",
    choices: ["a", "b", "c", "d"],
    explanation: "Because it is.",
  };
}

function bankOf(questions: readonly StoredQuestion[]): Bank {
  const byId = new Map<string, StoredQuestion>(questions.map((item) => [item.id, item]));
  return { questions, find: (id) => byId.get(id), origin: () => "added" };
}

describe("the topic catalogue", () => {
  beforeEach(() => {
    forgetTopics();
  });

  it("returns only D1 rows when the table loads", async () => {
    const topics = await getTopics(envWith([d1Row]));
    expect(topics).toEqual([
      {
        id: "mars",
        name: "Mars",
        tagline: "Red dust and rovers",
        colors: ["#ff0000", "#5a2014"],
        sortOrder: 13,
        hasArt: true,
        artVersion: 2,
      },
    ]);
  });

  it("reads the shipped rows through the real schema", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const topics = await getTopics(env);
    expect(topics.map((topic) => topic.id)).toEqual(QUIZ_CATEGORIES.map((category) => category.id));
    expect(topics.every((topic) => topic.tagline.length > 0)).toBe(true);
  });

  it("falls back to the whole shipped twelve when the database fails", async () => {
    const failing = {
      DB: {
        prepare: () => ({
          all: async () => {
            throw new Error("down");
          },
        }),
      },
    } as unknown as Env;
    const topics = await getTopics(failing);
    expect(topics).toHaveLength(12);
    expect(topics.map((topic) => topic.id)).toEqual(QUIZ_CATEGORIES.map((category) => category.id));
    topics.forEach((topic, i) => {
      const shipped = QUIZ_CATEGORIES[i]!;
      expect(topic.tagline).toBe(shipped.tagline);
      expect(topic.colors).toEqual([...shipped.colors]);
      expect(topic.sortOrder).toBe(i + 1);
      expect(topic.hasArt).toBe(false);
      expect(topic.artVersion).toBe(0);
    });
  });

  it("falls back when the table is empty or every row is malformed", async () => {
    expect(await getTopics(envWith([]))).toHaveLength(12);
    expect(await getTopics(envWith([{ ...d1Row, colors: "not json" }]))).toHaveLength(12);
  });

  it("never merges D1 rows with the fallback", async () => {
    const topics = await getTopics(envWith([d1Row]));
    expect(topics).toHaveLength(1);
    expect(topics.map((topic) => topic.id)).toEqual(["mars"]);
  });

  it("forgetTopics makes the next read query again", async () => {
    let prepares = 0;
    const env = {
      DB: {
        prepare: () => {
          prepares++;
          return { all: async () => ({ results: [d1Row] }) };
        },
      },
    } as unknown as Env;
    await getTopics(env);
    await getTopics(env);
    expect(prepares).toBe(1);
    forgetTopics();
    await getTopics(env);
    expect(prepares).toBe(2);
  });

  it("slugify lowercases, hyphenates and caps at 40", () => {
    expect(slugify("Biology 101!")).toBe("biology-101");
    expect(slugify("!!!")).toBe("topic");
    const long = slugify("ab ".repeat(20));
    expect(long).toHaveLength(40);
    expect(long.endsWith("-")).toBe(false);
  });

  it("nextSlug resolves collisions deterministically", async () => {
    expect(await nextSlug(envWith([], ["biology"]), "Biology")).toBe("biology-2");
    expect(await nextSlug(envWith([], ["biology", "biology-2"]), "Biology")).toBe("biology-3");
  });

  it("hasQuestions is true from either source", async () => {
    const banked = bankOf([question("bible-1", "bible")]);
    expect(await hasQuestions(envWith([]), banked, "bible")).toBe(true);
    expect(await hasQuestions(envWith([], ["bible"]), bankOf([]), "bible")).toBe(true);
    expect(await hasQuestions(envWith([]), bankOf([]), "bible")).toBe(false);
  });

  it("playableCounts skips out-of-play questions", () => {
    const bank = bankOf([question("bible-1", "bible"), question("bible-2", "bible")]);
    expect(playableCounts(bank, new Set(["bible-2"]))).toEqual({
      bible: { easy: 1, medium: 0, hard: 0 },
    });
  });

  it("customCounts groups admins' questions by category", async () => {
    const counts = await customCounts(
      envWith([
        { category: "bible", count: 2 },
        { category: "mars", count: 1 },
      ]),
    );
    expect([...counts]).toEqual([
      ["bible", 2],
      ["mars", 1],
    ]);
  });
});

// A custom topic's row and question, as an admin's insert would leave them: colours parse,
// the row sorts after the shipped twelve, and the question counts from `custom_questions`.
const MARS_TOPIC = `INSERT INTO topics (id, name, tagline, colors, sort_order)
  VALUES ('mars', 'Mars', 'Red dust and rovers', '["#ff0000","#5a2014"]', 13)`;

describe("the public endpoints", () => {
  beforeEach(() => {
    forgetTopics();
    forgetSettings();
    forgetBank();
  });

  it("GET /api/quiz/categories is no-store and ordered", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    await env.DB.prepare(
      `UPDATE topics SET sort_order = CASE id WHEN 'quran' THEN 1 WHEN 'bible' THEN 2 END
        WHERE id IN ('quran', 'bible')`,
    ).run();
    await env.DB.prepare(
      "INSERT INTO site_settings (key, value, updated_at) VALUES ('topics_off', ?, 0)",
    )
      .bind(JSON.stringify(["music"]))
      .run();

    const response = await call(env, "/api/quiz/categories");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { categories } = (await response.json()) as { categories: Record<string, unknown>[] };
    expect(categories.map((category) => category.id)).toEqual([
      "quran",
      "bible",
      "geography",
      "history",
      "science",
      "animals",
      "football",
      "movies",
      "nigerian-culture",
      "general-knowledge",
      "pop-culture",
    ]);
    expect(Object.keys(categories[1]!).sort()).toEqual([
      "art",
      "colors",
      "id",
      "name",
      "questions",
      "tagline",
    ]);
    expect(categories[1]!.art).toBe("/art/topics/bible.webp");
    expect(Object.keys(categories[1]!.questions as object).sort()).toEqual([
      "easy",
      "hard",
      "medium",
    ]);
  });

  it("counts only playable shipped questions", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const five = Array.from({ length: 5 }, (_, i) => question(`bible-custom-${i + 1}`, "bible"));
    const retired = five[4]!;
    await env.DB.prepare(
      "INSERT INTO question_retired (question_id, version, retired_at) VALUES (?, ?, 0)",
    )
      .bind(retired.id, questionVersion(retired))
      .run();
    await env.DB.prepare(MARS_TOPIC).run();
    await env.DB.prepare(
      `INSERT INTO custom_questions
         (id, category, topic, difficulty, prompt, choices, explanation, created_at, updated_at)
       VALUES ('mars-1', 'mars', 'Mars', 'easy', 'How far is Mars?', '["1","2","3","4"]',
               'About 225 million km.', 0, 0)`,
    ).run();

    const payload = await categoriesPayload(env, bankOf(five));
    expect(payload.categories.find((category) => category.id === "bible")!.questions).toEqual({
      easy: 4,
      medium: 0,
      hard: 0,
    });

    const response = await call(env, "/api/quiz/categories");
    const { categories } = (await response.json()) as {
      categories: { id: string; questions: unknown }[];
    };
    expect(categories.find((category) => category.id === "mars")!.questions).toEqual({
      easy: 1,
      medium: 0,
      hard: 0,
    });
  });

  it("GET /api/topics/:id/art serves the blob with immutable caching", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x26, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    await env.DB.prepare(
      "UPDATE topics SET art = ?, art_type = 'image/webp', art_version = 3 WHERE id = 'bible'",
    )
      .bind(bytes)
      .run();

    for (const version of [0, 3]) {
      const response = await call(env, `/api/topics/bible/art?v=${version}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/webp");
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
  });

  it("art falls back to the shipped path", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const response = await call(env, "/api/topics/quran/art");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/art/topics/quran.svg");
  });

  it("art falls back to the generic image", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    await env.DB.prepare(MARS_TOPIC).run();
    const response = await call(env, "/api/topics/mars/art");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/art/games/quiz.webp");
  });

  it("art 404s only for unknown ids", async () => {
    const env = { DB: await testDb() } as unknown as Env;
    const response = await call(env, "/api/topics/does-not-exist/art");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toMatch(/topic/i);
  });
});

// Minimal WebP containers, header bytes only: the server validates the signature and the
// dimensions the header declares, never the picture data behind them.
function ascii(bytes: Uint8Array, at: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
}

function container(kind: string, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  ascii(bytes, 0, "RIFF");
  ascii(bytes, 8, "WEBP");
  ascii(bytes, 12, kind);
  return bytes;
}

function vp8x(width: number, height: number): Uint8Array {
  const bytes = container("VP8X", 30);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

function vp8l(width: number, height: number): Uint8Array {
  const bytes = container("VP8L", 25);
  bytes[20] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  bytes[21] = bits & 0xff;
  bytes[22] = (bits >>> 8) & 0xff;
  bytes[23] = (bits >>> 16) & 0xff;
  bytes[24] = (bits >>> 24) & 0xff;
  return bytes;
}

function vp8(width: number, height: number): Uint8Array {
  const bytes = container("VP8 ", 30);
  bytes[23] = 0x9d;
  bytes[24] = 0x01;
  bytes[25] = 0x2a;
  bytes[26] = width & 0xff;
  bytes[27] = (width >> 8) & 0x3f;
  bytes[28] = height & 0xff;
  bytes[29] = (height >> 8) & 0x3f;
  return bytes;
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

async function postTopic(env: Env, headers: Record<string, string>, name: string) {
  return call(env, "/api/admin/topics", { method: "POST", ...jsonBody(headers, { name }) });
}

async function errorOf(response: Response): Promise<{ code: string; message: string }> {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return body.error;
}

describe("admin topics", () => {
  beforeEach(() => {
    forgetTopics();
    forgetSettings();
    forgetBank();
  });

  it("webpDimensions reads VP8, VP8L and VP8X", async () => {
    expect(webpDimensions(vp8x(640, 480))).toEqual({ width: 640, height: 480 });
    expect(webpDimensions(vp8l(1000, 500))).toEqual({ width: 1000, height: 500 });
    expect(webpDimensions(vp8(320, 240))).toEqual({ width: 320, height: 240 });
    expect(webpDimensions(new Uint8Array(64))).toBeNull();
    const jpeg = new Uint8Array(32);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(webpDimensions(jpeg)).toBeNull();
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(webpDimensions(png)).toBeNull();
    const real = fs.readFileSync(
      new URL(
        "../../web/public/art/topics/bible.webp",
        (import.meta as ImportMeta & { url: string }).url,
      ),
    );
    expect(webpDimensions(real.slice(0, 20))).toBeNull();
    const size = webpDimensions(real);
    expect(size!.width).toBeGreaterThan(0);
    expect(size!.height).toBeGreaterThan(0);
  });

  it("create slugs and rejects duplicates", async () => {
    const { env, headers } = await adminEnv();
    await getTopics(env); // the catalogue is cached, so the create has to drop it
    const created = await postTopic(env, headers, "Biology");
    expect(created.status).toBe(201);
    const { topic } = (await created.json()) as { topic: Record<string, unknown> };
    expect(topic).toEqual({
      id: "biology",
      name: "Biology",
      tagline: "",
      colors: ["#6d5bff", "#1a1747"],
      sortOrder: 13,
      art: "/art/games/quiz.webp",
      artVersion: 0,
      off: false,
      questionCount: 0,
    });
    expect((await getTopics(env)).map((t) => t.id)).toContain("biology");

    const again = await postTopic(env, headers, "biology");
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toEqual({
      code: "topic_exists",
      message: "A topic with that name already exists.",
    });

    const empty = await postTopic(env, headers, "   ");
    expect(empty.status).toBe(400);
    expect((await errorOf(empty)).message).toBe("Pick a topic.");

    const badColors = await call(env, "/api/admin/topics", {
      method: "POST",
      ...jsonBody(headers, { name: "Art", colors: ["red", "blue"] }),
    });
    expect(badColors.status).toBe(400);
  });

  it("rename keeps the id", async () => {
    const { env, headers } = await adminEnv();
    await postTopic(env, headers, "Biology");
    await getTopics(env);
    const renamed = await call(env, "/api/admin/topics/biology", {
      method: "PATCH",
      ...jsonBody(headers, { name: "Life sciences" }),
    });
    expect(renamed.status).toBe(200);
    const { topic } = (await renamed.json()) as { topic: { id: string; name: string } };
    expect(topic.id).toBe("biology");
    expect(topic.name).toBe("Life sciences");
    const topics = await getTopics(env);
    expect(topics.find((t) => t.id === "biology")!.name).toBe("Life sciences");

    const clash = await postTopic(env, headers, "Life Sciences");
    expect(clash.status).toBe(409);
    expect((await errorOf(clash)).message).toBe("A topic with that name already exists.");
  });

  it("delete refuses non-empty and strips availability on success", async () => {
    const { env, headers } = await adminEnv();
    await postTopic(env, headers, "Mars");
    await env.DB.prepare(
      `INSERT INTO custom_questions
         (id, category, topic, difficulty, prompt, choices, explanation, created_at, updated_at)
       VALUES ('mars-1', 'mars', 'Mars', 'easy', 'How far is Mars?', '["1","2","3","4"]',
               'About 225 million km.', 0, 0)`,
    ).run();
    await env.DB.prepare(
      "INSERT INTO site_settings (key, value, updated_at) VALUES ('topics_off', ?, 0)",
    )
      .bind(JSON.stringify(["mars"]))
      .run();
    await env.DB.prepare(
      "INSERT INTO site_settings (key, value, updated_at) VALUES ('quiz_defaults', ?, 0)",
    )
      .bind(JSON.stringify({ category: "mars" }))
      .run();
    // The create's own listing cached the settings before these inserts; drop that copy.
    forgetSettings();
    const before = await siteSettings(env); // cached, so the delete has to drop it
    expect(before.topicsOff).toContain("mars");

    const refused = await call(env, "/api/admin/topics/mars", { method: "DELETE", headers });
    expect(refused.status).toBe(409);
    expect(await errorOf(refused)).toEqual({
      code: "topic_has_questions",
      message: "That topic has questions — delete them first.",
    });
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM custom_questions").first<{ n: number }>())!
        .n,
    ).toBe(1);
    expect(await env.DB.prepare("SELECT id FROM topics WHERE id = 'mars'").first()).not.toBeNull();

    await env.DB.prepare("DELETE FROM custom_questions WHERE category = 'mars'").run();
    forgetBank(); // the merged bank is cached too; the question behind the guard is gone
    const deleted = await call(env, "/api/admin/topics/mars", { method: "DELETE", headers });
    expect(deleted.status).toBe(204);
    expect(await env.DB.prepare("SELECT id FROM topics WHERE id = 'mars'").first()).toBeNull();
    expect((await getTopics(env)).map((topic) => topic.id)).not.toContain("mars");
    const after = await siteSettings(env);
    expect(after.topicsOff).not.toContain("mars");
    expect(after.quizDefaults.category).toBe("bible");
  });

  it("upload validates signature, size and dimensions", async () => {
    const { env, headers } = await adminEnv();
    await getTopics(env); // cached, so an upload has to drop it for the list to see the bump
    const put = (body: Uint8Array) =>
      call(env, "/api/admin/topics/bible/art", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "image/webp" },
        body,
      });

    const uploaded = await put(vp8x(512, 512));
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toEqual({ version: 1 });
    const list = (await (await call(env, "/api/admin/topics", { headers })).json()) as {
      topics: { id: string; art: string; artVersion: number }[];
    };
    const bible = list.topics.find((topic) => topic.id === "bible")!;
    expect(bible.artVersion).toBe(1);
    expect(bible.art).toBe("/api/topics/bible/art?v=1");

    const jpeg = new Uint8Array(64);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    const wrongFormat = await put(jpeg);
    expect(wrongFormat.status).toBe(415);
    expect((await errorOf(wrongFormat)).code).toBe("bad_art");

    const fat = new Uint8Array(400_001);
    fat.set(vp8x(512, 512));
    const tooLarge = await put(fat);
    expect(tooLarge.status).toBe(413);
    expect((await errorOf(tooLarge)).code).toBe("art_too_large");

    for (const size of [
      [3000, 3000],
      [16, 16],
    ]) {
      const wrongSize = await put(vp8x(size[0]!, size[1]!));
      expect(wrongSize.status).toBe(413);
      expect((await errorOf(wrongSize)).code).toBe("art_too_big");
    }
  });

  it("every admin route sets no-store", async () => {
    const { env, headers } = await adminEnv();
    const read = await call(env, "/api/admin/topics", { headers });
    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toBe("no-store");

    const created = await postTopic(env, headers, "No Store");
    expect(created.status).toBe(201);
    expect(created.headers.get("Cache-Control")).toBe("no-store");

    const patched = await call(env, "/api/admin/topics/no-store", {
      method: "PATCH",
      ...jsonBody(headers, { tagline: "Fresh every time" }),
    });
    expect(patched.status).toBe(200);
    expect(patched.headers.get("Cache-Control")).toBe("no-store");

    const art = await call(env, "/api/admin/topics/no-store/art", {
      method: "PUT",
      headers: { ...headers, "Content-Type": "image/webp" },
      body: vp8x(256, 256),
    });
    expect(art.status).toBe(200);
    expect(art.headers.get("Cache-Control")).toBe("no-store");

    const removed = await call(env, "/api/admin/topics/no-store", { method: "DELETE", headers });
    expect(removed.status).toBe(204);
    expect(removed.headers.get("Cache-Control")).toBe("no-store");
  });

  it("nextSlug gives up probing and stamps the id instead", async () => {
    const busy = {
      DB: {
        prepare: () => ({
          all: async () => ({ results: [] }),
          bind: () => ({ first: async () => ({ exists: 1 }) }),
        }),
      },
    } as unknown as Env;
    const id = await nextSlug(busy, "Biology");
    expect(id.startsWith("biology")).toBe(true);
    expect(id).not.toBe("biology");
    expect(id.length).toBeLessThanOrEqual(40);
  });
});
