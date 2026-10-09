import { questionVersion, type StoredQuestion } from "@whizard/content";
import { QUIZ_CATEGORIES } from "@whizard/game-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetBank, type Bank } from "./bank";
import type { Env } from "./env";
import { forgetSettings } from "./settings";
import { testDb } from "./testDb";
import {
  categoriesPayload,
  customCounts,
  forgetTopics,
  getTopics,
  hasQuestions,
  nextSlug,
  playableCounts,
  slugify,
} from "./topics";

// The Worker's Durable Object base isn't Node's to load; the routes under test never touch one.
vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
const app = (await import("./index")).default;

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

/** A request through the real route table, as the runtime would hand it over. */
async function call(env: Env, path: string): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`), env, ctx);
}

// The migration as plain text. Node is named at run time so the Worker's type check doesn't go
// looking for its modules, as in testDb.ts; the `URL` and `import.meta` casts are the same ones.
const fsModule = "node:fs";
const fs = (await import(fsModule)) as {
  readFileSync(path: URL, encoding: "utf8"): string;
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
