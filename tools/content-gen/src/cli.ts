import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  QUIZ_CATEGORIES,
  QUIZ_DIFFICULTIES,
  type QuizCategory,
  type QuizDifficulty,
} from "@whizard/game-core";
import { DEFAULT_MODEL, claudeModel } from "./claude";
import { readCategory, writeCategory } from "./files";
import { growCategory } from "./pipeline";

const USAGE = `Usage: pnpm content:generate [--category <id|all>] [--level <easy|medium|hard|all>] [--count <n>] [--model <id>] [--dry-run]

Adds new, independently checked questions to the bank. Needs ANTHROPIC_API_KEY.
Categories: ${QUIZ_CATEGORIES.map((c) => c.id).join(", ")}`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    category: { type: "string", default: "all" },
    level: { type: "string", default: "all" },
    count: { type: "string", default: "10" },
    model: { type: "string", default: DEFAULT_MODEL },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const categoryIds = QUIZ_CATEGORIES.map((c) => c.id) as string[];
const categories = (values.category === "all" ? categoryIds : [values.category]) as QuizCategory[];
if (!categories.every((c) => categoryIds.includes(c)))
  fail(`Unknown category "${values.category}".`);

const levels = (values.level === "all" ? QUIZ_DIFFICULTIES : [values.level]) as QuizDifficulty[];
if (!levels.every((l) => (QUIZ_DIFFICULTIES as readonly string[]).includes(l))) {
  fail(`Unknown level "${values.level}".`);
}

const count = Number(values.count);
if (!Number.isInteger(count) || count < 1 || count > 100)
  fail("--count must be between 1 and 100.");
if (!process.env.ANTHROPIC_API_KEY) fail("Set ANTHROPIC_API_KEY to generate questions.");

const model = claudeModel(values.model);
const summary: string[] = ["| Category | Level | Added | Rejected |", "| --- | --- | --- | --- |"];
let totalAdded = 0;

for (const category of categories) {
  for (const difficulty of levels) {
    const existing = await readCategory(category);
    console.log(`\n${category} · ${difficulty}: asking for ${count}…`);
    const { added, rejected } = await growCategory({
      model,
      category,
      difficulty,
      count,
      existing,
    });

    for (const r of rejected) console.log(`  ✗ ${r.prompt}\n      ${r.reason}`);
    for (const q of added) console.log(`  ✓ ${q.id} ${q.prompt} → ${q.choices[0]}`);
    console.log(`  ${added.length} added, ${rejected.length} rejected`);

    if (!values["dry-run"] && added.length > 0)
      await writeCategory(category, [...existing, ...added]);
    summary.push(`| ${category} | ${difficulty} | ${added.length} | ${rejected.length} |`);
    totalAdded += added.length;
  }
}

console.log(`\nDone: ${totalAdded} questions ${values["dry-run"] ? "would be " : ""}added.`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## New questions\n\n${summary.join("\n")}\n`);
}
