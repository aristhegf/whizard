import {
  findDuplicate,
  problemsWith,
  storedQuestionSchema,
  type StoredQuestion,
} from "@whizard/content";
import { seededRng, shuffled, type QuizCategory, type QuizDifficulty } from "@whizard/game-core";
import type { CheckItem, Draft, QuestionModel } from "./model";

export interface Rejection {
  prompt: string;
  reason: string;
}

export interface GrowResult {
  added: StoredQuestion[];
  rejected: Rejection[];
}

export interface GrowOptions {
  model: QuestionModel;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  count: number;
  /** Everything already in the bank for this category. */
  existing: StoredQuestion[];
  seed?: number;
  /** Write-and-check rounds before giving up on reaching `count`. */
  maxRounds?: number;
}

/** Most drafts per request; bigger batches get sloppier. */
const MAX_BATCH = 25;
/** Ask for extra drafts, since some won't survive the checks. */
const OVERSHOOT = 1.4;

export function nextIdNumber(category: QuizCategory, existing: readonly StoredQuestion[]): number {
  const numbers = existing
    .filter((q) => q.category === category)
    .map((q) => Number(q.id.slice(category.length + 1)))
    .filter(Number.isFinite);
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

export function questionId(category: QuizCategory, n: number): string {
  return `${category}-${String(n).padStart(3, "0")}`;
}

function toQuestion(draft: Draft, category: QuizCategory, difficulty: QuizDifficulty): unknown {
  return {
    id: "pending",
    category,
    topic: draft.topic.trim(),
    difficulty,
    prompt: draft.prompt.trim(),
    choices: [draft.answer, ...draft.wrong].map((c) => c.trim()),
    explanation: draft.explanation.trim(),
    ...(draft.reference?.trim() ? { reference: draft.reference.trim() } : {}),
  };
}

/**
 * Grows one category at one level: drafts questions, drops any that fail validation or repeat
 * an existing question, then keeps only those an independent check answers the same way.
 */
export async function growCategory(options: GrowOptions): Promise<GrowResult> {
  const { model, category, difficulty, count, existing, maxRounds = 3 } = options;
  const rng = seededRng(options.seed ?? Date.now());
  const added: StoredQuestion[] = [];
  const rejected: Rejection[] = [];
  let next = nextIdNumber(category, existing);

  for (let round = 0; round < maxRounds && added.length < count; round++) {
    const known = [...existing, ...added];
    const drafts = await model.write({
      category,
      difficulty,
      count: Math.min(MAX_BATCH, Math.ceil((count - added.length) * OVERSHOOT)),
      avoid: known.filter((q) => q.category === category).map((q) => q.prompt),
    });

    const candidates: StoredQuestion[] = [];
    for (const draft of drafts) {
      const parsed = storedQuestionSchema.safeParse(toQuestion(draft, category, difficulty));
      if (!parsed.success) {
        rejected.push({
          prompt: draft.prompt,
          reason: `invalid: ${parsed.error.issues[0]?.message}`,
        });
        continue;
      }
      const question = parsed.data;
      const problems = problemsWith(question);
      if (problems.length > 0) {
        rejected.push({ prompt: question.prompt, reason: problems.join("; ") });
        continue;
      }
      const duplicate = findDuplicate(question, [...known, ...candidates]);
      if (duplicate) {
        rejected.push({
          prompt: question.prompt,
          reason: `repeats ${duplicate.id}: ${duplicate.prompt}`,
        });
        continue;
      }
      candidates.push({ ...question, id: `candidate-${candidates.length + 1}` });
    }
    if (candidates.length === 0) continue;

    const orders = candidates.map(() => shuffled([0, 1, 2, 3], rng));
    const items: CheckItem[] = candidates.map((q, i) => ({
      id: q.id,
      prompt: q.prompt,
      choices: orders[i]!.map((c) => q.choices[c]!),
    }));
    const verdicts = new Map((await model.check(items, category)).map((v) => [v.id, v]));

    candidates.forEach((question, i) => {
      const verdict = verdicts.get(question.id);
      const correctPosition = orders[i]!.indexOf(0);
      const reason = !verdict
        ? "the checker skipped it"
        : verdict.choice !== correctPosition
          ? `the checker answered "${items[i]!.choices[verdict.choice] ?? "?"}"`
          : !verdict.confident
            ? "the checker wasn't confident"
            : verdict.problem
              ? `the checker flagged: ${verdict.problem}`
              : null;
      if (reason) {
        rejected.push({ prompt: question.prompt, reason });
      } else if (added.length < count) {
        added.push({ ...question, id: questionId(category, next++) });
      }
    });
  }

  return { added, rejected };
}
