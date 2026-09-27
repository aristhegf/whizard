import type { StoredQuestion } from "./schema";

/** Lowercase letters and digits only, accents removed, single spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const padded = `  ${normalize(text)}  `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** Jaccard similarity of character trigrams, from 0 (nothing shared) to 1 (identical). */
export function similarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  let shared = 0;
  for (const gram of x) if (y.has(gram)) shared++;
  return shared / (x.size + y.size - shared);
}

/**
 * Prompts at least this similar count as the same question when they also share the answer.
 * Requiring the same answer keeps "Which river flows through Cairo?" and "...through Baghdad?"
 * apart.
 */
export const DUPLICATE_SIMILARITY = 0.7;

export function isDuplicate(a: StoredQuestion, b: StoredQuestion): boolean {
  if (normalize(a.prompt) === normalize(b.prompt)) return true;
  return (
    normalize(a.choices[0]!) === normalize(b.choices[0]!) &&
    similarity(a.prompt, b.prompt) >= DUPLICATE_SIMILARITY
  );
}

export function findDuplicate(
  question: StoredQuestion,
  existing: readonly StoredQuestion[],
): StoredQuestion | undefined {
  return existing.find(
    (other) => other.category === question.category && isDuplicate(question, other),
  );
}

/** Problems the schema can't express. An empty list means the question is fine to use. */
export function problemsWith(question: StoredQuestion): string[] {
  const problems: string[] = [];
  const choices = question.choices.map(normalize);
  if (new Set(choices).size !== choices.length) problems.push("choices are not all different");
  if (choices.some((c) => c.length === 0)) problems.push("a choice is empty");
  const answer = choices[0]!;
  if (answer && ` ${normalize(question.prompt)} `.includes(` ${answer} `)) {
    problems.push("the answer appears in the prompt");
  }
  if (question.category === "bible" && !question.reference) {
    problems.push("Bible questions need a verse reference");
  }
  return problems;
}
