import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { storedQuestionSchema, type StoredQuestion } from "@whizard/content";
import type { QuizCategory } from "@whizard/game-core";
import * as prettier from "prettier";
import { z } from "zod";

const QUESTIONS_DIR = fileURLToPath(
  new URL("../../../packages/content/src/questions/", import.meta.url),
);

export function categoryFile(category: QuizCategory): string {
  return `${QUESTIONS_DIR}${category}.json`;
}

export async function readCategory(category: QuizCategory): Promise<StoredQuestion[]> {
  const raw = await readFile(categoryFile(category), "utf8");
  return z.array(storedQuestionSchema).parse(JSON.parse(raw));
}

/** Writes the file formatted with the repo's Prettier settings, so CI's format check passes. */
export async function writeCategory(
  category: QuizCategory,
  questions: StoredQuestion[],
): Promise<void> {
  const path = categoryFile(category);
  const config = (await prettier.resolveConfig(path)) ?? {};
  const text = await prettier.format(JSON.stringify(questions), { ...config, filepath: path });
  await writeFile(path, text);
}
