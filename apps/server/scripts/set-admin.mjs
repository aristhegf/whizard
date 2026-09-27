// Makes an account an admin, or takes it away.
//
//   node scripts/set-admin.mjs <username> grant|revoke
import { execFileSync } from "node:child_process";

const [username = "", action = "grant"] = process.argv.slice(2);
if (!/^[a-z][a-z0-9_]{2,19}$/.test(username) || !["grant", "revoke"].includes(action)) {
  console.error("Usage: set-admin.mjs <username> grant|revoke");
  process.exit(1);
}
const where =
  process.env.STATS_LOCAL === "1"
    ? ["--local", "--persist-to", "../web/.wrangler/state"]
    : ["--remote"];
const run = (sql) =>
  JSON.parse(
    execFileSync(
      "pnpm",
      ["exec", "wrangler", "d1", "execute", "DB", ...where, "--json", "--command", sql],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      },
    ),
  )[0];

const found = run(`SELECT id FROM users WHERE username = '${username}'`).results;
if (found.length === 0) {
  console.error(`No account with the username "${username}".`);
  process.exit(1);
}
run(`UPDATE users SET is_admin = ${action === "grant" ? 1 : 0} WHERE username = '${username}'`);
console.log(
  action === "grant" ? `@${username} is now an admin.` : `@${username} is no longer an admin.`,
);
