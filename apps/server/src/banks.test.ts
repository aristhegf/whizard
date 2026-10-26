import { beforeEach, describe, expect, it, vi } from "vitest";
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
async function playerEnv(id: string): Promise<{ env: Env; headers: Record<string, string> }> {
  const env = { DB: await testDb() } as unknown as Env;
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

/** A question the form could post. */
function question(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    prompt: "Which planet is known as the Red Planet?",
    choices: ["Mars", "Venus", "Jupiter", "Saturn"],
    explanation: "Iron oxide dust gives Mars its red colour.",
    reference: null,
    ...over,
  };
}

/** Creates a bank and returns its id. */
async function makeBank(
  env: Env,
  headers: Record<string, string>,
  name = "Science mix",
): Promise<string> {
  const created = await call(env, "/api/banks", {
    method: "POST",
    ...jsonBody(headers, { name }),
  });
  expect(created.status).toBe(201);
  const { bank } = (await created.json()) as { bank: { id: string } };
  return bank.id;
}

beforeEach(() => {
  forgetTopics();
  forgetSettings();
});

describe("owning a bank", () => {
  it("creates, lists, renames and deletes a bank", async () => {
    const { env, headers } = await playerEnv("ada");

    const empty = await call(env, "/api/banks", { headers });
    expect(((await empty.json()) as { banks: unknown[] }).banks).toEqual([]);

    const created = await call(env, "/api/banks", {
      method: "POST",
      ...jsonBody(headers, { name: "Science mix", exam: "WAEC", subject: "Biology" }),
    });
    expect(created.status).toBe(201);
    const { bank } = (await created.json()) as {
      bank: { id: string; name: string; questionCount: number };
    };
    expect(bank.name).toBe("Science mix");
    expect(bank.questionCount).toBe(0);

    const listed = (await (await call(env, "/api/banks", { headers })).json()) as {
      banks: { id: string; questionCount: number }[];
    };
    expect(listed.banks).toHaveLength(1);
    expect(listed.banks[0]!.id).toBe(bank.id);

    const renamed = await call(env, `/api/banks/${bank.id}`, {
      method: "PATCH",
      ...jsonBody(headers, { name: "Biology revamp" }),
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { bank: { name: string } }).bank.name).toBe("Biology revamp");
    // Fields left out of a rename stay as they were.
    const detail = (await (await call(env, `/api/banks/${bank.id}`, { headers })).json()) as {
      bank: { exam: string | null; subject: string | null };
    };
    expect(detail.bank.exam).toBe("WAEC");
    expect(detail.bank.subject).toBe("Biology");

    const deleted = await call(env, `/api/banks/${bank.id}`, {
      method: "DELETE",
      headers,
    });
    expect(deleted.status).toBe(200);
    const after = (await (await call(env, "/api/banks", { headers })).json()) as {
      banks: unknown[];
    };
    expect(after.banks).toEqual([]);
  });

  it("reads as not found for everyone but the owner", async () => {
    const ada = await playerEnv("ada");
    const bob = await playerEnv("bob");
    const id = await makeBank(ada.env, ada.headers);

    // Bob is signed in, so this is a 404 rather than a 401 — Ada's bank doesn't exist for him.
    const read = await call(bob.env, `/api/banks/${id}`, { headers: bob.headers });
    expect(read.status).toBe(404);

    const rename = await call(bob.env, `/api/banks/${id}`, {
      method: "PATCH",
      ...jsonBody(bob.headers, { name: "Bob’s bank" }),
    });
    expect(rename.status).toBe(404);

    const remove = await call(bob.env, `/api/banks/${id}`, {
      method: "DELETE",
      headers: bob.headers,
    });
    expect(remove.status).toBe(404);

    // Ada's bank is untouched.
    const still = await call(ada.env, `/api/banks/${id}`, { headers: ada.headers });
    expect(still.status).toBe(200);
  });

  it("rejects a signed-out or cross-origin write", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers);

    // Our own page, but with no session: the same-origin check passes, auth doesn't.
    const signedOut = await call(env, "/api/banks", {
      method: "POST",
      headers: { Origin: "http://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(signedOut.status).toBe(401);

    const foreign = await call(env, `/api/banks/${id}`, {
      method: "PATCH",
      headers: { ...headers, Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stolen" }),
    });
    expect(foreign.status).toBe(403);
  });

  it("rejects an empty name", async () => {
    const { env, headers } = await playerEnv("ada");
    const created = await call(env, "/api/banks", {
      method: "POST",
      ...jsonBody(headers, { name: "   " }),
    });
    expect(created.status).toBe(400);
    expect((await errorOf(created)).message).toBe("The bank’s name can’t be empty.");
  });
});

describe("questions in a bank", () => {
  it("adds, lists, edits and deletes a question", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers);

    const added = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question()),
    });
    expect(added.status).toBe(201);
    const { question: first } = (await added.json()) as { question: { id: string } };
    expect(first.id).toMatch(/^q_/);

    const detail = (await (await call(env, `/api/banks/${id}`, { headers })).json()) as {
      bank: { questionCount: number; questions: { prompt: string; choices: string[] }[] };
    };
    expect(detail.bank.questionCount).toBe(1);
    expect(detail.bank.questions[0]!.prompt).toMatch(/Red Planet/);
    expect(detail.bank.questions[0]!.choices[0]).toBe("Mars");

    const edited = await call(env, `/api/banks/${id}/questions/${first.id}`, {
      method: "PATCH",
      ...jsonBody(headers, question({ prompt: "Which planet is called the Red Planet?" })),
    });
    expect(edited.status).toBe(200);
    const afterEdit = (await (await call(env, `/api/banks/${id}`, { headers })).json()) as {
      bank: { questions: { prompt: string }[] };
    };
    expect(afterEdit.bank.questions[0]!.prompt).toMatch(/called the Red Planet/);

    const removed = await call(env, `/api/banks/${id}/questions/${first.id}`, {
      method: "DELETE",
      headers,
    });
    expect(removed.status).toBe(200);
    const empty = (await (await call(env, `/api/banks/${id}`, { headers })).json()) as {
      bank: { questionCount: number; questions: unknown[] };
    };
    expect(empty.bank.questionCount).toBe(0);
    expect(empty.bank.questions).toEqual([]);
  });

  it("keeps other people out of the question routes", async () => {
    const ada = await playerEnv("ada");
    const bob = await playerEnv("bob");
    const id = await makeBank(ada.env, ada.headers);
    const added = await call(ada.env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(ada.headers, question()),
    });
    const { question: q } = (await added.json()) as { question: { id: string } };

    const bobWrite = await call(bob.env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(bob.headers, question({ prompt: "Something else?" })),
    });
    expect(bobWrite.status).toBe(404);

    const bobEdit = await call(bob.env, `/api/banks/${id}/questions/${q.id}`, {
      method: "PATCH",
      ...jsonBody(bob.headers, question({ prompt: "Bob was here?" })),
    });
    expect(bobEdit.status).toBe(404);

    const bobDelete = await call(bob.env, `/api/banks/${id}/questions/${q.id}`, {
      method: "DELETE",
      headers: bob.headers,
    });
    expect(bobDelete.status).toBe(404);
  });

  it("refuses questions the shipped bank's quality checks would refuse", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers);

    const notFour = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ choices: ["Mars", "Venus"] })),
    });
    expect(notFour.status).toBe(400);
    expect((await errorOf(notFour)).message).toBe("There must be four answers.");

    const twinAnswers = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ choices: ["Mars", "Mars", "Jupiter", "Saturn"] })),
    });
    expect(twinAnswers.status).toBe(400);
    expect((await errorOf(twinAnswers)).message).toBe("The four answers must all be different.");

    const givesItAway = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(
        headers,
        question({ prompt: "Is it Mars or Venus that is called the Red Planet?" }),
      ),
    });
    expect(givesItAway.status).toBe(400);
    expect((await errorOf(givesItAway)).message).toBe(
      "The answer gives itself away in the question.",
    );
  });

  it("refuses a second question that asks the same thing", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers);
    const first = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question()),
    });
    expect(first.status).toBe(201);

    const twin = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ explanation: "Worded differently, same question." })),
    });
    expect(twin.status).toBe(400);
    expect((await errorOf(twin)).message).toMatch(/already have a question/);
  });
});

describe("the account's data", () => {
  it("exports banks with their questions", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers, "Export me");
    await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question()),
    });

    const exported = await call(env, "/api/me/export", { headers });
    const data = (await exported.json()) as {
      questionBanks: { name: string; questions: { prompt: string }[] }[];
    };
    expect(data.questionBanks).toHaveLength(1);
    expect(data.questionBanks[0]!.name).toBe("Export me");
    expect(data.questionBanks[0]!.questions).toHaveLength(1);
  });

  it("deletes banks along with the account", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers);
    await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question()),
    });

    const closed = await call(env, "/api/me", { method: "DELETE", headers });
    expect(closed.status).toBe(200);

    const banks = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_banks").first<{
      n: number;
    }>();
    const questions = await env.DB.prepare("SELECT COUNT(*) AS n FROM user_bank_questions").first<{
      n: number;
    }>();
    expect(banks!.n).toBe(0);
    expect(questions!.n).toBe(0);
  });
});

describe("advanced bank management", () => {
  it("allows reading public banks without authentication", async () => {
    const { env, headers: adaHeaders } = await playerEnv("ada");
    const id = await makeBank(env, adaHeaders, "Public Bank");

    // Make bank public
    const updated = await call(env, `/api/banks/${id}`, {
      method: "PATCH",
      ...jsonBody(adaHeaders, { isPublic: true }),
    });
    expect(updated.status).toBe(200);

    // Read by unauthenticated visitor
    const guestRes = await call(env, `/api/banks/${id}`);
    expect(guestRes.status).toBe(200);
    const body = (await guestRes.json()) as { bank: { name: string; isPublic: boolean } };
    expect(body.bank.name).toBe("Public Bank");
    expect(body.bank.isPublic).toBe(true);

    // Private bank 404s for others
    const privateId = await makeBank(env, adaHeaders, "Private Bank");
    const privateGuestRes = await call(env, `/api/banks/${privateId}`);
    expect(privateGuestRes.status).toBe(404);
  });

  it("deletes multiple questions in one request", async () => {
    const { env, headers } = await playerEnv("ada");
    const id = await makeBank(env, headers);
    const q1Res = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ prompt: "Question one?" })),
    });
    const q1 = ((await q1Res.json()) as { question: { id: string } }).question;

    const q2Res = await call(env, `/api/banks/${id}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ prompt: "Question two?" })),
    });
    const q2 = ((await q2Res.json()) as { question: { id: string } }).question;

    const bulkDel = await call(env, `/api/banks/${id}/questions/bulk-delete`, {
      method: "POST",
      ...jsonBody(headers, { questionIds: [q1.id, q2.id] }),
    });
    expect(bulkDel.status).toBe(200);
    const body = (await bulkDel.json()) as { ok: boolean; deleted: number };
    expect(body.deleted).toBe(2);

    const detail = await call(env, `/api/banks/${id}`, { headers });
    const detailBody = (await detail.json()) as { bank: { questions: unknown[] } };
    expect(detailBody.bank.questions).toHaveLength(0);
  });

  it("detects identical questions across user banks", async () => {
    const { env, headers } = await playerEnv("ada");
    const bank1 = await makeBank(env, headers, "Bank 1");
    const bank2 = await makeBank(env, headers, "Bank 2");

    await call(env, `/api/banks/${bank1}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ prompt: "Shared prompt across banks?" })),
    });

    await call(env, `/api/banks/${bank2}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ prompt: "Shared prompt across banks?" })),
    });

    const check = await call(env, `/api/banks/${bank2}/duplicates`, { headers });
    expect(check.status).toBe(200);
    const body = (await check.json()) as {
      duplicates: { prompt: string; otherBankName: string }[];
    };
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0]!.prompt).toBe("Shared prompt across banks?");
    expect(body.duplicates[0]!.otherBankName).toBe("Bank 1");
  });

  it("exports all banks into one consolidated CSV", async () => {
    const { env, headers } = await playerEnv("ada");
    const bank1 = await makeBank(env, headers, "WAEC Deck");
    await call(env, `/api/banks/${bank1}/questions`, {
      method: "POST",
      ...jsonBody(headers, question({ prompt: "First deck question?" })),
    });

    const exported = await call(env, "/api/banks/export", { headers });
    expect(exported.status).toBe(200);
    const text = await exported.text();
    expect(text).toContain("bank_name,question,option1");
    expect(text).toContain("WAEC Deck");
    expect(text).toContain("First deck question?");
  });

  it("enforces privacy when creating a room with a bank", async () => {
    const { env, headers } = await playerEnv("ada");
    const bankId = await makeBank(env, headers, "Ada's Secrets");
    env.ROOMS = {
      getByName: () => ({
        create: async () => true,
      }),
    } as unknown as Env["ROOMS"];

    const resAda = await call(env, "/api/rooms", {
      method: "POST",
      ...jsonBody(headers, { settings: { bankId, category: "bible" }, game: "quiz" }),
    });
    expect(resAda.status).toBe(201);

    const { headers: headersTolu } = await playerEnv("tolu");
    const resTolu = await call(env, "/api/rooms", {
      method: "POST",
      ...jsonBody(headersTolu, { settings: { bankId, category: "bible" }, game: "quiz" }),
    });
    expect(resTolu.status).toBe(403);
  });

  it("discovers public banks and respects privacy", async () => {
    const { env, headers: adaHeaders } = await playerEnv("ada");
    await addUser(env.DB, "tolu");
    const toluCookie = (await createSession(env, "tolu", Date.now())).split(";")[0]!;
    const toluHeaders = { Cookie: toluCookie, Origin: "http://localhost" };

    const pubBankId = await makeBank(env, adaHeaders, "JAMB Physics");
    await call(env, `/api/banks/${pubBankId}`, {
      method: "PATCH",
      ...jsonBody(adaHeaders, { isPublic: true, exam: "JAMB", subject: "Physics" }),
    });
    await call(env, `/api/banks/${pubBankId}/questions`, {
      method: "POST",
      ...jsonBody(adaHeaders, question({ prompt: "What is velocity?" })),
    });

    const privBankId = await makeBank(env, toluHeaders, "Tolu Private");
    await call(env, `/api/banks/${privBankId}/questions`, {
      method: "POST",
      ...jsonBody(toluHeaders, question({ prompt: "Secret question?" })),
    });

    // Public feed
    const res = await call(env, "/api/banks/public");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      banks: { id: string; name: string; ownerUsername: string; isPublic: boolean }[];
    };
    expect(body.banks.some((b) => b.id === pubBankId)).toBe(true);
    expect(body.banks.some((b) => b.id === privBankId)).toBe(false);

    const found = body.banks.find((b) => b.id === pubBankId)!;
    expect(found.name).toBe("JAMB Physics");
    expect(found.ownerUsername).toBe("ada");
    expect(found.isPublic).toBe(true);

    // Search filter
    const searchRes = await call(env, "/api/banks/public?search=Physics");
    const searchBody = (await searchRes.json()) as { banks: { id: string }[] };
    expect(searchBody.banks.some((b) => b.id === pubBankId)).toBe(true);

    const searchMismatch = await call(env, "/api/banks/public?search=Biology");
    const mismatchBody = (await searchMismatch.json()) as { banks: { id: string }[] };
    expect(mismatchBody.banks.some((b) => b.id === pubBankId)).toBe(false);
  });

  it("forks a public bank into own collection with all questions", async () => {
    const { env, headers: adaHeaders } = await playerEnv("ada");
    await addUser(env.DB, "tolu");
    const toluCookie = (await createSession(env, "tolu", Date.now())).split(";")[0]!;
    const toluHeaders = { Cookie: toluCookie, Origin: "http://localhost" };

    const pubBankId = await makeBank(env, adaHeaders, "WAEC Chemistry");
    await call(env, `/api/banks/${pubBankId}`, {
      method: "PATCH",
      ...jsonBody(adaHeaders, { isPublic: true, exam: "WAEC", subject: "Chemistry" }),
    });
    await call(env, `/api/banks/${pubBankId}/questions`, {
      method: "POST",
      ...jsonBody(adaHeaders, question({ prompt: "What is an electron?" })),
    });

    // Tolu forks Ada's bank
    const forkRes = await call(env, `/api/banks/${pubBankId}/fork`, {
      method: "POST",
      headers: toluHeaders,
    });
    expect(forkRes.status).toBe(201);
    const forked = (await forkRes.json()) as {
      bank: { id: string; name: string; questionCount: number; isPublic: boolean };
    };
    expect(forked.bank.name).toBe("WAEC Chemistry (Copy)");
    expect(forked.bank.questionCount).toBe(1);
    expect(forked.bank.isPublic).toBe(false); // starts private for the cloner

    // Verify questions inside forked bank
    const detailRes = await call(env, `/api/banks/${forked.bank.id}`, { headers: toluHeaders });
    const detail = (await detailRes.json()) as {
      bank: { questions: { prompt: string }[]; isOwner: boolean };
    };
    expect(detail.bank.isOwner).toBe(true);
    expect(detail.bank.questions[0]?.prompt).toBe("What is an electron?");
  });
});
