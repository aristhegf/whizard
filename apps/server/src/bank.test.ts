import { QUESTIONS } from "@whizard/content";
import { describe, expect, it } from "vitest";
import { forgetBank, loadBank } from "./bank";
import type { Env } from "./env";

function envWith(rows: Record<string, unknown>[]): Env {
  return {
    DB: { prepare: () => ({ all: async () => ({ results: rows }) }) },
  } as unknown as Env;
}

const shipped = QUESTIONS[0]!;

describe("the question bank", () => {
  it("puts admins' edits over the shipped questions and adds their own", async () => {
    forgetBank();
    const bank = await loadBank(
      envWith([
        {
          ...shipped,
          prompt: "An edited prompt?",
          choices: JSON.stringify(shipped.choices),
          reference: shipped.reference ?? null,
        },
        {
          id: "music-aabc12",
          category: "music",
          topic: "Afrobeat",
          difficulty: "easy",
          prompt: "Who pioneered Afrobeat?",
          choices: JSON.stringify(["Fela Kuti", "King Sunny Adé", "Burna Boy", "Wizkid"]),
          explanation: "Fela Kuti created Afrobeat in the late 1960s.",
          reference: null,
        },
      ]),
    );
    expect(bank.questions).toHaveLength(QUESTIONS.length + 1);
    expect(bank.find(shipped.id)?.prompt).toBe("An edited prompt?");
    expect(bank.origin(shipped.id)).toBe("edited");
    expect(bank.origin("music-aabc12")).toBe("added");
    expect(bank.origin(QUESTIONS[1]!.id)).toBe("bank");
  });

  it("falls back to the shipped questions when the database fails", async () => {
    forgetBank();
    const failing = {
      DB: {
        prepare: () => ({
          all: async () => {
            throw new Error("down");
          },
        }),
      },
    } as unknown as Env;
    const bank = await loadBank(failing);
    expect(bank.questions).toBe(QUESTIONS);
  });
});
