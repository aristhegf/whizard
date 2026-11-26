import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

/** Makes a bank from the list's New bank pill and leaves the page on it. */
async function makeBank(page: Page, name: string, exam?: string, subject?: string) {
  await page.goto("/banks");
  await page.getByRole("link", { name: "New bank" }).click();
  await page.getByLabel("Name").fill(name);
  if (exam) await page.getByLabel("Exam").fill(exam);
  if (subject) await page.getByLabel("Subject").fill(subject);
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** Opens the bank's ⋯ sheet and picks one of its choices. */
async function fromSheet(page: Page, choice: string) {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("button", { name: choice, exact: true }).click();
}

/** Adds a question to a bank through the API, from the signed-in page. */
async function seedQuestion(
  page: Page,
  bankId: string,
  prompt: string,
  choices: string[],
  explanation: string,
) {
  const ok = await page.evaluate(
    async ({ bankId, body }) =>
      (
        await fetch(`/api/banks/${bankId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).ok,
    { bankId, body: { prompt, choices, explanation, reference: null } },
  );
  expect(ok).toBe(true);
}

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

test("offers a guest the way in before their banks", async ({ page }) => {
  await page.goto("/banks");
  await expect(page.getByRole("heading", { name: "Question banks", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in or create an account" })).toBeVisible();
});

test("makes a bank, writes a question, renames and clears up after itself", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());

  // The banks live in the menu under the avatar.
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await page
    .getByRole("group", { name: "Menu" })
    .getByRole("link", { name: "Question banks" })
    .click();
  await expect(page).toHaveURL(/\/banks$/);
  await expect(page.getByText("No banks yet.")).toBeVisible();

  // Make one, with its labels.
  await page.getByRole("link", { name: "New bank" }).click();
  await page.getByLabel("Name").fill("Biology jumpstart");
  await page.getByLabel("Exam").fill("WAEC");
  await page.getByLabel("Subject").fill("Biology");
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name: "Biology jumpstart", level: 1 })).toBeVisible();
  await expect(page.getByText("WAEC · Biology · 0 questions")).toBeVisible();

  // It shows in the list with its labels and count.
  await page.getByRole("link", { name: "Banks", exact: true }).click();
  const row = page.getByRole("link", { name: /Biology jumpstart/ });
  await expect(row).toContainText("WAEC · Biology");
  await expect(row).toContainText("0 questions");
  await row.click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);

  // The first question, on its own page: the form says what's missing before it takes it.
  await page.getByRole("button", { name: "Add a question" }).click();
  await expect(page.getByRole("heading", { name: "New question", level: 1 })).toBeVisible();
  await field(page, "Question").fill("Which planet is known as the Red Planet?");
  await field(page, "Correct answer").fill("Mars");
  await field(page, "Wrong answer 1").fill("Venus");
  await field(page, "Wrong answer 2").fill("Jupiter");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(
    page.getByText("Fill in the question, all four answers and the explanation."),
  ).toBeVisible();

  await field(page, "Wrong answer 3").fill("Saturn");
  await field(page, "Explanation").fill("Mars is red from the iron oxide on its surface.");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Biology jumpstart", level: 1 })).toBeVisible();
  await expect(page.getByText("WAEC · Biology · 1 question")).toBeVisible();

  // Open it to edit it.
  await page.getByRole("link", { name: /Which planet is known as the Red Planet\?/ }).click();
  await expect(page.getByRole("heading", { name: "Question 1", level: 1 })).toBeVisible();
  await expect(field(page, "Correct answer")).toHaveValue("Mars");
  await field(page, "Question").fill("Which planet do we call the Red Planet?");
  await page.getByRole("button", { name: "Save question", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Which planet do we call the Red Planet\?/ }),
  ).toBeVisible();

  // Rename the bank from the ⋯ sheet; the heading follows.
  await fromSheet(page, "Edit details");
  await page.getByLabel("Name").fill("Biology revision");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Bank saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Biology revision", level: 1 })).toBeVisible();

  // The question goes, after being sure.
  await page.getByRole("link", { name: /Which planet do we call/ }).click();
  await page.getByRole("button", { name: "Delete question", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete question" }).click();
  await expect(page.getByText("No questions yet.")).toBeVisible();
  await expect(page.getByText("0 questions")).toBeVisible();

  // And the bank itself, which lands back on an empty list.
  await fromSheet(page, "Delete bank");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete bank" }).click();
  await expect(page).toHaveURL(/\/banks$/);
  await expect(page.getByText("No banks yet.")).toBeVisible();
});

test("selects questions and deletes them together", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());
  await makeBank(page, "Bulk tidy");
  const url = page.url();
  const id = /\/banks\/(b_[A-Za-z0-9_-]+)/.exec(url)![1]!;
  for (const prompt of ["One?", "Two?", "Three?"]) {
    await seedQuestion(page, id, prompt, ["A", "B", "C", "D"], "Because.");
  }
  await page.reload();
  await expect(page.getByText("3 questions")).toBeVisible();

  await fromSheet(page, "Select questions");
  await page.getByRole("checkbox", { name: "One?" }).check();
  await page.getByRole("checkbox", { name: "Three?" }).check();
  await page.getByRole("button", { name: "Delete 2 questions" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete 2 questions" }).click();
  await expect(page.getByText("1 question", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Two\?/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /One\?/ })).toHaveCount(0);
});

test("starts solo practice room from a custom bank", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());

  await makeBank(page, "Physics Drills");
  await expect(page.getByRole("button", { name: "Practise", exact: true })).toBeDisabled();

  // Add one question
  await page.getByRole("button", { name: "Add a question" }).click();
  await field(page, "Question").fill("What is the speed of light in vacuum?");
  await field(page, "Correct answer").fill("300,000 km/s");
  await field(page, "Wrong answer 1").fill("150,000 km/s");
  await field(page, "Wrong answer 2").fill("3,000 km/s");
  await field(page, "Wrong answer 3").fill("Infinity");
  await field(page, "Explanation").fill("Light travels at approximately 299,792 km/s in vacuum.");
  await page.getByRole("button", { name: "Add question", exact: true }).click();

  await expect(page.getByRole("button", { name: "Practise", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Practise", exact: true }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
  await expect(page.getByRole("heading", { name: "Physics Drills Quiz" })).toBeVisible();

  // Start the game solo
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(
    page.getByText("What is the speed of light in vacuum?", { exact: false }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "300,000 km/s" }).click();
  await expect(page.getByRole("heading", { name: "Game Results" })).toBeVisible();
  await expect(page.getByText("1 of 1 correct")).toBeVisible();
  await expect(
    page.getByText("Light travels at approximately 299,792 km/s in vacuum."),
  ).toBeVisible();
});

test("publishes a bank to community, discovers it, and forks it", async ({ page, browser }) => {
  await withPasskeys(page);
  const author = uniqueUsername();
  await signUp(page, author);

  const bankTitle = `Chemistry ${Math.random().toString(36).slice(2, 8)}`;
  await makeBank(page, bankTitle, "JAMB", "Chemistry");

  // Add a question
  await page.getByRole("button", { name: "Add a question" }).click();
  await field(page, "Question").fill("What is the atomic number of carbon?");
  await field(page, "Correct answer").fill("6");
  await field(page, "Wrong answer 1").fill("12");
  await field(page, "Wrong answer 2").fill("14");
  await field(page, "Wrong answer 3").fill("8");
  await field(page, "Explanation").fill("Carbon has 6 protons in its nucleus.");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.getByText("JAMB · Chemistry · 1 question")).toBeVisible();

  // Make it public
  await fromSheet(page, "Make public");
  await expect(page.getByText("Anyone can find this bank now")).toBeVisible();

  // Switch to community tab to verify it appears
  await page.getByRole("link", { name: "Banks", exact: true }).click();
  await page.getByRole("button", { name: "Community" }).click();
  const communityRow = page.getByRole("link", { name: new RegExp(bankTitle) });
  await expect(communityRow).toBeVisible();
  await expect(communityRow).toContainText("by Ada");

  // Now a second user signs in and forks the bank
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await withPasskeys(secondPage);
    const student = uniqueUsername();
    await signUp(secondPage, student, "Student Marie");

    await secondPage.goto("/banks?tab=community");
    const studentRow = secondPage.getByRole("link", { name: new RegExp(bankTitle) });
    await expect(studentRow).toBeVisible();

    // The community preview: whose it is, its questions and their answers.
    await studentRow.click();
    await expect(secondPage.getByRole("heading", { name: bankTitle, level: 1 })).toBeVisible();
    await expect(secondPage.getByText("by Ada · JAMB · Chemistry · 1 question")).toBeVisible();
    await expect(secondPage.getByText("What is the atomic number of carbon?")).toBeVisible();
    await expect(secondPage.getByText("Right answer: 6", { exact: true })).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "More" })).toHaveCount(0);

    await secondPage.getByRole("button", { name: "Copy to my banks" }).click();
    await expect(
      secondPage.getByText(new RegExp(`Copied as “${bankTitle} \\(Copy\\)”`, "i")),
    ).toBeVisible();
    await expect(
      secondPage.getByRole("heading", { name: `${bankTitle} (Copy)`, level: 1 }),
    ).toBeVisible();

    // The copy is in the student's own banks
    await secondPage.getByRole("link", { name: "Banks", exact: true }).click();
    // Its row, not the "Copied as" toast, which can still be up.
    await expect(
      secondPage.getByRole("link", { name: new RegExp(`^${bankTitle} \\(Copy\\)`) }),
    ).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
