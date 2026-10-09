import type { StoredQuestion } from "@whizard/content";
import { QUIZ_CATEGORIES } from "@whizard/game-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { parseImportText, planImport, rowToQuestion, type ImportRow } from "./adminImport";
import { forgetBank } from "./bank";
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

/** One row of the bank's own shape, as a JSON question file writes it. */
function stored(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "whizard-easy-001",
    category: "bible",
    topic: "Genesis",
    difficulty: "easy",
    prompt: "Who was the first man created by God?",
    choices: ["Adam", "Moses", "Abraham", "David"],
    explanation: "God formed Adam from the dust of the ground and breathed life into him.",
    reference: "Genesis 2:7",
    ...over,
  };
}

/** The same question in the flat shape a spreadsheet writes: one column per answer. */
function flat(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topic: "Bible",
    level: "Easy",
    sub_topic: "Genesis",
    question: "Who was the first man created by God?",
    correct_answer: "Adam",
    wrong_answer_1: "Moses",
    wrong_answer_2: "Abraham",
    wrong_answer_3: "David",
    explanation: "God formed Adam from the dust of the ground and breathed life into him.",
    verse_reference: "Genesis 2:7",
    ...over,
  };
}

function questionOf(data: unknown, topics: readonly { id: string; name: string }[] = QUIZ_CATEGORIES): StoredQuestion {
  const built = rowToQuestion(data, topics);
  if ("error" in built) throw new Error(built.error);
  return built.question;
}

function errorOf(data: unknown, topics: readonly { id: string; name: string }[] = QUIZ_CATEGORIES): string {
  const built = rowToQuestion(data, topics);
  return "error" in built ? built.error : "expected an error, got a question";
}

const row = (data: unknown, at = 1): ImportRow => ({ row: at, data });

describe("reading an import file", () => {
  it("reads the bank's own rows from a JSON array", () => {
    const rows = parseImportText(JSON.stringify([stored()]), "questions.json");
    expect(rows).toEqual([{ row: 1, data: stored() }]);
  });

  it("numbers rows from the file", () => {
    const rows = parseImportText(JSON.stringify([{}, {}, {}]), "questions.json");
    expect(rows.map((r) => r.row)).toEqual([1, 2, 3]);
  });

  it("refuses JSON that isn't a file of questions", () => {
    expect(() => parseImportText("{oops", "q.json")).toThrow(/valid JSON/);
    expect(() => parseImportText('{"prompt":"x"}', "q.json")).toThrow(/array of questions/);
  });

  it("reads CSV with the bank's columns, through quoting, BOM and line breaks", () => {
    const csv =
      "\uFEFFid,Category,topic,Difficulty,prompt,choice_1,choice_2,choice_3,choice_4,explanation,reference\r\n" +
      'whizard-easy-027,bible,Daniel,easy,"What were the names of Daniel’s three friends who were thrown into a fiery furnace?","Shadrach, Meshach, and Abednego","Peter, James, and John","Cain, Abel, and Seth","Gideon, Samson, and Samuel","They refused to bow to King Nebuchadnezzar\'s golden statue.","Daniel 3:19-20"\r\n' +
      "whizard-easy-010,bible,Exodus,easy,Who led Israel out of Egypt?,Moses,Aaron,Joshua,Elijah,God called him from a bush.,Exodus 3:10\r\n";
    const rows = parseImportText(csv, "questions.csv");
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
    const question = questionOf(rows[0]!.data);
    expect(question.id).toBe(""); // Ids are assigned while planning, never taken from the file.
    expect(question.choices[0]).toBe("Shadrach, Meshach, and Abednego");
    expect(question.reference).toBe("Daniel 3:19-20");
    expect(questionOf(rows[1]!.data).prompt).toBe("Who led Israel out of Egypt?");
  });

  it("keeps a line break inside quotes on one row", () => {
    const csv =
      "category,topic,difficulty,prompt,choice_1,choice_2,choice_3,choice_4,explanation,reference\r\n" +
      'bible,Genesis,easy,"Who built\r\nan ark?",Noah,Moses,Job,Abraham,God told Noah.,Genesis 6:14\r\n' +
      "bible,Exodus,easy,Who led Israel out?,Moses,Aaron,Joshua,Elijah,God called him.,Exodus 3:10\r\n";
    const rows = parseImportText(csv, "q.csv");
    expect(rows.map((r) => r.row)).toEqual([2, 3]);
    expect(questionOf(rows[0]!.data).prompt).toBe("Who built\nan ark?");
  });

  it("reads flat CSV columns too", () => {
    const csv =
      "topic,level,sub_topic,question,correct_answer,wrong_answer_1,wrong_answer_2,wrong_answer_3,explanation,verse_reference\r\n" +
      "Bible,Easy,Genesis,Who was the first man created by God?,Adam,Moses,Abraham,David,God formed Adam.,Genesis 2:7\r\n";
    const rows = parseImportText(csv, "questions.csv");
    expect(questionOf(rows[0]!.data)).toEqual({
      id: "",
      category: "bible",
      topic: "Genesis",
      difficulty: "easy",
      prompt: "Who was the first man created by God?",
      choices: ["Adam", "Moses", "Abraham", "David"],
      explanation: "God formed Adam.",
      reference: "Genesis 2:7",
    });
  });

  it("names the columns a CSV is missing", () => {
    const csv = "topic,level,sub_topic,question,correct_answer\r\nBible,Easy,Genesis,Who?,Adam\r\n";
    expect(() => parseImportText(csv, "q.csv")).toThrow(/needs these columns:.*wrong_answer_1/);
  });

  it("explains a CSV whose header it doesn't know, and an empty file", () => {
    expect(() => parseImportText("name,score\nBob,3", "q.csv")).toThrow(
      /header row with these columns/,
    );
    expect(() => parseImportText("", "q.csv")).toThrow(/empty/);
  });
});

describe("checking a row", () => {
  it("maps a JSON row onto a stored question", () => {
    expect(questionOf(stored())).toEqual({
      id: "",
      category: "bible",
      topic: "Genesis",
      difficulty: "easy",
      prompt: "Who was the first man created by God?",
      choices: ["Adam", "Moses", "Abraham", "David"],
      explanation: "God formed Adam from the dust of the ground and breathed life into him.",
      reference: "Genesis 2:7",
    });
  });

  it("maps the flat shape onto the same question", () => {
    expect(questionOf(flat())).toEqual({ ...questionOf(stored()), id: "" });
  });

  it("accepts every topic name and id, in any case", () => {
    for (const category of QUIZ_CATEGORIES) {
      expect(questionOf(stored({ category: category.name })).category).toBe(category.id);
      expect(questionOf(stored({ category: category.id.toUpperCase() })).category).toBe(
        category.id,
      );
    }
  });

  it("matches a live custom topic by name or id, in any case", () => {
    const topics = [...QUIZ_CATEGORIES, { id: "mars", name: "Mars" }];
    expect(questionOf(stored({ category: "mars" }), topics).category).toBe("mars");
    expect(questionOf(stored({ category: "Mars" }), topics).category).toBe("mars");
    expect(questionOf(stored({ category: "MARS" }), topics).category).toBe("mars");
  });

  it("treats a blank level as easy and refuses an unknown one", () => {
    expect(questionOf(stored({ difficulty: "" })).difficulty).toBe("easy");
    expect(questionOf(stored({ difficulty: "Easy" })).difficulty).toBe("easy");
    expect(errorOf(stored({ difficulty: "brutal" }))).toMatch(/Unknown level “brutal”/);
  });

  it("names an unknown topic and lists the topics", () => {
    expect(errorOf(stored({ category: "Basket weaving" }))).toMatch(
      /^Unknown topic “Basket weaving”\. Topics are: Bible,/,
    );
  });

  it("keeps the limits the single-question form keeps", () => {
    expect(errorOf(stored({ prompt: "x".repeat(121) }))).toMatch(
      /The question can be up to 120 characters/,
    );
    expect(errorOf(stored({ choices: ["Adam", "y".repeat(41), "Moses", "David"] }))).toMatch(
      /The second answer can be up to 40 characters/,
    );
    expect(errorOf(stored({ explanation: "z".repeat(161) }))).toMatch(
      /The explanation can be up to 160 characters/,
    );
  });

  it("needs a verse reference for Bible questions only", () => {
    expect(errorOf(stored({ reference: undefined }))).toMatch(
      /Bible questions need a verse reference/,
    );
    expect(
      questionOf(stored({ category: "Science", reference: undefined })).reference,
    ).toBeUndefined();
  });

  it("refuses repeated answers and an answer that gives itself away", () => {
    expect(errorOf(stored({ choices: ["Adam", "adam", "Moses", "David"] }))).toMatch(
      /four answers must all be different/,
    );
    expect(errorOf(stored({ prompt: "Who was Adam, the first man created by God?" }))).toMatch(
      /gives itself away/,
    );
  });

  it("needs four answers, and rows that are objects", () => {
    expect(errorOf(stored({ choices: ["Adam", "Moses", "Abraham"] }))).toMatch(
      /There must be four answers/,
    );
    expect(errorOf("just a line")).toMatch(/must be an object/);
  });

  it("ignores any id the file gives", () => {
    expect(questionOf(stored({ id: "not valid!" })).id).toBe("");
    expect(questionOf(stored({ id: "bible-001" })).id).toBe("");
  });
});

describe("planning an import", () => {
  it("numbers a new row in the category's sequence, ignoring the file's id", () => {
    const plan = planImport([row(stored())], [], QUIZ_CATEGORIES);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.id).toBe("bible-001");
    expect(plan.skipped).toEqual([]);
    expect(plan.errors).toEqual([]);
  });

  it("numbers a row that comes without an id the same way", () => {
    const plan = planImport([row(flat())], [], QUIZ_CATEGORIES);
    expect(plan.add[0]!.id).toBe("bible-001");
  });

  it("continues where the last question of the same topic and level ended", () => {
    // The bank as it ships: Bible numbered 001 to 510, easy first, no gaps.
    const bank = Array.from(
      { length: 510 },
      (_, i) =>
        ({
          id: `bible-${String(i + 1).padStart(3, "0")}`,
          category: "bible",
          topic: "Genesis",
          difficulty: i < 170 ? "easy" : i < 340 ? "medium" : "hard",
          prompt: `Shipped question ${i + 1}`,
          choices: ["One", "Two", "Three", "Four"],
          explanation: "So the numbering is realistic.",
        }) satisfies StoredQuestion,
    );
    const second = stored({
      id: "whizard-easy-002",
      prompt: "Who was the first woman created by God?",
      choices: ["Eve", "Sarah", "Mary", "Ruth"],
      explanation: "God created Eve from one of Adam's ribs to be his helper.",
    });
    const plan = planImport([row(stored()), row(second)], bank, QUIZ_CATEGORIES);
    expect(plan.add.map((q) => q.id)).toEqual(["bible-511", "bible-512"]);
  });

  it("skips a question the bank already asks", () => {
    const bank = [
      {
        id: "bible-001",
        category: "bible",
        topic: "Genesis",
        difficulty: "easy",
        prompt: "Who was the first man created by God?",
        choices: ["Adam", "Moses", "Abraham", "David"],
        explanation: "God formed Adam from the dust of the ground and breathed life into him.",
        reference: "Genesis 2:7",
      } satisfies StoredQuestion,
    ];
    const plan = planImport([row(stored({ id: "whizard-easy-900" }))], bank, QUIZ_CATEGORIES);
    expect(plan.add).toEqual([]);
    expect(plan.skipped).toEqual([{ row: 1, message: "Already asked as bible-001." }]);
  });

  it("skips a row the file already asked", () => {
    const plan = planImport([row(stored(), 1), row(stored({ id: "whizard-easy-002" }), 2)], [], QUIZ_CATEGORIES);
    expect(plan.add).toHaveLength(1);
    expect(plan.skipped).toEqual([{ row: 2, message: "Already asked as bible-001." }]);
  });

  it("skips a fact another topic already asks", () => {
    const bank = [
      {
        id: "general-knowledge-001",
        category: "general-knowledge",
        topic: "Bible stories",
        difficulty: "easy",
        prompt: "Who was the first man created by God?",
        choices: ["Adam", "Moses", "Abraham", "David"],
        explanation: "God formed Adam from the dust of the ground and breathed life into him.",
      } satisfies StoredQuestion,
    ];
    const plan = planImport([row(stored())], bank, QUIZ_CATEGORIES);
    expect(plan.add).toEqual([]);
    expect(plan.skipped[0]!.message).toMatch(/Another topic already asks this/);
  });

  it("takes no notice of an id the file shares with the bank", () => {
    const bank = [
      {
        id: "whizard-easy-001",
        category: "bible",
        topic: "Exodus",
        difficulty: "easy",
        prompt: "Where did Moses receive the Ten Commandments from God?",
        choices: ["Mount Sinai", "Mount Zion", "Mount Carmel", "Mount Ararat"],
        explanation: "God descended on Mount Sinai in fire.",
        reference: "Exodus 19:20",
      } satisfies StoredQuestion,
    ];
    const plan = planImport([row(stored())], bank, QUIZ_CATEGORIES);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.id).toBe("bible-001");
  });

  it("reports rows to fix with their number, and still adds the good ones", () => {
    const plan = planImport([row(flat(), 1), row(stored({ difficulty: "brutal" }), 2)], [], QUIZ_CATEGORIES);
    expect(plan.add).toHaveLength(1);
    expect(plan.skipped).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]!.row).toBe(2);
    expect(plan.errors[0]!.message).toMatch(/Unknown level/);
  });
});

describe("import against the live catalogue", () => {
  beforeEach(() => {
    forgetTopics();
    forgetBank();
    forgetSettings();
  });

  it("matches a renamed topic by its new name and id, and rejects a name that no longer exists", async () => {
    const { env, headers } = await adminEnv();
    const created = await call(env, "/api/admin/topics", {
      method: "POST",
      ...jsonBody(headers, { name: "Biology" }),
    });
    expect(created.status).toBe(201);
    const rename = (name: string) =>
      call(env, "/api/admin/topics/biology", {
        method: "PATCH",
        ...jsonBody(headers, { name }),
      });
    expect((await rename("Life sciences")).status).toBe(200);
    // Renamed again so the intermediate name is no longer any live id or name: a topic's
    // immutable id keeps its original name matching (spec §9 normalised id *or* name), so
    // only a name that never was the id can genuinely die.
    expect((await rename("Natural sciences")).status).toBe(200);

    const file = (category: string, prompt: string, choices: [string, string, string, string]) => ({
      category,
      topic: "Cells",
      difficulty: "easy",
      prompt,
      choices,
      explanation: "First taught in biology class.",
    });
    const response = await call(env, "/api/admin/questions/import", {
      method: "POST",
      ...jsonBody(headers, {
        filename: "biology.json",
        text: JSON.stringify([
          file("Natural sciences", "Which part of a cell holds its DNA?", [
            "Nucleus",
            "Ribosome",
            "Mitochondrion",
            "Golgi apparatus",
          ]),
          file("biology", "What produces a cell's energy?", [
            "Mitochondria",
            "Nucleus",
            "Ribosome",
            "Vacuole",
          ]),
          file("Life sciences", "What assembles proteins?", [
            "Ribosomes",
            "Nucleus",
            "Mitochondria",
            "Lysosome",
          ]),
        ]),
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      added: number;
      errors: { row: number; message: string }[];
    };
    expect(body.added).toBe(2); // the new name and the id both matched the live topic
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]!.row).toBe(3);
    expect(body.errors[0]!.message).toMatch(
      /^Unknown topic “Life sciences”\. Topics are: Bible, /,
    );
    expect(body.errors[0]!.message).toContain("Natural sciences"); // live names, not the old ones
    expect(body.errors[0]!.message).not.toContain("Biology");
  });
});
