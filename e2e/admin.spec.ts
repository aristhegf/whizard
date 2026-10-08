import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

function grantAdmin(username: string) {
  execFileSync("node", ["scripts/set-admin.mjs", username, "grant"], {
    cwd: "apps/server",
    env: { ...process.env, STATS_LOCAL: "1" },
    stdio: "ignore",
  });
}

async function signedUp(browser: Browser): Promise<{ page: Page; username: string }> {
  const page = await (await browser.newContext()).newPage();
  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username);
  return { page, username };
}

test("only admins get the dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Sign in with an admin account")).toBeVisible();

  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username);
  await page.goto("/admin");
  await expect(page.getByText("This page is for Whizard admins.")).toBeVisible();
  // The server refuses too, not just the page.
  for (const path of ["overview?range=30", "users", "rooms", "analytics?range=30"]) {
    expect((await page.request.get(`/api/admin/${path}`)).status()).toBe(403);
  }

  grantAdmin(username);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
  for (const label of ["Games Played", "Unique Players", "Rooms Created"]) {
    await expect(page.locator(".admin-kpi", { hasText: label }).locator("dd")).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Live Activity" })).toBeVisible();

  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole("heading", { name: "Reported questions" })).toBeVisible();

  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole("heading", { name: "Visitors Over Time" })).toBeVisible();
  await expect(page.locator(".admin-kpi", { hasText: "Page Views" }).locator("dd")).toHaveText(
    /^[\d,]+$/,
  );
});

test("an admin can suspend an account and let it back in", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const player = await signedUp(browser);

  await admin.page.goto("/admin/users");
  await admin.page.getByLabel("Search accounts").fill(player.username);
  const row = admin.page.locator(".user-row", { hasText: `@${player.username}` });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Suspend" }).click();
  await expect(row.getByText("Suspended")).toBeVisible();

  // Signed out everywhere, and the passkey no longer signs in.
  await player.page.goto("/account");
  await player.page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(player.page.getByText("This account has been suspended.")).toBeVisible();

  await row.getByRole("button", { name: "Unsuspend" }).click();
  await expect(row.getByText("Active")).toBeVisible();
  await player.page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(player.page.getByText(`@${player.username}`)).toBeVisible();
});

test("an admin sees open rooms and can close one", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);

  const host = await (await browser.newContext()).newPage();
  await host.goto("/");
  await host.getByRole("button", { name: "Create", exact: true }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const code = host.url().slice(-6);
  await host.getByLabel("Choose a nickname").fill("Zed");
  await host.getByRole("button", { name: "Join", exact: true }).click();
  await expect(host.getByRole("list", { name: "Players" })).toBeVisible();

  await admin.page.goto("/admin/rooms");
  const row = admin.page.locator(".room-row", { hasText: code });
  await expect(row.getByText("Zed")).toBeVisible();
  await expect(row.getByText("Waiting")).toBeVisible();
  await row.getByRole("button", { name: "Close room" }).click();
  await row.getByRole("button", { name: `Close ${code}` }).click();
  await expect(row).toHaveCount(0);
  await expect(host.getByText("This room was closed by Whizard.")).toBeVisible();
});

test("an admin can edit a question, undo it, and add their own", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;

  await page.goto("/admin/questions");
  await expect(page.getByRole("heading", { name: "Questions by Topic and Level" })).toBeVisible();

  // Edit a shipped question, then put it back.
  await page.goto("/admin/content");
  await page.getByLabel("Search questions").fill("baby kangaroo");
  await page.locator(".content-row").first().click();
  await expect(page).toHaveURL(/\/admin\/content\/animals-\d+$/);
  const explanation = page.getByLabel(/^Explanation/);
  await explanation.fill(`${await explanation.inputValue()} Checked.`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved. New games use it within a minute.")).toBeVisible();
  await expect(page.locator(".status-pill", { hasText: "Edited" })).toBeVisible();
  await page.getByRole("button", { name: "Undo my edits" }).click();
  await expect(page.getByText("Back to how it ships.")).toBeVisible();
  await expect(page.locator(".status-pill", { hasText: "Edited" })).toHaveCount(0);

  // A new question goes through the same checks as the bank's.
  const word = `Zq${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/admin/content/new");
  await page.getByLabel(/^Topic/).selectOption("pop-culture");
  await page.getByLabel(/^Level/).selectOption("hard");
  await page.getByLabel(/^Sub-topic/).fill("Testing");
  await page.getByLabel(/^Question/).fill(`Which of these is the test word ${word.length}?`);
  await page.getByLabel(/^Correct answer/).fill(word);
  await page.getByLabel(/^Wrong answer 1/).fill(word);
  await page.getByLabel(/^Wrong answer 2/).fill(`${word}b`);
  await page.getByLabel(/^Wrong answer 3/).fill(`${word}c`);
  await page.getByLabel(/^Explanation/).fill("It was made up for this test.");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("The four answers must all be different.")).toBeVisible();

  await page.getByLabel(/^Wrong answer 1/).fill(`${word}a`);
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page).toHaveURL(/\/admin\/content\/pop-culture-a[a-z0-9]+$/);
  await expect(page.locator(".status-pill", { hasText: "Added" })).toBeVisible();
  await page.getByRole("button", { name: "Delete question" }).click();
  await expect(page).toHaveURL(/\/admin\/content$/);
});

test("an admin can import questions from a JSON file and a CSV file", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const tag = Math.random().toString(36).slice(2, 8);
  await page.goto("/admin/content");

  // A JSON file in the bank's own row shape: one question to add, one to fix.
  const json = JSON.stringify([
    {
      id: `test-${tag}`,
      category: "pop-culture",
      topic: "Testing",
      difficulty: "easy",
      prompt: `Which tag was imported as ${tag}?`,
      choices: [`answer-${tag}`, `wrong-a-${tag}`, `wrong-b-${tag}`, `wrong-c-${tag}`],
      explanation: "It was typed into the import test.",
    },
    {
      category: "pop-culture",
      topic: "Testing",
      difficulty: "easy",
      prompt: `A broken row for ${tag}`,
      choices: [`broken-${tag}`, `broken-${tag}`, `nope-${tag}`, `nada-${tag}`],
      explanation: "Two answers are the same, so this row is refused.",
    },
  ]);
  await page.locator('input[type="file"]').setInputFiles({
    name: "questions.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await expect(page.getByText("Imported 1 question from questions.json.")).toBeVisible();
  await expect(page.getByText("Row 2: The four answers must all be different.")).toBeVisible();

  // The new question is in the bank.
  await page.getByLabel("Search questions").fill(`imported as ${tag}`);
  await expect(page.locator(".content-row")).toHaveCount(1);

  // The same shape as a CSV file, header row and all.
  const csv = [
    "id,category,topic,difficulty,prompt,choice_1,choice_2,choice_3,choice_4,explanation,reference",
    `csv-${tag},pop-culture,Testing,easy,"Which CSV tag ${tag}?","c-answer-${tag}","c-wrong-a-${tag}","c-wrong-b-${tag}","c-wrong-c-${tag}",Imported from a CSV.,`,
  ].join("\r\n");
  await page.locator('input[type="file"]').setInputFiles({
    name: "questions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("Imported 1 question from questions.csv.")).toBeVisible();

  // Both are the admin's own, so both can be deleted again after the test.
  for (const search of [`imported as ${tag}`, `CSV tag ${tag}`]) {
    await page.getByLabel("Search questions").fill(search);
    await expect(page.locator(".content-row")).toHaveCount(1);
    await page.locator(".content-row").first().click();
    await expect(page.locator(".status-pill", { hasText: "Added" })).toBeVisible();
    await page.getByRole("button", { name: "Delete question" }).click();
    await expect(page).toHaveURL(/\/admin\/content$/);
  }
});

test("blocked words keep names out, and a flagged player can be removed", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const tag = Math.random().toString(36).slice(2, 7);
  const block = async (word: string) => {
    await page.goto("/admin/moderation");
    await page.getByLabel("Add a word").fill(word);
    await page.getByRole("button", { name: "Block it" }).click();
    await expect(page.locator(".word-list").getByText(word, { exact: true })).toBeVisible();
  };

  const host = await (await browser.newContext()).newPage();
  await host.goto("/");
  await host.getByRole("button", { name: "Create", exact: true }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await host.getByLabel("Choose a nickname").fill(`Ok${tag}`);
  await host.getByRole("button", { name: "Join", exact: true }).click();
  await expect(host.getByRole("list", { name: "Players" })).toBeVisible();

  // A new player can't use a blocked word, even written with look-alikes.
  await block(`zq${tag}`);
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(host.url());
  await guest.getByLabel("Choose a nickname").fill(`Z Q ${tag}`);
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest.getByText("That name isn’t allowed here. Try another.")).toBeVisible();

  // Blocking a name already in use flags it, and the player can be sent away.
  await block(`ok${tag}`);
  await page.reload();
  const row = page.locator(".name-row", { hasText: `Ok${tag}` });
  await expect(row.getByText(`Matches “ok${tag}”`)).toBeVisible();
  await row.getByRole("button", { name: "Remove from room" }).click();
  await expect(host.getByText("You were removed from this room by Whizard.")).toBeVisible();

  await page
    .locator(".word-list li", { hasText: `ok${tag}` })
    .getByRole("button")
    .click();
  await expect(page.locator(".word-list").getByText(`ok${tag}`, { exact: true })).toHaveCount(0);
});

test("admins can put up an announcement and add another admin", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const other = await signedUp(browser);
  const page = admin.page;
  const notice = `Quiz night on Friday ${Math.random().toString(36).slice(2, 6)}`;

  await page.goto("/admin/settings");
  await page.getByLabel(/^Announcement/).fill(notice);
  await page.getByRole("button", { name: "Save announcement" }).click();
  await expect(page.getByText("Announcement is up.")).toBeVisible();
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  await expect(visitor.getByRole("status").filter({ hasText: notice })).toBeVisible();
  await visitor.getByRole("button", { name: "Close the announcement" }).click();
  await expect(visitor.getByText(notice)).toHaveCount(0);

  await page.getByLabel(/^Announcement/).fill("");
  await page.getByRole("button", { name: "Save announcement" }).click();
  await expect(page.getByText("Announcement taken down.")).toBeVisible();

  await page.getByLabel("Make someone an admin").fill(other.username);
  await page.getByRole("button", { name: "Add admin" }).click();
  const row = page.locator(".admin-row", { hasText: `@${other.username}` });
  await expect(row).toBeVisible();
  await other.page.goto("/admin");
  await expect(other.page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
  await row.getByRole("button", { name: "Remove admin" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator(".log-list")).toContainText(`took admin away from @${other.username}`);
});

test("an admin can turn a topic off and back on", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const topics = async () =>
    (
      (await (await page.request.get("/api/quiz/categories")).json()) as {
        categories: { id: string }[];
      }
    ).categories.map((c) => c.id);

  await page.goto("/admin/games");
  await expect(page.getByRole("heading", { name: "New Room Defaults" })).toBeVisible();
  const toggle = page.getByRole("switch", { name: "General knowledge on" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(page.getByText("General knowledge is off.")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await topics()).not.toContain("general-knowledge");

  await toggle.click();
  await expect(page.getByText("General knowledge is on.")).toBeVisible();
  expect(await topics()).toContain("general-knowledge");
});

test("an admin can record a payment, give Pro and end it", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const buyer = await signedUp(browser);
  const page = admin.page;

  await page.goto("/admin/payments");
  const record = page.locator("section", { has: page.locator("#record-title") });
  await record.getByLabel("Username").fill(buyer.username);
  await record.getByLabel(/^Pro for/).selectOption("3");
  await expect(record.getByLabel(/^Amount/)).toHaveValue("15000");
  await record.getByLabel(/^Note/).fill("Transfer ref 0042");
  await record.getByRole("button", { name: "Record payment" }).click();
  await expect(
    record.getByText(`Recorded. @${buyer.username} has Pro for 3 months more.`),
  ).toBeVisible();
  await expect(page.locator(".payment-row", { hasText: `@${buyer.username}` })).toContainText(
    "₦15,000",
  );
  const member = page.locator(".member-row", { hasText: `@${buyer.username}` });
  await expect(member.getByText("Paid")).toBeVisible();

  const give = page.locator("section", { has: page.locator("#give-title") });
  await give.getByLabel("Username").fill(admin.username);
  await give.getByRole("button", { name: "Give Pro" }).click();
  await expect(page.locator(".member-row", { hasText: `@${admin.username}` })).toContainText(
    "Free",
  );

  await member.getByRole("button", { name: "End Pro" }).click();
  await expect(member).toHaveCount(0);
  // The payment stays on record.
  await expect(page.locator(".payment-row", { hasText: `@${buyer.username}` })).toBeVisible();
});
