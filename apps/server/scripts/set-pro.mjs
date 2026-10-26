// Grants or revokes Pro membership for an account.
//
//   node scripts/set-pro.mjs <username> grant|revoke
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [username = "", action = "grant"] = process.argv.slice(2);
if (!/^[a-z][a-z0-9_]{2,19}$/.test(username) || !["grant", "revoke"].includes(action)) {
  console.error("Usage: set-pro.mjs <username> grant|revoke");
  process.exit(1);
}
const where =
  process.env.STATS_LOCAL === "1"
    ? ["--local", "--persist-to", "../web/.wrangler/state"]
    : ["--remote"];

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const execute = (sql) =>
  execFileSync(
    process.execPath,
    [wrangler, "d1", "execute", "DB", ...where, "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const run = (sql) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(execute(sql))[0];
    } catch (error) {
      const busy = /SQLITE_BUSY|database is locked/.test(`${error.stdout}${error.stderr}`);
      if (!busy || attempt === 8) {
        process.stderr.write(`${error.stderr ?? ""}${error.stdout ?? ""}`);
        throw error;
      }
      pause(250 * attempt + Math.random() * 250);
    }
  }
};

const found = run(`SELECT id FROM users WHERE username = '${username}'`).results;
if (found.length === 0) {
  console.error(`No account with the username "${username}".`);
  process.exit(1);
}
const userId = found[0].id;
const now = Date.now();
if (action === "grant") {
  run(
    `INSERT INTO pro_memberships (user_id, since, until, source, updated_at) VALUES ('${userId}', ${now}, NULL, 'free', ${now}) ON CONFLICT (user_id) DO UPDATE SET until = NULL, source = 'free', updated_at = ${now}`,
  );
} else {
  run(`DELETE FROM pro_memberships WHERE user_id = '${userId}'`);
}
