// Prints the site's stats as Markdown tables, read from the live D1 database.
//
//   node scripts/stats-report.mjs [days]      (default: the last 30 days)
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and wrangler.jsonc pointing at the real
// database (scripts/use-remote-db.sh). In GitHub Actions the report also goes to the run summary.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { questions, questionVersion } from "./questions.mjs";

const days = Math.max(1, Math.min(365, Number(process.argv[2]) || 30));
const local = process.env.STATS_LOCAL === "1";

function query(sql) {
  const where = local ? ["--local", "--persist-to", "../web/.wrangler/state"] : ["--remote"];
  const out = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", ...where, "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out)[0].results;
}

const since = `date('now', '-${days - 1} days')`;
const sum = (metric) =>
  `(SELECT COALESCE(SUM(count), 0) FROM daily_counts WHERE metric = '${metric}')`;

const [totals] = query(`SELECT
  (SELECT COUNT(*) FROM visitor_people) AS visitors,
  (SELECT COUNT(*) FROM visitor_people WHERE last_day > first_day) AS returning_visitors,
  ${sum("visits")} AS visits,
  (SELECT COALESCE(MAX(count), 0) FROM daily_counts WHERE metric = 'online_peak') AS peak,
  ${sum("rooms_created")} AS rooms,
  ${sum("games_started")} AS started,
  ${sum("games_finished")} AS finished,
  (SELECT COUNT(*) FROM users) AS accounts,
  ${sum("pings_sent")} AS pings`);

const DAILY = [
  ["Visitors", "visitors_active"],
  ["New", "visitors_new"],
  ["Visits", "visits"],
  ["Peak here now", "online_peak"],
  ["Rooms", "rooms_created"],
  ["Games started", "games_started"],
  ["Games finished", "games_finished"],
  ["Players", "game_players"],
  ["Accounts", "accounts_created"],
];

const daily = query(`SELECT day, ${DAILY.map(
  ([, metric], i) => `COALESCE(SUM(CASE WHEN metric = '${metric}' THEN count END), 0) AS c${i}`,
).join(", ")}
  FROM daily_counts WHERE day >= ${since} GROUP BY day ORDER BY day DESC`);

const breakdown = query(`SELECT metric, SUM(count) AS total FROM daily_counts
  WHERE day >= ${since} AND instr(metric, ':') > 0 GROUP BY metric ORDER BY total DESC`);

const GROUPS = [
  ["source", "Where new visitors came from"],
  ["country", "New visitors by country"],
  ["device", "New visitors by device"],
  ["page", "Page views"],
  ["game", "Games finished, by game"],
  ["topic", "Quiz games finished, by topic"],
  ["mode", "Quiz games finished, by mode"],
];

const n = (value) => Number(value).toLocaleString("en-US");
const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => " --- ").join("|")}|`]
    .concat(rows.map((row) => `| ${row.join(" | ")} |`))
    .join("\n");

const lines = [
  "# Whizard stats",
  "",
  table(
    [
      "Visitors",
      "Returning",
      "Visits",
      "Peak here now",
      "Rooms",
      "Games started",
      "Games finished",
      "Accounts",
      "Pings",
    ],
    [
      [
        totals.visitors,
        totals.returning_visitors,
        totals.visits,
        totals.peak,
        totals.rooms,
        totals.started,
        totals.finished,
        totals.accounts,
        totals.pings,
      ].map(n),
    ],
  ),
  "",
  `All days are UTC. "Visitors" in the daily table counts each person once a day; "Visits" counts page loads.`,
  "",
  `## Last ${days} days`,
  "",
  daily.length
    ? table(
        ["Day", ...DAILY.map(([label]) => label)],
        daily.map((row) => [row.day, ...DAILY.map((_, i) => n(row[`c${i}`]))]),
      )
    : "No visits yet.",
];

for (const [prefix, title] of GROUPS) {
  const rows = breakdown.filter((r) => r.metric.startsWith(`${prefix}:`)).slice(0, 15);
  if (rows.length === 0) continue;
  lines.push(
    "",
    `### ${title}`,
    "",
    table(
      ["", "Count"],
      rows.map((r) => [r.metric.slice(prefix.length + 1), n(r.total)]),
    ),
  );
}

// Reported questions, with the reasons. Three different people take a question out of play.
const reported = query(`SELECT r.question_id, r.version, COUNT(*) AS reports,
    group_concat(r.reason) AS reasons,
    EXISTS (SELECT 1 FROM question_kept k WHERE k.question_id = r.question_id AND k.version = r.version) AS kept
  FROM question_reports r GROUP BY r.question_id, r.version ORDER BY reports DESC LIMIT 40`);
const current = reported.filter((r) => {
  const q = questions.get(r.question_id);
  return q && questionVersion(q) === r.version;
});
if (current.length > 0) {
  const tally = (reasons) =>
    Object.entries(reasons.split(",").reduce((all, r) => ({ ...all, [r]: (all[r] ?? 0) + 1 }), {}))
      .map(([reason, count]) => `${reason} ×${count}`)
      .join(", ");
  lines.push(
    "",
    "## Reported questions",
    "",
    "Out of play after 3 reports. To keep one as it is, run the **Keep a reported question** workflow; to fix one, edit it and its old reports stop counting.",
    "",
    table(
      ["Question", "", "Reports", "Why", "Status"],
      current.map((r) => [
        r.question_id,
        questions.get(r.question_id).prompt.replace(/\|/g, "/"),
        n(r.reports),
        tally(r.reasons),
        r.kept ? "Kept" : r.reports >= 3 ? "Out of play" : "In play",
      ]),
    ),
  );
}

const report = lines.join("\n") + "\n";
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
