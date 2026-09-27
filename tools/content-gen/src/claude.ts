import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CHOICE_MAX, EXPLANATION_MAX, PROMPT_MAX } from "@whizard/content";
import type { QuizCategory } from "@whizard/game-core";
import { z } from "zod";
import { CATEGORY_GUIDANCE, LEVEL_GUIDANCE } from "./guidance";
import type { CheckItem, Draft, QuestionModel, Verdict, WriteRequest } from "./model";

export const DEFAULT_MODEL = "claude-opus-5";

const draftsSchema = z.object({
  questions: z.array(
    z.object({
      topic: z.string(),
      prompt: z.string(),
      answer: z.string(),
      wrong: z.array(z.string()),
      explanation: z.string(),
      reference: z.string().nullable(),
    }),
  ),
});

const verdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      letter: z.enum(["A", "B", "C", "D"]),
      confident: z.boolean(),
      problem: z.string(),
    }),
  ),
});

const WRITER_SYSTEM = `You write multiple-choice questions for Whizard, a quiz game that friends play against each other.

Every question must be factually correct and unambiguous. A wrong answer key is the worst possible mistake, so only write a question if you are certain of the answer. When in doubt, write a different question.

Rules for every question:
- Exactly one correct answer and exactly three wrong answers.
- The wrong answers are plausible, of the same type as the answer (all people, all places, all years), and clearly wrong on reflection. No "all of the above" and no joke answers.
- The answer must not appear in the prompt.
- Prompt at most ${PROMPT_MAX} characters. Each answer at most ${CHOICE_MAX} characters. The explanation is one plain sentence of at most ${EXPLANATION_MAX} characters saying why the answer is right.
- Plain, friendly English.
- No near-duplicates: never ask a fact that is already in the list of existing questions, even in different words.
- Spread the questions across many different topics within the category.`;

const CHECKER_SYSTEM = `You fact-check multiple-choice quiz questions before they are published.

For each question, answer it yourself: pick the letter of the one correct choice. Then judge the question strictly.
- "confident" is true only if you are certain your letter is correct.
- "problem" describes anything wrong: more than one defensible answer, no correct choice, ambiguous wording, a fact that is disputed or depends on the source, or a fact that could have changed since it was written. Leave it empty if the question is sound.`;

function assertComplete(message: { stop_reason: string | null }) {
  if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (message.stop_reason === "max_tokens")
    throw new Error("The model ran out of room; ask for fewer questions.");
}

/** Question writing and checking through the Claude API. Reads ANTHROPIC_API_KEY. */
export function claudeModel(model = DEFAULT_MODEL): QuestionModel {
  const client = new Anthropic();

  const request = {
    model,
    max_tokens: 32000,
    // Retries a declined request on a suitable fallback model instead of failing the batch.
    betas: ["server-side-fallback-2026-07-01"] satisfies Anthropic.Beta.AnthropicBeta[],
    fallbacks: "default" as const,
  };

  return {
    async write({ category, difficulty, count, avoid }: WriteRequest): Promise<Draft[]> {
      const guidance = CATEGORY_GUIDANCE[category];
      const existing = avoid.length > 0 ? avoid.map((p) => `- ${p}`).join("\n") : "(none yet)";
      const message = await client.beta.messages
        .stream({
          ...request,
          system: WRITER_SYSTEM,
          output_config: { format: betaZodOutputFormat(draftsSchema) },
          messages: [
            {
              role: "user",
              content: `Write ${count} ${difficulty} questions for the ${guidance.name} category.

${difficulty[0]!.toUpperCase() + difficulty.slice(1)} means ${LEVEL_GUIDANCE[difficulty]}.
Cover: ${guidance.cover}.
Avoid: ${guidance.avoid}.
${category === "bible" ? "Give a verse reference (book chapter:verse) for every question; it must contain the answer." : "Set reference to null."}

Existing questions in this category (do not repeat these facts):
${existing}`,
            },
          ],
        })
        .finalMessage();
      assertComplete(message);
      const parsed = draftsSchema.parse(JSON.parse(textOf(message)));
      return parsed.questions;
    },

    async check(items: CheckItem[], category: QuizCategory): Promise<Verdict[]> {
      const list = items
        .map(
          (item) =>
            `[${item.id}] ${item.prompt}\n${item.choices.map((c, i) => `  ${"ABCD"[i]}. ${c}`).join("\n")}`,
        )
        .join("\n\n");
      const message = await client.beta.messages
        .stream({
          ...request,
          system: CHECKER_SYSTEM,
          output_config: { format: betaZodOutputFormat(verdictsSchema), effort: "high" },
          messages: [
            {
              role: "user",
              content: `Category: ${CATEGORY_GUIDANCE[category].name}. Check these ${items.length} questions and return one verdict per id.\n\n${list}`,
            },
          ],
        })
        .finalMessage();
      assertComplete(message);
      const parsed = verdictsSchema.parse(JSON.parse(textOf(message)));
      return parsed.verdicts.map((v) => ({
        id: v.id,
        choice: "ABCD".indexOf(v.letter),
        confident: v.confident,
        problem: v.problem.trim(),
      }));
    },
  };
}

function textOf(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}
