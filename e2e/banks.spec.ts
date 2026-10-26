import { expect, test } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

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
  await expect(page.getByText("No banks yet. Make one above.")).toBeVisible();

  // Make one, with its optional labels.
  await page.getByLabel("Name").fill("Biology jumpstart");
  await page.getByLabel("Exam").fill("WAEC");
  await page.getByLabel("Subject").fill("Biology");
  await page.getByRole("button", { name: "Create a bank", exact: true }).click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name: "Biology jumpstart", level: 1 })).toBeVisible();

  // It shows in the list with its count.
  await page.getByRole("link", { name: /All banks/ }).click();
  const row = page.locator(".people li").filter({ hasText: "Biology jumpstart" });
  await expect(row).toContainText("WAEC · Biology · 0 questions");
  await row.getByRole("link").click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);

  // The first question: the form says so before it will take it.
  await page.getByRole("button", { name: "Add a question", exact: true }).click();
  // The questions section is labelled "Questions (…)", which would also catch a label match.
  const field = (name: string) => page.getByRole("textbox", { name });
  await field("Question").fill("Which planet is known as the Red Planet?");
  await field("Correct answer").fill("Mars");
  await field("Wrong answer 1").fill("Venus");
  await field("Wrong answer 2").fill("Jupiter");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(
    page.getByText("Fill in the question, all four answers and the explanation."),
  ).toBeVisible();

  await field("Wrong answer 3").fill("Saturn");
  await field("Explanation").fill("Mars is red from the iron oxide on its surface.");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Questions (1)", level: 2 })).toBeVisible();
  await expect(page.getByText("Correct: Mars")).toBeVisible();

  // Edit it, in place.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await field("Question").fill("Which planet do we call the Red Planet?");
  await page.getByRole("button", { name: "Save question", exact: true }).click();
  await expect(page.getByText("Which planet do we call the Red Planet?")).toBeVisible();

  // Rename the bank; the heading follows.
  await page.getByLabel("Name").fill("Biology revision");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Bank saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Biology revision", level: 1 })).toBeVisible();

  // The question goes, after being sure.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete question" }).click();
  await expect(page.getByText("No questions yet. Add the first one.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions (0)", level: 2 })).toBeVisible();

  // And the bank itself, which lands back on an empty list.
  await page.getByRole("button", { name: "Delete bank", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete bank" }).click();
  await expect(page).toHaveURL(/\/banks$/);
  await expect(page.getByText("No banks yet. Make one above.")).toBeVisible();
});

test("starts solo practice room from a custom bank", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());

  await page.goto("/banks");
  await page.getByLabel("Name").fill("Physics Drills");
  await page.getByRole("button", { name: "Create a bank", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice with this bank", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Practice solo" })).toBeDisabled();

  // Add one question
  await page.getByRole("button", { name: "Add a question", exact: true }).click();
  const field = (name: string) => page.getByRole("textbox", { name });
  await field("Question").fill("What is the speed of light in vacuum?");
  await field("Correct answer").fill("300,000 km/s");
  await field("Wrong answer 1").fill("150,000 km/s");
  await field("Wrong answer 2").fill("3,000 km/s");
  await field("Wrong answer 3").fill("Infinity");
  await field("Explanation").fill("Light travels at approximately 299,792 km/s in vacuum.");
  await page.getByRole("button", { name: "Add question", exact: true }).click();

  await expect(page.getByRole("button", { name: "Practice solo" })).toBeEnabled();
  await page.getByRole("button", { name: "Practice solo" }).click();
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
  await page.goto("/banks");
  await page.getByLabel("Name").fill(bankTitle);
  await page.getByLabel("Exam").fill("JAMB");
  await page.getByLabel("Subject").fill("Chemistry");
  await page.getByRole("button", { name: "Create a bank", exact: true }).click();

  // Add a question
  await page.getByRole("button", { name: "Add a question", exact: true }).click();
  const field = (name: string) => page.getByRole("textbox", { name });
  await field("Question").fill("What is the atomic number of carbon?");
  await field("Correct answer").fill("6");
  await field("Wrong answer 1").fill("12");
  await field("Wrong answer 2").fill("14");
  await field("Wrong answer 3").fill("8");
  await field("Explanation").fill("Carbon has 6 protons in its nucleus.");
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Questions (1)", level: 2 })).toBeVisible();

  // Make it public
  await page.getByRole("checkbox", { name: /Public bank/i }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Bank saved")).toBeVisible();

  // Switch to community tab to verify it appears
  await page.getByRole("link", { name: /All banks/ }).click();
  await page.getByRole("button", { name: "Community" }).click();
  const communityRow = page.locator(".people li").filter({ hasText: bankTitle });
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
    const studentRow = secondPage.locator(".people li").filter({ hasText: bankTitle });
    await expect(studentRow).toBeVisible();

    // Click on the bank to view community preview
    await studentRow.getByRole("link").first().click();
    await expect(
      secondPage.getByText("Community question bank shared with all Whizard players"),
    ).toBeVisible();
    await expect(secondPage.getByText("What is the atomic number of carbon?")).toBeVisible();
    await expect(secondPage.getByText("6", { exact: true })).toBeVisible();

    // Click Clone to my collection
    await secondPage
      .getByRole("button", { name: /Clone to my collection/i })
      .first()
      .click();
    await expect(
      secondPage.getByText(new RegExp(`Cloned "${bankTitle} \\(Copy\\)" to your collection!`, "i")),
    ).toBeVisible();
    await expect(
      secondPage.getByRole("heading", { name: `${bankTitle} (Copy)`, level: 1 }),
    ).toBeVisible();

    // The cloned bank is in the student's personal banks
    await secondPage.getByRole("link", { name: /All banks/ }).click();
    await expect(secondPage.getByText(`${bankTitle} (Copy)`)).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
