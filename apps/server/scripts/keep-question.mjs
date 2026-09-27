// Puts a reported question back into play after checking it's fine as it is.
//
//   node scripts/keep-question.mjs bible-042
//
// Only the current wording is kept: if the question is edited later, new reports count again.
import { execFileSync } from "node:child_process";
import { questions, questionVersion } from "./questions.mjs";

const id = process.argv[2] ?? "";
const question = questions.get(id);
if (!/^[a-z0-9-]+$/.test(id) || !question) {
  console.error(`No question with the ID "${id}".`);
  process.exit(1);
}
const version = questionVersion(question);
const where =
  process.env.STATS_LOCAL === "1"
    ? ["--local", "--persist-to", "../web/.wrangler/state"]
    : ["--remote"];
execFileSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    ...where,
    "--command",
    `INSERT OR IGNORE INTO question_kept (question_id, version, kept_at) VALUES ('${id}', '${version}', ${Date.now()})`,
  ],
  { stdio: "inherit" },
);
console.log(`Kept ${id}: “${question.prompt}”`);
