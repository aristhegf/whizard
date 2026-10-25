import type { Env } from "./env";

/**
 * One Google Gemini call answering a batch of bank-import questions. The key stays on the
 * server (a Worker secret); the model comes from an environment variable, never from a request.
 * Each HTTP request here makes at most one provider call, so the batch that runs inside a
 * Cloudflare request stays one bounded round trip.
 */

/** How long one Gemini call may take before we give up on it. */
const TIMEOUT_MS = 25_000;
/** The model used when GEMINI_MODEL isn't set. */
const DEFAULT_MODEL = "gemini-2.5-flash";

/** One question as the provider sees it: its stable id, the prompt, the four options. */
export interface BatchQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

/** One answer back from the provider, before we decide whether it's usable. */
export interface BatchAnswer {
  id: string;
  /** 0–3 into the question's choices, or null when the model is unsure. */
  answerIndex: number | null;
  explanation: string;
  reviewNeeded: boolean;
}

/** The provider refused or failed in a way retrying might fix (a busy key, mostly). */
export class AiBusyError extends Error {}

/** The provider failed outright; the caller marks the batch for a person instead. */
export class AiUnavailableError extends Error {}

const responseSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      id: { type: "STRING" },
      answerIndex: { type: "INTEGER" },
      explanation: { type: "STRING" },
      reviewNeeded: { type: "BOOLEAN" },
    },
    required: ["id", "answerIndex", "explanation", "reviewNeeded"],
  },
};

/** The id of a raw response item, when it carries one we can place. */
function rawId(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const id = (raw as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/** A stand-in for an answer we can't trust: a repeated id, or a shape we can't read. */
const poisoned = (id: string): BatchAnswer => ({
  id,
  answerIndex: null,
  explanation: "",
  reviewNeeded: false,
});

/** The model name, from the environment or the default; kept to safe characters only. */
function modelName(env: Env): string {
  const model = (env.GEMINI_MODEL ?? "").trim();
  return /^[A-Za-z0-9._-]+$/.test(model) ? model : DEFAULT_MODEL;
}

/** The instruction that asks for one answer per question, in JSON, echoing each id. */
export function batchPrompt(batch: readonly BatchQuestion[]): string {
  const sections = batch.map(
    (question, i) =>
      `Question ${i + 1} (id "${question.id}"):\n` +
      question.prompt +
      "\n" +
      question.choices.map((choice, c) => `${c + 1}. ${choice}`).join("\n"),
  );
  return (
    "Answer these quiz questions. For each one, choose which of the four options is correct.\n" +
    "Return only a JSON array with one item per question:\n" +
    '{"id": "...", "answerIndex": 0, "explanation": "why, under 160 characters", "reviewNeeded": false}\n' +
    "Echo each id exactly as given. If you are not confident, set answerIndex to null and " +
    "reviewNeeded to true, and still write a short explanation.\n\n" +
    sections.join("\n\n")
  );
}

/** Validates one parsed item against what we asked for; anything else is unusable. */
function readAnswer(raw: unknown): BatchAnswer | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  const index = item.answerIndex;
  if (
    index !== null &&
    (!Number.isInteger(index) || (index as number) < 0 || (index as number) > 3)
  ) {
    return null;
  }
  return {
    id: item.id,
    answerIndex: index as number | null,
    explanation: typeof item.explanation === "string" ? item.explanation.trim() : "",
    reviewNeeded: item.reviewNeeded === true,
  };
}

/**
 * Asks Gemini to answer one batch. Every requested id should come back once; the caller
 * cross-checks the ids it asked for against what lands here, so a wrong or missing id can
 * never silently become an answer.
 */
export async function answerBatch(
  env: Env,
  batch: readonly BatchQuestion[],
): Promise<Map<string, BatchAnswer>> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new AiUnavailableError("no key");
  const model = modelName(env);
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: batchPrompt(batch) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    // A timeout or network drop is one bad round trip; the caller flags the batch.
    throw new AiUnavailableError("fetch failed");
  }
  if (response.status === 429) throw new AiBusyError("rate limited");
  if (!response.ok) throw new AiUnavailableError(`status ${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AiUnavailableError("bad json");
  }
  const text = (
    body as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  ).candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");
  if (!text) throw new AiUnavailableError("empty candidates");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiUnavailableError("answer was not JSON");
  }
  if (!Array.isArray(parsed)) throw new AiUnavailableError("answer was not an array");
  const answers = new Map<string, BatchAnswer>();
  for (const raw of parsed) {
    const id = rawId(raw);
    if (!id) continue;
    // A repeated id, or one we can't read, poisons that question for review — never a guess.
    if (answers.has(id)) {
      answers.set(id, poisoned(id));
      continue;
    }
    const answer = readAnswer(raw);
    answers.set(id, answer ?? poisoned(id));
  }
  return answers;
}
