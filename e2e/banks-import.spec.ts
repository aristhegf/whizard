import { expect, test } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

const KEYED_CSV = [
  "question,option1,option2,option3,option4,answer,explanation",
  'Which planet is known as the Red Planet?,Mars,Venus,Jupiter,Saturn,Mars,"Iron oxide dust makes Mars red.",',
  'Which gas do plants absorb?,Oxygen,Carbon dioxide,Nitrogen,Helium,B,"Photosynthesis takes in carbon dioxide.",',
  '"What is ""the largest ocean""?",Atlantic,Pacific,Indian,Arctic,Pacific,"It covers about a third of the planet.",',
].join("\n");

const UNKEYED_CSV = [
  "question,option1,option2,option3,option4,answer,explanation",
  "First pick?,Alpha,Beta,Gamma,Delta,,,",
  "Second pick?,Alpha,Beta,Gamma,Delta,,,",
].join("\n");

/** Creates a bank from the banks list and leaves the page on its detail screen. */
async function makeBank(page: import("@playwright/test").Page, name: string) {
  await page.goto("/banks");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create a bank", exact: true }).click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);
  return /\/banks\/(b_[A-Za-z0-9_-]+)/.exec(page.url())![1]!;
}

test("imports a keyed CSV, exports it, and re-imports the answers intact", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());
  const bankId = await makeBank(page, "CSV round trip");

  // Stage the file; every row has its own answer key.
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "questions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(KEYED_CSV),
  });
  await expect(page.getByTestId("import-counts")).toContainText(
    "3 rows · 3 ready · 3 from your answer key · 0 from the AI · 0 need review",
  );

  // Confirm, and the questions land in the bank.
  await page.getByRole("button", { name: "Add 3 questions to the bank", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Add 3 questions" }).click();
  await expect(page.getByRole("heading", { name: "Questions (3)", level: 2 })).toBeVisible();
  await expect(page.getByText("Correct: Mars")).toBeVisible();
  await expect(page.getByText("Correct: Carbon dioxide")).toBeVisible();
  await expect(page.getByText("Correct: Pacific")).toBeVisible();

  // Export comes back as a CSV with the right shape and the answers spelled out.
  const exported = await page.request.get(`/api/banks/${bankId}/export`);
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-type"]).toContain("text/csv");
  const csv = await exported.text();
  expect(csv.split("\n")[0]).toBe(
    "question,option1,option2,option3,option4,answer,explanation,reference",
  );
  expect(csv).toContain('"What is ""the largest ocean""?"');

  // The exported file imports into a fresh bank with every answer intact.
  const secondId = await makeBank(page, "CSV round trip, again");
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "exported.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByTestId("import-counts")).toContainText(
    "3 rows · 3 ready · 3 from your answer key · 0 from the AI · 0 need review",
  );
  await page.getByRole("button", { name: "Add 3 questions to the bank", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Add 3 questions" }).click();
  await expect(page.getByRole("heading", { name: "Questions (3)", level: 2 })).toBeVisible();
  await expect(page.getByText("Correct: Mars")).toBeVisible();
  await expect(page.getByText("Correct: Carbon dioxide")).toBeVisible();
  await expect(page.getByText("Correct: Pacific")).toBeVisible();

  // Clean up after itself.
  await page.getByRole("button", { name: "Delete bank", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete bank" }).click();
  await expect(page).toHaveURL(/\/banks$/);
  void secondId;
});

test("answers key-less rows by hand when the AI isn’t configured", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());
  await makeBank(page, "CSV by hand");

  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "unkeyed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(UNKEYED_CSV),
  });

  // Nothing is ready; the server's lack of an AI key is said plainly, not hidden.
  await expect(page.getByTestId("import-counts")).toContainText(
    "2 rows · 0 ready · 0 from your answer key · 0 from the AI · 2 need review",
  );
  await expect(
    page.getByText(
      "AI answers aren’t set up on this server yet. Give every question an answer yourself.",
    ),
  ).toBeVisible();

  // Tick both rows and set them to the same answer in one move.
  const ticks = page.getByRole("checkbox");
  await ticks.nth(0).check();
  await ticks.nth(1).check();
  await page.getByLabel("Answer for the rows you tick").selectOption("0");
  await page.getByRole("button", { name: "Set 2 rows to that answer", exact: true }).click();

  await expect(page.getByTestId("import-counts")).toContainText(
    "2 rows · 2 ready · 0 from your answer key · 0 from the AI · 0 need review",
  );
  await page.getByRole("button", { name: "Add 2 questions to the bank", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Add 2 questions" }).click();
  await expect(page.getByRole("heading", { name: "Questions (2)", level: 2 })).toBeVisible();
  await expect(page.getByText("Correct: Alpha")).toHaveCount(2);
});
