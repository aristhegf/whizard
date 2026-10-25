import * as mammoth from "mammoth";

export interface ExtractedQuestion {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  reference: string;
}

/**
 * Escapes a cell value for standard CSV.
 */
function escapeCsv(cell: string): string {
  if (cell.includes('"') || cell.includes(",") || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return `"${cell}"`;
}

/**
 * Converts parsed questions to the standard CSV format accepted by Whizard's import engine.
 */
export function questionsToCsv(questions: readonly ExtractedQuestion[]): string {
  const header =
    '"question","option1","option2","option3","option4","answer","explanation","reference"';
  const rows = questions.map((q) =>
    [
      escapeCsv(q.prompt),
      escapeCsv(q.choices[0] ?? ""),
      escapeCsv(q.choices[1] ?? ""),
      escapeCsv(q.choices[2] ?? ""),
      escapeCsv(q.choices[3] ?? ""),
      escapeCsv(q.answer ?? ""),
      escapeCsv(q.explanation ?? ""),
      escapeCsv(q.reference ?? ""),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

/**
 * Parses tables inside Mammoth-generated HTML into quiz questions.
 */
export function parseHtmlTables(html: string): ExtractedQuestion[] {
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const questions: ExtractedQuestion[] = [];

  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(html)) !== null) {
    const tableContent = match[1] ?? "";
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[][] = [];
    let trMatch: RegExpExecArray | null;

    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let tdMatch: RegExpExecArray | null;

      while ((tdMatch = tdRegex.exec(trMatch[1] ?? "")) !== null) {
        const cellText = (tdMatch[1] ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        cells.push(cellText);
      }
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    }

    if (rows.length < 2) continue;

    // Check header row
    const header = (rows[0] ?? []).map((c) => c.toLowerCase().replace(/[\s_-]+/g, ""));
    let qIdx = header.findIndex((h) => h.includes("question") || h.includes("prompt"));
    let optIndices = [
      header.findIndex((h) => h === "option1" || h === "optiona" || h === "a" || h === "opt1"),
      header.findIndex((h) => h === "option2" || h === "optionb" || h === "b" || h === "opt2"),
      header.findIndex((h) => h === "option3" || h === "optionc" || h === "c" || h === "opt3"),
      header.findIndex((h) => h === "option4" || h === "optiond" || h === "d" || h === "opt4"),
    ];
    let ansIdx = header.findIndex(
      (h) => h.includes("answer") || h.includes("correct") || h === "ans" || h === "key",
    );
    let expIdx = header.findIndex(
      (h) => h.includes("explanation") || h.includes("reason") || h.includes("rationale"),
    );
    let refIdx = header.findIndex((h) => h.includes("reference") || h.includes("ref"));

    let dataRows = rows.slice(1);

    // If no header recognized, check positional format (at least 5 columns)
    if (qIdx === -1 && optIndices.some((i) => i === -1) && (rows[0]?.length ?? 0) >= 5) {
      qIdx = 0;
      optIndices = [1, 2, 3, 4];
      ansIdx = (rows[0]?.length ?? 0) >= 6 ? 5 : -1;
      expIdx = (rows[0]?.length ?? 0) >= 7 ? 6 : -1;
      refIdx = (rows[0]?.length ?? 0) >= 8 ? 7 : -1;
      dataRows = rows;
    }

    if (qIdx !== -1 && optIndices.every((i) => i !== -1)) {
      for (const row of dataRows) {
        const prompt = row[qIdx] ?? "";
        const choices = optIndices.map((i) => row[i] ?? "");
        const answer = ansIdx !== -1 ? (row[ansIdx] ?? "") : "";
        const explanation = expIdx !== -1 ? (row[expIdx] ?? "") : "";
        const reference = refIdx !== -1 ? (row[refIdx] ?? "") : "";

        if (prompt.trim() && choices.every((c) => c.trim().length > 0)) {
          questions.push({
            prompt: prompt.trim(),
            choices: choices.map((c) => c.trim()),
            answer: answer.trim(),
            explanation: explanation.trim(),
            reference: reference.trim(),
          });
        }
      }
    }
  }

  return questions;
}

interface RawChoice {
  letter: string;
  text: string;
  isMarked: boolean;
}

function testInlineChoices(line: string): { choices: RawChoice[]; answer: string } | null {
  const regex =
    /(?:^|\s)\*?[([]?([A-Ea-e])[\]).:-]\s+(.*?)(?=(?:\s+\*?[([]?[A-Ea-e][\]).:-]|$))/g;
  const matches = [...line.matchAll(regex)];
  if (matches.length >= 4) {
    const choices: RawChoice[] = [];
    let answer = "";
    for (const m of matches) {
      let text = (m[2] ?? "").trim();
      const isMarked = m[0].includes("*") || text.endsWith("*") || /\[x\]/i.test(text);
      text = text.replace(/\*+|\[x\]/gi, "").trim();
      const letter = (m[1] ?? "").toUpperCase();
      choices.push({ letter, text, isMarked });
      if (isMarked && !answer) answer = letter;
    }
    return { choices, answer };
  }
  return null;
}

function parseQuestionBlock(block: string): ExtractedQuestion | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  let prompt = "";
  let answer = "";
  let explanation = "";
  let reference = "";
  const rawChoices: RawChoice[] = [];

  const optionPrefixRegex = /^(?:\*?\s*[([]?([A-Ea-e1-5])[\]).:-]?|\*)\s*(.*)$/;
  const answerRegex = /^(?:answer|ans|correct(?:\s*answer)?|key)\s*[:=-]?\s*(.*)$/i;
  const expRegex = /^(?:explanation|explain|rationale|reason|note)\s*[:=-]?\s*(.*)$/i;
  const refRegex = /^(?:reference|ref)\s*[:=-]?\s*(.*)$/i;

  let parsingChoices = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check Answer
    const ansMatch = answerRegex.exec(line);
    if (ansMatch) {
      answer = ansMatch[1]?.trim() ?? "";
      continue;
    }

    // Check Explanation
    const expMatch = expRegex.exec(line);
    if (expMatch) {
      explanation = expMatch[1]?.trim() ?? "";
      continue;
    }

    // Check Reference
    const refMatch = refRegex.exec(line);
    if (refMatch) {
      reference = refMatch[1]?.trim() ?? "";
      continue;
    }

    // Check for inline choices on a single line: "A) One B) Two C) Three D) Four"
    const inlineMatch = testInlineChoices(line);
    if (inlineMatch) {
      rawChoices.push(...inlineMatch.choices);
      if (inlineMatch.answer && !answer) answer = inlineMatch.answer;
      parsingChoices = true;
      continue;
    }

    // Check for choice line
    const optMatch = optionPrefixRegex.exec(line);
    const isLetterOpt = optMatch && /^[A-Ea-e]$/.test(optMatch[1] ?? "");
    const isNumOpt = optMatch && /^[1-5]$/.test(optMatch[1] ?? "") && parsingChoices;

    if (isLetterOpt || isNumOpt || (optMatch && line.startsWith("*"))) {
      parsingChoices = true;
      let text = (optMatch[2] ?? "").trim();
      const isMarked = line.startsWith("*") || text.endsWith("*") || /\[x\]/i.test(line);
      text = text.replace(/^\*+|\*+|\[x\]/gi, "").trim();

      const letter = optMatch[1]
        ? optMatch[1].toUpperCase()
        : String.fromCharCode(65 + rawChoices.length);

      rawChoices.push({ letter, text, isMarked });
      if (isMarked && !answer) {
        answer = letter;
      }
      continue;
    }

    if (!parsingChoices) {
      // Clean leading numbering from question prompt
      const cleaned =
        i === 0
          ? line.replace(
              /^(?:question\s*\d+[:.-]?|q\s*\d+[:.-]?|\(?\d+\s*[.)]|\d+\s*[-–])\s*/i,
              "",
            )
          : line;
      prompt = prompt ? `${prompt} ${cleaned}` : cleaned;
    } else {
      // Continuation of previous choice or explanation
      if (rawChoices.length > 0) {
        rawChoices[rawChoices.length - 1]!.text += ` ${line}`;
      }
    }
  }

  if (!prompt.trim() || rawChoices.length < 2) return null;

  // Normalization to 4 choices for Whizard
  let finalChoices: string[];
  if (rawChoices.length >= 4) {
    if (rawChoices.length === 5) {
      // If 5 choices (A-E e.g. WAEC / JAMB format):
      const ansLetter = answer.trim().toUpperCase();
      if (ansLetter === "E" || (rawChoices[4] && rawChoices[4].isMarked)) {
        // Keep E at index 3, and choices A, B, C
        finalChoices = [
          rawChoices[0]!.text,
          rawChoices[1]!.text,
          rawChoices[2]!.text,
          rawChoices[4]!.text,
        ];
        answer = "D";
      } else {
        // Keep A, B, C, D
        finalChoices = rawChoices.slice(0, 4).map((c) => c.text);
      }
    } else {
      finalChoices = rawChoices.slice(0, 4).map((c) => c.text);
    }
  } else {
    // Fewer than 4 choices: preserve what exists, pad if needed
    finalChoices = rawChoices.map((c) => c.text);
    while (finalChoices.length < 4) {
      finalChoices.push(`Option ${finalChoices.length + 1}`);
    }
  }

  return {
    prompt: prompt.trim(),
    choices: finalChoices.map((c) => c.trim()),
    answer: answer.trim(),
    explanation: explanation.trim(),
    reference: reference.trim(),
  };
}

/**
 * Parses free-form text into quiz questions.
 */
export function parseTextQuestions(rawText: string): ExtractedQuestion[] {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Check for separate Answer Key section at the end of the text
  const answerKeyMap = new Map<number, string>();
  const answerKeyRegex = /(?:answer\s*keys?|answers):?\s*([\s\S]+)$/i;
  const keyMatch = answerKeyRegex.exec(text);
  let mainText = text;

  if (keyMatch) {
    mainText = text.slice(0, keyMatch.index);
    const keySection = keyMatch[1] ?? "";
    const itemRegex = /(?:^|\s|\b)(\d+)[\s.:)-]+([A-Ea-e])\b/g;
    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(keySection)) !== null) {
      answerKeyMap.set(parseInt(m[1]!, 10), m[2]!.toUpperCase());
    }
  }

  // Split into candidate question blocks based on numbered prefixes
  const lines = mainText.split("\n");
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  const qStartRegex = /^(?:question\s*\d+[:.-]?|q\s*\d+[:.-]?|\(?\d+\s*[.)]|\d+\s*[-–])\s+/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (qStartRegex.test(trimmed)) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join("\n"));
        currentBlock = [];
      }
      currentBlock.push(trimmed);
    } else if (currentBlock.length > 0) {
      if (trimmed.length > 0) {
        currentBlock.push(trimmed);
      }
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n"));
  }

  const questions: ExtractedQuestion[] = [];
  let questionNumber = 1;

  for (const block of blocks) {
    const parsed = parseQuestionBlock(block);
    if (parsed) {
      // If no inline answer found, look up separate answer key
      if (!parsed.answer && answerKeyMap.has(questionNumber)) {
        parsed.answer = answerKeyMap.get(questionNumber)!;
      }
      questions.push(parsed);
      questionNumber++;
    }
  }

  return questions;
}

/**
 * Parses either raw text or HTML tables into CSV format.
 */
export function parseDocumentToCsv(text: string, html = ""): string {
  // 1. Try tables from HTML first if present
  if (html && html.includes("<table")) {
    const tableQuestions = parseHtmlTables(html);
    if (tableQuestions.length > 0) {
      return questionsToCsv(tableQuestions);
    }
  }

  // 2. Parse text blocks
  const questions = parseTextQuestions(text);
  if (questions.length === 0) {
    throw new Error(
      "Couldn’t find any multiple-choice questions in that document. Ensure questions have numbered prompts (e.g. '1. ...') and options A–D.",
    );
  }

  return questionsToCsv(questions);
}

/**
 * Reads a .docx (or Word document) File and converts it into standard CSV text.
 */
export async function parseDocxFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  let rawText: string;
  let html = "";

  try {
    const rawResult = await mammoth.extractRawText({ arrayBuffer });
    rawText = rawResult.value;
  } catch (err) {
    // If mammoth fails to unzip or read the archive, it's likely an older binary .doc format
    throw new Error(
      "Couldn’t read this Word document. If it is in the older .doc format, please open it and save as .docx or CSV to import.",
      { cause: err },
    );
  }

  try {
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    html = htmlResult.value;
  } catch {
    // HTML conversion is optional; rawText will still be used
  }

  return parseDocumentToCsv(rawText, html);
}
