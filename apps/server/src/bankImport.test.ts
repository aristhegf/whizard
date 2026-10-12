import { AI_BATCH_SIZE } from "@whizard/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { forgetSettings } from "./settings";
import { createSession } from "./sessions";
import { addUser, testDb } from "./testDb";
import { forgetTopics } from "./topics";

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

/** A signed-in player's request, as the banks page would send it. */
async function playerEnv(
  id: string,
  extra: Partial<Env> = {},
): Promise<{ env: Env; headers: Record<string, string> }> {
  const env = { DB: await testDb(), ...extra } as unknown as Env;
  await addUser(env.DB, id);
  const cookie = (await createSession(env, id, Date.now())).split(";")[0]!;
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

/** Creates a bank and returns its id. */
async function makeBank(env: Env, headers: Record<string, string>): Promise<string> {
  const created = await call(env, "/api/banks", {
    method: "POST",
    ...jsonBody(headers, { name: "Import bank" }),
  });
  expect(created.status).toBe(201);
  const { bank } = (await created.json()) as { bank: { id: string } };
  return bank.id;
}

/** A small keyed CSV: three rows, the second answering by letter, the third with commas and quotes. */
const KEYED_CSV = [
  "question,option1,option2,option3,option4,answer,explanation,reference",
  'Which planet is known as the Red Planet?,Mars,Venus,Jupiter,Saturn,Mars,"Iron oxide dust makes Mars red.",',
  'Which gas do plants absorb?,Oxygen,Carbon dioxide,Nitrogen,Helium,B,"Photosynthesis takes in carbon dioxide.",',
  '"What is ""the largest ocean""?",Atlantic,Pacific,Indian,Arctic,Pacific,"It covers about a third of the planet.",',
].join("\n");

/** Stubs the Gemini endpoint; the handler is given the ids the server asked about. */
function stubGemini(handler: (ids: string[]) => Response | { items: unknown[] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("generativelanguage.googleapis.com")) {
        throw new Error(`unexpected fetch to ${url}`);
      }
      const body = JSON.parse(String(init?.body)) as {
        contents: { parts: { text: string }[] }[];
      };
      const text = body.contents[0]!.parts[0]!.text;
      const ids = [...text.matchAll(/id "(q\d+)"/g)].map((match) => match[1]!);
      const result = handler(ids);
      if (result instanceof Response) return result;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(result.items) }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
}

/** The answer the mock gives back for one id: option 0, confident. */
const confident = (id: string) => ({
  id,
  answerIndex: 0,
  explanation: "That’s the right one.",
  reviewNeeded: false,
});

type ImportBody = {
  import: {
    id: string;
    counts: {
      total: number;
      ready: number;
      withKey: number;
      aiAnswered: number;
      needsReview: number;
      pending: number;
    };
    flagged: {
      idx: number;
      row: number;
      answerIndex: number | null;
      review: string;
      source: string;
    }[];
    invalid?: { count: number; notes: { row: number; message: string }[] };
  };
};

const asImport = (response: Response) => response.json() as Promise<ImportBody>;

beforeEach(() => {
  forgetTopics();
  forgetSettings();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("staging a CSV import", () => {
  it("readies keyed rows, flags the rest, and reports what it refused", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const csv = [
      "question,option1,option2,option3,option4,answer,explanation",
      "Quick one?,Alpha,Beta,Gamma,Delta,Alpha,So it is.",
      "Letter key?,Alpha,Beta,Gamma,Delta,C,By letter.",
      "No key here?,Alpha,Beta,Gamma,Delta,,Needs an answer.",
      "Wrong text key?,Alpha,Beta,Gamma,Delta,Epsilon,Doesn’t match.",
      ",Alpha,Beta,Gamma,Delta,Alpha,No question.",
    ].join("\n");

    const started = await call(env, `/api/banks/${bankId}/imports`, {
      method: "POST",
      ...jsonBody(headers, { csv }),
    });
    expect(started.status).toBe(201);
    const { import: staged } = await asImport(started);
    expect(staged.counts).toEqual({
      total: 4,
      ready: 2,
      withKey: 2,
      aiAnswered: 0,
      needsReview: 2,
      pending: 2,
    });
    expect(staged.flagged.map((row) => row.row)).toEqual([4, 5]);
    expect(staged.flagged[0]!.review).toContain("No answer key");
    expect(staged.flagged[1]!.review).toContain("doesn’t match any option");
    expect(staged.invalid?.count).toBe(1);
    expect(staged.invalid?.notes[0]?.message).toContain("question");
  });

  it("refuses a file with the wrong header, and one with no usable rows", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);

    const wrongHeader = await call(env, `/api/banks/${bankId}/imports`, {
      method: "POST",
      ...jsonBody(headers, { csv: "a,b\n1,2" }),
    });
    expect(wrongHeader.status).toBe(400);
    expect((await errorOf(wrongHeader)).message).toContain("option1");

    const noRows = await call(env, `/api/banks/${bankId}/imports`, {
      method: "POST",
      ...jsonBody(headers, { csv: "question,option1,option2,option3,option4\n" }),
    });
    expect(noRows.status).toBe(400);
  });

  it("keeps ownership and origin like the rest of the bank", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const started = await call(env, `/api/banks/${bankId}/imports`, {
      method: "POST",
      ...jsonBody(headers, { csv: KEYED_CSV }),
    });
    const { import: staged } = await asImport(started);

    const { env: otherEnv, headers: otherHeaders } = await playerEnv("eve");
    const theirs = await call(otherEnv, `/api/banks/${bankId}/imports/${staged.id}`, {
      headers: otherHeaders,
    });
    expect(theirs.status).toBe(404);

    const noSession = await call(env, `/api/banks/${bankId}/imports/${staged.id}`);
    expect(noSession.status).toBe(401);

    const badOrigin = await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
      method: "POST",
      headers: { ...headers, Origin: "https://elsewhere.example" },
    });
    expect(badOrigin.status).toBe(403);
  });

  it("replaces an older draft when a new file arrives", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const first = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: KEYED_CSV }),
      }),
    );
    const second = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: KEYED_CSV }),
      }),
    );
    expect(second.import.id).not.toBe(first.import.id);

    const gone = await call(env, `/api/banks/${bankId}/imports/${first.import.id}`, {
      headers,
    });
    expect(gone.status).toBe(404);

    const latest = await call(env, `/api/banks/${bankId}/imports`, { headers });
    expect(((await latest.json()) as ImportBody).import.id).toBe(second.import.id);
  });
});

describe("answering rows with the AI", () => {
  const UNKEYED_CSV = [
    "question,option1,option2,option3,option4,answer,explanation",
    "First?,Alpha,Beta,Gamma,Delta,,,",
    "Second?,Alpha,Beta,Gamma,Delta,,,",
  ].join("\n");

  it("says so plainly when the server has no key configured", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: UNKEYED_CSV }),
      }),
    );

    const answered = await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
      method: "POST",
      headers,
    });
    expect(answered.status).toBe(503);
    const error = await errorOf(answered);
    expect(error.code).toBe("ai_not_configured");
    expect(error.message).toContain("Give every question an answer");

    // The draft is untouched: still two rows waiting.
    const again = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}`, { headers }),
    );
    expect(again.import.counts.pending).toBe(2);
  });

  it("applies confident answers, and keeps the file’s own explanation", async () => {
    stubGemini((ids) => ({ items: ids.map(confident) }));
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: UNKEYED_CSV }),
      }),
    );

    const answered = await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
      method: "POST",
      headers,
    });
    expect(answered.status).toBe(200);
    const { import: next } = await asImport(answered);
    expect(next.counts).toMatchObject({
      aiAnswered: 2,
      ready: 2,
      needsReview: 0,
      pending: 0,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("flags unsure, missing, duplicate and invalid results instead of trusting them", async () => {
    stubGemini((ids) => {
      const items: unknown[] = [
        // The first row: the model admits it isn't sure, but still offers an answer.
        { id: ids[0], answerIndex: 2, explanation: "Maybe.", reviewNeeded: true },
        // The second row arrives twice with conflicting answers, and a junk index once.
        { id: ids[1], answerIndex: 9, explanation: "Out of range.", reviewNeeded: false },
        { id: ids[1], answerIndex: 1, explanation: "Duplicate.", reviewNeeded: false },
      ];
      return { items };
    });
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: UNKEYED_CSV }),
      }),
    );

    const { import: next } = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
        method: "POST",
        headers,
      }),
    );
    const [first, second] = next.flagged;
    expect(first!.answerIndex).toBe(2);
    expect(first!.review).toContain("wasn’t sure");
    expect(second!.answerIndex).toBeNull();
    expect(second!.review).toContain("couldn’t answer");
    expect(next.counts.pending).toBe(1);
  });

  it("comes back busy on 429 without losing the rows, then succeeds on a retry", async () => {
    let fail = true;
    stubGemini((ids) => {
      if (fail) return new Response("slow down", { status: 429 });
      return { items: ids.map(confident) };
    });
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: UNKEYED_CSV }),
      }),
    );

    const busy = await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
      method: "POST",
      headers,
    });
    expect(busy.status).toBe(429);
    expect((await errorOf(busy)).code).toBe("ai_busy");
    const still = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}`, { headers }),
    );
    expect(still.import.counts.pending).toBe(2);

    fail = false;
    const retried = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
        method: "POST",
        headers,
      }),
    );
    expect(retried.import.counts.pending).toBe(0);
  });

  it("flags the batch for a person when the provider breaks", async () => {
    stubGemini(
      () => new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: UNKEYED_CSV }),
      }),
    );

    const { import: next } = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
        method: "POST",
        headers,
      }),
    );
    expect(next.counts.pending).toBe(2);
    for (const row of next.flagged) {
      expect(row.review).toContain("couldn’t answer");
    }
  });

  it("works in batches of the size it promises", async () => {
    const count = AI_BATCH_SIZE + 5;
    const rows = Array.from(
      { length: count },
      (_, i) => `Question ${i}?,Alpha${i},Beta${i},Gamma${i},Delta${i},,`,
    );
    const csv = ["question,option1,option2,option3,option4,answer,explanation", ...rows].join("\n");
    stubGemini((ids) => ({ items: ids.map(confident) }));
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv }),
      }),
    );
    expect(staged.counts.total).toBe(count);

    let next = staged;
    for (let callIndex = 0; next.counts.pending > 0; callIndex++) {
      expect(callIndex).toBeLessThan(10);
      next = (
        await asImport(
          await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
            method: "POST",
            headers,
          }),
        )
      ).import;
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(next.counts.aiAnswered).toBe(count);
  });
});

describe("reviewing and committing", () => {
  const MIXED_CSV = [
    "question,option1,option2,option3,option4,answer,explanation",
    "Keyed?,Alpha,Beta,Gamma,Delta,Alpha,Keyed so.",
    "Unkeyed?,Alpha,Beta,Gamma,Delta,,Waiting.",
  ].join("\n");

  async function stageMixed() {
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: MIXED_CSV }),
      }),
    );
    return { env, headers, bankId, staged };
  }

  it("accepts flagged AI answers and sets rows by hand, needing an explanation", async () => {
    stubGemini((ids) => ({
      items: [{ id: ids[0]!, answerIndex: 3, explanation: "Suggested.", reviewNeeded: true }],
    }));
    const { env, headers, bankId, staged } = await stageMixed();

    const { import: flagged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}/answers`, {
        method: "POST",
        headers,
      }),
    );
    expect(flagged.counts.needsReview).toBe(1);
    expect(flagged.flagged[0]!.source).toBe("ai");

    const accepted = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${staged.id}/rows`, {
        method: "PATCH",
        ...jsonBody(headers, { acceptAi: true }),
      }),
    );
    expect(accepted.import.counts.needsReview).toBe(0);

    // A hand-set row still needs its explanation.
    stubGemini((ids) => ({ items: ids.map(confident) }));
    const { import: second } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: MIXED_CSV }),
      }),
    );
    const noExplanation = await call(env, `/api/banks/${bankId}/imports/${second.id}/rows`, {
      method: "PATCH",
      ...jsonBody(headers, { set: [{ idx: 1, answerIndex: 1, explanation: "   " }] }),
    });
    expect(noExplanation.status).toBe(400);

    const set = await asImport(
      await call(env, `/api/banks/${bankId}/imports/${second.id}/rows`, {
        method: "PATCH",
        ...jsonBody(headers, {
          set: [{ idx: 1, answerIndex: 1, explanation: "Picked by hand." }],
        }),
      }),
    );
    expect(set.import.counts).toMatchObject({ ready: 2, needsReview: 0, pending: 0 });
  });

  it("refuses to commit a draft that isn’t ready, and leaves the bank alone", async () => {
    const { env, headers, bankId, staged } = await stageMixed();
    const early = await call(env, `/api/banks/${bankId}/imports/${staged.id}/commit`, {
      method: "POST",
      headers,
    });
    expect(early.status).toBe(400);
    expect((await errorOf(early)).code).toBe("import_unready");

    const detail = (await (await call(env, `/api/banks/${bankId}`, { headers })).json()) as {
      bank: { questionCount: number };
    };
    expect(detail.bank.questionCount).toBe(0);
  });

  it("commits the whole draft atomically, normalising the answer to the front", async () => {
    const { env, headers, bankId, staged } = await stageMixed();
    await call(env, `/api/banks/${bankId}/imports/${staged.id}/rows`, {
      method: "PATCH",
      ...jsonBody(headers, { set: [{ idx: 1, answerIndex: 2, explanation: "Chosen." }] }),
    });

    const committed = await call(env, `/api/banks/${bankId}/imports/${staged.id}/commit`, {
      method: "POST",
      headers,
    });
    expect(committed.status).toBe(200);
    expect(((await committed.json()) as { added: number }).added).toBe(2);

    const detail = (await (await call(env, `/api/banks/${bankId}`, { headers })).json()) as {
      bank: { questionCount: number; questions: { prompt: string; choices: string[] }[] };
    };
    expect(detail.bank.questionCount).toBe(2);
    expect(detail.bank.questions.map((q) => q.prompt)).toEqual(["Keyed?", "Unkeyed?"]);
    // The bank's shape: the correct answer first, the rest in their original order.
    expect(detail.bank.questions[0]!.choices).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    expect(detail.bank.questions[1]!.choices).toEqual(["Gamma", "Alpha", "Beta", "Delta"]);

    // The draft is gone with the commit.
    const after = await call(env, `/api/banks/${bankId}/imports/${staged.id}`, { headers });
    expect(after.status).toBe(404);
  });

  it("discards a draft without touching the bank", async () => {
    const { env, headers, bankId, staged } = await stageMixed();
    const discarded = await call(env, `/api/banks/${bankId}/imports/${staged.id}`, {
      method: "DELETE",
      headers,
    });
    expect(discarded.status).toBe(200);
    const gone = await call(env, `/api/banks/${bankId}/imports/${staged.id}`, { headers });
    expect(gone.status).toBe(404);
    const detail = (await (await call(env, `/api/banks/${bankId}`, { headers })).json()) as {
      bank: { questionCount: number };
    };
    expect(detail.bank.questionCount).toBe(0);
  });

  it("refuses an import that would overflow the bank", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const rows = Array.from(
      { length: 5 },
      (_, i) => `Overflow ${i}?,A${i},B${i},C${i},D${i},A${i},Because.`,
    );
    const csv = ["question,option1,option2,option3,option4,answer,explanation", ...rows].join("\n");
    // Pretend the bank is already nearly full.
    await env.DB.prepare(
      `INSERT INTO user_bank_questions
         (id, bank_id, position, prompt, choices, explanation, reference, created_at, updated_at)
       VALUES ('q_full', ?, 1, 'Existing?', '["A","B","C","D"]', 'So.', NULL, 0, 0)`,
    )
      .bind(bankId)
      .run();
    for (let i = 2; i <= 999; i++) {
      await env.DB.prepare(
        `INSERT INTO user_bank_questions
           (id, bank_id, position, prompt, choices, explanation, reference, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'So.', NULL, 0, 0)`,
      )
        .bind(`q_pad${i}`, bankId, i, `Pad ${i}?`, JSON.stringify(["A", "B", "C", "D"]))
        .run();
    }

    const refused = await call(env, `/api/banks/${bankId}/imports`, {
      method: "POST",
      ...jsonBody(headers, { csv }),
    });
    expect(refused.status).toBe(400);
    expect((await errorOf(refused)).code).toBe("import_too_large");
  });
});

describe("export", () => {
  it("writes the bank back out as a CSV the importer reads the same answers from", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const { import: staged } = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv: KEYED_CSV }),
      }),
    );
    await call(env, `/api/banks/${bankId}/imports/${staged.id}/commit`, {
      method: "POST",
      headers,
    });

    const exported = await call(env, `/api/banks/${bankId}/export`, { headers });
    expect(exported.status).toBe(200);
    expect(exported.headers.get("Content-Type")).toContain("text/csv");
    expect(exported.headers.get("Content-Disposition")).toContain(".csv");
    const csv = await exported.text();
    expect(csv.split("\n")[0]).toBe(
      "question,option1,option2,option3,option4,answer,explanation,reference",
    );
    // Quoting survives the round trip: the comma-and-quotes question comes back as one cell.
    expect(csv).toContain('"What is ""the largest ocean""?"');
    expect(csv).toContain("Pacific");

    // And the file imports into a fresh bank with every answer intact.
    const otherBank = await makeBank(env, headers);
    const reimported = await asImport(
      await call(env, `/api/banks/${otherBank}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv }),
      }),
    );
    expect(reimported.import.counts).toMatchObject({
      total: 3,
      ready: 3,
      withKey: 3,
      needsReview: 0,
      pending: 0,
    });
    await call(env, `/api/banks/${otherBank}/imports/${reimported.import.id}/commit`, {
      method: "POST",
      headers,
    });
    const detail = (await (await call(env, `/api/banks/${otherBank}`, { headers })).json()) as {
      bank: { questions: { prompt: string; choices: string[] }[] };
    };
    expect(detail.bank.questions.map((q) => q.choices[0])).toEqual([
      "Mars",
      "Carbon dioxide",
      "Pacific",
    ]);
  });

  it("shows an empty bank’s header and nobody else’s bank at all", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers);
    const empty = await call(env, `/api/banks/${bankId}/export`, { headers });
    expect(await empty.text()).toBe(
      "question,option1,option2,option3,option4,answer,explanation,reference\n",
    );

    const { env: otherEnv, headers: otherHeaders } = await playerEnv("eve");
    const theirs = await call(otherEnv, `/api/banks/${bankId}/export`, {
      headers: otherHeaders,
    });
    expect(theirs.status).toBe(404);
  });
});

describe("a thousand questions", () => {
  it("stages, answers, and commits the size the acceptance asks for", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      i % 2 === 0
        ? `Question ${i}?,Yes${i},No${i}a,Maybe${i},Never${i},Yes${i},Because.`
        : `Question ${i}?,Yes${i},No${i}a,Maybe${i},Never${i},,`,
    );
    const csv = ["question,option1,option2,option3,option4,answer,explanation", ...rows].join("\n");
    stubGemini((ids) => ({ items: ids.map(confident) }));
    const { env, headers } = await playerEnv("ada", { GEMINI_API_KEY: "test-key" } as Partial<Env>);
    const bankId = await makeBank(env, headers);

    const started = await asImport(
      await call(env, `/api/banks/${bankId}/imports`, {
        method: "POST",
        ...jsonBody(headers, { csv }),
      }),
    );
    expect(started.import.counts).toMatchObject({ total: 1000, withKey: 500, pending: 500 });

    let next = started.import;
    for (let guard = 0; next.counts.pending > 0; guard++) {
      expect(guard).toBeLessThan(100);
      next = (
        await asImport(
          await call(env, `/api/banks/${bankId}/imports/${started.import.id}/answers`, {
            method: "POST",
            headers,
          }),
        )
      ).import;
    }
    expect(next.counts).toMatchObject({
      ready: 1000,
      withKey: 500,
      aiAnswered: 500,
      needsReview: 0,
      pending: 0,
    });

    const committed = await call(env, `/api/banks/${bankId}/imports/${started.import.id}/commit`, {
      method: "POST",
      headers,
    });
    expect(committed.status).toBe(200);
    const detail = (await (await call(env, `/api/banks/${bankId}`, { headers })).json()) as {
      bank: { questionCount: number; questions: { choices: string[] }[] };
    };
    expect(detail.bank.questionCount).toBe(1000);
    // Every answer sits first, however it was decided.
    for (const [i, question] of detail.bank.questions.entries()) {
      expect(question.choices[0]).toBe(`Yes${i}`);
    }
  }, 30_000);
});
