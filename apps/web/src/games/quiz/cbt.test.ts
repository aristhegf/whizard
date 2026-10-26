import { describe, expect, it } from "vitest";
import { prepareCbtQuestions } from "./CbtExamScreen";
import type { PlayerBankQuestion } from "@whizard/protocol";

describe("prepareCbtQuestions", () => {
  const sampleQuestions: PlayerBankQuestion[] = [
    {
      id: "q1",
      prompt: "What is the capital of Nigeria?",
      choices: ["Abuja", "Lagos", "Kano", "Ibadan"],
      explanation: "Abuja became the federal capital in 1991.",
      reference: "WAEC 2020",
    },
    {
      id: "q2",
      prompt: "Which organelle produces ATP?",
      choices: ["Mitochondria", "Ribosome", "Nucleus", "Endoplasmic Reticulum"],
      explanation: "Mitochondria are the powerhouses of eukaryotic cells.",
      reference: "JAMB 2019",
    },
    {
      id: "q3",
      prompt: "What is the square root of 144?",
      choices: ["12", "14", "10", "16"],
      explanation: "12 * 12 = 144.",
      reference: null,
    },
  ];

  it("limits questions to requested count", () => {
    const prepared = prepareCbtQuestions(sampleQuestions, 2, false);
    expect(prepared).toHaveLength(2);
  });

  it("caps question count to total available questions", () => {
    const prepared = prepareCbtQuestions(sampleQuestions, 10, false);
    expect(prepared).toHaveLength(3);
  });

  it("accurately tracks the correct choice index after choice shuffling", () => {
    // Run multiple iterations to ensure shuffle positions vary while correct choice index is always exact
    for (let i = 0; i < 10; i++) {
      const prepared = prepareCbtQuestions(sampleQuestions, 3, false);
      const q1 = prepared.find((q) => q.id === "q1")!;
      expect(q1.choices).toHaveLength(4);
      expect(q1.choices).toContain("Abuja");
      expect(q1.choices).toContain("Lagos");
      expect(q1.choices).toContain("Kano");
      expect(q1.choices).toContain("Ibadan");

      // Choices[correctChoiceIndex] MUST always be the original correct answer ("Abuja")
      expect(q1.choices[q1.correctChoiceIndex]).toBe("Abuja");
      expect(q1.explanation).toBe("Abuja became the federal capital in 1991.");
      expect(q1.reference).toBe("WAEC 2020");

      const q2 = prepared.find((q) => q.id === "q2")!;
      expect(q2.choices[q2.correctChoiceIndex]).toBe("Mitochondria");
    }
  });

  it("handles empty questions gracefully", () => {
    const prepared = prepareCbtQuestions([], 5, true);
    expect(prepared).toEqual([]);
  });
});
