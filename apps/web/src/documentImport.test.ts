import { describe, expect, it } from "vitest";
import {
  parseDocxFile,
  parseDocumentToCsv,
  parseHtmlTables,
  parseTextQuestions,
} from "./documentImport";

describe("documentImport", () => {
  it("parses standard numbered questions with answers and explanations", () => {
    const text = `
1. What is the chemical formula for water?
A. H2O
B. CO2
C. NaCl
D. CH4
Answer: A
Explanation: Water consists of two hydrogen atoms and one oxygen atom.
Reference: Chem 101

2. Which planet is known as the Red Planet?
A. Venus
B. Jupiter
C. Mars
D. Saturn
Ans: C
Explanation: Mars appears reddish due to iron oxide.
`;

    const questions = parseTextQuestions(text);
    expect(questions).toHaveLength(2);

    expect(questions[0]).toEqual({
      prompt: "What is the chemical formula for water?",
      choices: ["H2O", "CO2", "NaCl", "CH4"],
      answer: "A",
      explanation: "Water consists of two hydrogen atoms and one oxygen atom.",
      reference: "Chem 101",
    });

    expect(questions[1]).toEqual({
      prompt: "Which planet is known as the Red Planet?",
      choices: ["Venus", "Jupiter", "Mars", "Saturn"],
      answer: "C",
      explanation: "Mars appears reddish due to iron oxide.",
      reference: "",
    });
  });

  it("parses questions with parentheses numbering and lowercase options", () => {
    const text = `
1) What is the capital of France?
(a) London
(b) Paris
(c) Berlin
(d) Madrid
Correct: B

(2) What is the largest ocean?
[a] Atlantic
[b] Indian
[c] Pacific
[d] Arctic
Answer: Pacific
`;

    const questions = parseTextQuestions(text);
    expect(questions).toHaveLength(2);

    expect(questions[0]!.prompt).toBe("What is the capital of France?");
    expect(questions[0]!.choices).toEqual(["London", "Paris", "Berlin", "Madrid"]);
    expect(questions[0]!.answer).toBe("B");

    expect(questions[1]!.prompt).toBe("What is the largest ocean?");
    expect(questions[1]!.choices).toEqual(["Atlantic", "Indian", "Pacific", "Arctic"]);
    expect(questions[1]!.answer).toBe("Pacific");
  });

  it("detects inline choices and asterisk-marked answers", () => {
    const text = `
Question 1: Who painted the Mona Lisa?
*A) Leonardo da Vinci B) Vincent van Gogh C) Pablo Picasso D) Michelangelo

Question 2: Boiling point of water at 1 atm?
A) 50°C
B) 100°C*
C) 150°C
D) 200°C
`;

    const questions = parseTextQuestions(text);
    expect(questions).toHaveLength(2);

    expect(questions[0]!.prompt).toBe("Who painted the Mona Lisa?");
    expect(questions[0]!.choices).toEqual([
      "Leonardo da Vinci",
      "Vincent van Gogh",
      "Pablo Picasso",
      "Michelangelo",
    ]);
    expect(questions[0]!.answer).toBe("A");

    expect(questions[1]!.prompt).toBe("Boiling point of water at 1 atm?");
    expect(questions[1]!.choices).toEqual(["50°C", "100°C", "150°C", "200°C"]);
    expect(questions[1]!.answer).toBe("B");
  });

  it("handles separate answer keys at the bottom of the document", () => {
    const text = `
1. Capital of Nigeria?
A. Lagos
B. Abuja
C. Kano
D. Ibadan

2. Capital of Ghana?
A. Accra
B. Kumasi
C. Tamale
D. Cape Coast

Answer Key:
1. B
2. A
`;

    const questions = parseTextQuestions(text);
    expect(questions).toHaveLength(2);
    expect(questions[0]!.answer).toBe("B");
    expect(questions[1]!.answer).toBe("A");
  });

  it("normalizes 5-option questions (WAEC / JAMB style)", () => {
    const textE = `
1. Which of the following is an inert gas?
A. Oxygen
B. Hydrogen
C. Nitrogen
D. Chlorine
E. Argon
Answer: E
`;

    const questions = parseTextQuestions(textE);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.choices).toHaveLength(4);
    // E is kept at index 3, and Answer is set to D
    expect(questions[0]!.choices[3]).toBe("Argon");
    expect(questions[0]!.answer).toBe("D");
  });

  it("parses Word table HTML", () => {
    const html = `
<table>
  <tr><th>Question</th><th>Option A</th><th>Option B</th><th>Option C</th><th>Option D</th><th>Answer</th><th>Explanation</th></tr>
  <tr><td>What is 2 + 2?</td><td>3</td><td>4</td><td>5</td><td>6</td><td>B</td><td>2 + 2 = 4</td></tr>
  <tr><td>What is 3 * 3?</td><td>6</td><td>7</td><td>8</td><td>9</td><td>D</td><td>3 * 3 = 9</td></tr>
</table>
`;

    const questions = parseHtmlTables(html);
    expect(questions).toHaveLength(2);
    expect(questions[0]!.prompt).toBe("What is 2 + 2?");
    expect(questions[0]!.choices).toEqual(["3", "4", "5", "6"]);
    expect(questions[0]!.answer).toBe("B");
    expect(questions[0]!.explanation).toBe("2 + 2 = 4");

    expect(questions[1]!.prompt).toBe("What is 3 * 3?");
    expect(questions[1]!.choices).toEqual(["6", "7", "8", "9"]);
    expect(questions[1]!.answer).toBe("D");
  });

  it("converts extracted questions into valid CSV", () => {
    const text = `
1. What is the speed of light?
A. 300,000 km/s
B. 150,000 km/s
C. 1,000 km/s
D. 30,000 km/s
Answer: A
Explanation: Light travels at ~300,000 km/s.
`;

    const csv = parseDocumentToCsv(text);
    expect(csv).toContain(
      '"question","option1","option2","option3","option4","answer","explanation","reference"',
    );
    expect(csv).toContain(
      '"What is the speed of light?","300,000 km/s","150,000 km/s","1,000 km/s","30,000 km/s","A","Light travels at ~300,000 km/s.",""',
    );
  });

  it("throws an error when no questions can be extracted", () => {
    expect(() => parseDocumentToCsv("This is just some random text with no questions.")).toThrow(
      /Couldn’t find any multiple-choice questions/,
    );
  });

  it("rejects non-docx files with an instructive error message", async () => {
    const fakeFile = new File([new Uint8Array([1, 2, 3])], "old.doc", {
      type: "application/msword",
    });
    await expect(parseDocxFile(fakeFile)).rejects.toThrow(
      /Couldn’t read this Word document. If it is in the older .doc format/,
    );
  });
});
