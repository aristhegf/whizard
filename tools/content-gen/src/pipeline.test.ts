import type { StoredQuestion } from "@whizard/content";
import { describe, expect, it } from "vitest";
import type { CheckItem, Draft, QuestionModel, Verdict } from "./model";
import { growCategory, nextIdNumber, questionId } from "./pipeline";

const draft = (prompt: string, answer: string, overrides: Partial<Draft> = {}): Draft => ({
  topic: "Capitals",
  prompt,
  answer,
  wrong: ["Wrong one", "Wrong two", "Wrong three"],
  explanation: "Because it is.",
  reference: null,
  ...overrides,
});

const existing: StoredQuestion[] = [
  {
    id: "geography-007",
    category: "geography",
    topic: "Capitals",
    difficulty: "easy",
    prompt: "What is the capital of Kenya?",
    choices: ["Nairobi", "Mombasa", "Kampala", "Dodoma"],
    explanation: "Nairobi is Kenya's capital.",
  },
];

/** A fake model that returns fixed drafts and answers every check with the given rule. */
function fakeModel(
  rounds: Draft[][],
  judge: (item: CheckItem) => Partial<Verdict> = () => ({}),
): QuestionModel & { requests: number } {
  const model = {
    requests: 0,
    async write() {
      return rounds[model.requests++] ?? [];
    },
    async check(items: CheckItem[]) {
      return items.map((item) => {
        // The real answer is always one of the "Right …" strings in these tests.
        const choice = item.choices.findIndex((c) => c.startsWith("Right"));
        return { id: item.id, choice, confident: true, problem: "", ...judge(item) };
      });
    },
  };
  return model;
}

const grow = (model: QuestionModel, count = 2) =>
  growCategory({ model, category: "geography", difficulty: "easy", count, existing, seed: 1 });

describe("growCategory", () => {
  it("adds checked questions with the next ids", async () => {
    const model = fakeModel([
      [
        draft("What is the capital of Ghana?", "Right Accra"),
        draft("What is the capital of Mali?", "Right Bamako"),
      ],
    ]);
    const { added, rejected } = await grow(model);
    expect(rejected).toEqual([]);
    expect(added.map((q) => q.id)).toEqual(["geography-008", "geography-009"]);
    expect(added[0]).toMatchObject({
      category: "geography",
      difficulty: "easy",
      choices: ["Right Accra", "Wrong one", "Wrong two", "Wrong three"],
    });
    expect(added[0]).not.toHaveProperty("reference");
  });

  it("rejects drafts that break the rules", async () => {
    const model = fakeModel([
      [
        draft("What is the capital of Ghana?", "Right Accra", { wrong: ["Kumasi", "Tamale"] }),
        draft("Is Right Accra the capital of Ghana?", "Right Accra"),
        draft("What is the capital city of Kenya?", "Nairobi"),
      ],
    ]);
    const { added, rejected } = await grow(model, 1);
    expect(added).toEqual([]);
    expect(rejected.map((r) => r.reason)).toEqual([
      expect.stringMatching(/^invalid/),
      "the answer appears in the prompt",
      expect.stringMatching(/^repeats geography-007/),
    ]);
  });

  it("keeps only questions the independent check agrees with", async () => {
    const model = fakeModel(
      [
        [
          draft("What is the capital of Ghana?", "Right Accra"),
          draft("What is the capital of Mali?", "Right Bamako"),
          draft("What is the capital of Chad?", "Right N'Djamena"),
          draft("What is the capital of Niger?", "Right Niamey"),
        ],
      ],
      (item) =>
        item.prompt.includes("Mali")
          ? { choice: item.choices.indexOf("Wrong one") }
          : item.prompt.includes("Chad")
            ? { confident: false }
            : item.prompt.includes("Niger")
              ? { problem: "Two answers could be right." }
              : {},
    );
    const { added, rejected } = await grow(model, 4);
    expect(added.map((q) => q.prompt)).toEqual(["What is the capital of Ghana?"]);
    expect(rejected.map((r) => r.reason)).toEqual(
      expect.arrayContaining([
        'the checker answered "Wrong one"',
        "the checker wasn't confident",
        "the checker flagged: Two answers could be right.",
      ]),
    );
  });

  it("shuffles choices before checking so the checker can't see the intended answer", async () => {
    const seen: string[][] = [];
    const model = fakeModel(
      [
        [
          draft("What is the capital of Ghana?", "Right Accra"),
          draft("What is the capital of Mali?", "Right Bamako"),
          draft("What is the capital of Togo?", "Right Lomé"),
        ],
      ],
      (item) => {
        seen.push(item.choices);
        return {};
      },
    );
    await grow(model, 3);
    expect(seen.some((choices) => !choices[0]!.startsWith("Right"))).toBe(true);
  });

  it("asks again when too few survive, up to the round limit", async () => {
    const model = fakeModel([
      [draft("What is the capital of Ghana?", "Right Accra")],
      [draft("What is the capital of Mali?", "Right Bamako")],
      [],
      [draft("Never asked?", "Right x")],
    ]);
    const { added } = await grow(model, 5);
    expect(added).toHaveLength(2);
    expect(model.requests).toBe(3);
  });
});

describe("ids", () => {
  it("continue after the highest existing number", () => {
    expect(nextIdNumber("geography", existing)).toBe(8);
    expect(nextIdNumber("history", existing)).toBe(1);
    expect(questionId("history", 7)).toBe("history-007");
  });
});
