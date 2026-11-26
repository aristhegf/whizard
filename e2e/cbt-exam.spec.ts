import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

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

test("runs a timed exam: hidden answers, flagging, the question map, the result and its review", async ({
  page,
}) => {
  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username, "CBT Scholar");

  // 1. Create a question bank
  await page.goto("/banks?new=1");
  const uniqueBankTitle = `WAEC CBT Biology ${Math.random().toString(36).slice(2, 8)}`;
  await page.getByLabel("Name").fill(uniqueBankTitle);
  await page.getByLabel("Exam").fill("WAEC");
  await page.getByLabel("Subject").fill("Biology");
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page.getByRole("heading", { name: uniqueBankTitle, level: 1 })).toBeVisible();

  // 2. Add two questions with explanations
  const field = (name: string) => page.getByRole("textbox", { name, exact: true });
  await page.getByRole("button", { name: "Add a question" }).click();
  await field("Question").fill("Which cell organelle is known as the powerhouse of the cell?");
  await field("Correct answer").fill("Mitochondria");
  await field("Wrong answer 1").fill("Ribosome");
  await field("Wrong answer 2").fill("Endoplasmic reticulum");
  await field("Wrong answer 3").fill("Golgi body");
  await field("Explanation").fill(
    "Mitochondria generate most of the chemical energy needed to power the cell's biochemical reactions.",
  );
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "Which cell organelle is known as the powerhouse of the cell?",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add a question" }).click();
  await field("Question").fill(
    "What green pigment in plants absorbs light energy for photosynthesis?",
  );
  await field("Correct answer").fill("Chlorophyll");
  await field("Wrong answer 1").fill("Carotenoid");
  await field("Wrong answer 2").fill("Anthocyanin");
  await field("Wrong answer 3").fill("Xanthophyll");
  await field("Explanation").fill(
    "Chlorophyll is the green pigment in chloroplasts responsible for light absorption.",
  );
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "What green pigment in plants absorbs light energy for photosynthesis?",
    }),
  ).toBeVisible();

  // 3. The timed exam, from the bank
  await page.getByRole("button", { name: "Timed exam" }).click();
  await expect(page.getByRole("heading", { name: "Timed exam", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "All 2" })).toHaveAttribute("aria-pressed", "true");

  // 4. Start it
  await page.getByRole("button", { name: /^Start/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();

  // Pick an answer on question 1: it is chosen, and nothing says whether it's right.
  const answers = page.getByRole("group", { name: "Answers" }).getByRole("button");
  await answers.first().click();
  await expect(answers.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".exam-choice.right, .exam-choice.wrong")).toHaveCount(0);

  // Flag it; the map shows it answered and flagged.
  await page.getByRole("button", { name: "Flag", exact: true }).click();
  await expect(page.getByRole("button", { name: "Flagged", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: /1 answered · 1 flagged/ }).click();
  const map = page.getByRole("dialog");
  await expect(map.getByRole("button", { name: "Question 1, answered, flagged" })).toBeVisible();

  // Jump to question 2 from the map and answer it.
  await map.getByRole("button", { name: "Question 2, not answered" }).click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await answers.first().click();

  // On a computer the map is a rail beside the question.
  await page.setViewportSize({ width: 1440, height: 900 });
  const rail = page.getByRole("complementary", { name: "All questions" });
  await expect(rail.getByText("2 answered · 1 flagged")).toBeVisible();
  await rail.getByRole("button", { name: /^Question 1,/ }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await page.setViewportSize({ width: 412, height: 915 });

  // Submit, after being sure.
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("heading", { name: "Submit your exam?" })).toBeVisible();
  await confirm.getByRole("button", { name: "Submit" }).click();

  // 5. The result and its review
  await expect(
    page.getByRole("heading", { name: /^Timed exam · done in/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/^\d+%$/)).toBeVisible();
  await expect(page.getByText(/^\d of 2$/)).toBeVisible();
  await page.getByRole("button", { name: "All 2" }).click();
  await expect(page.getByRole("heading", { name: "All answers", level: 2 })).toBeVisible();
  await expect(page.locator(".exam-review-item")).toHaveCount(2);
  await expect(
    page.getByText(
      "Chlorophyll is the green pigment in chloroplasts responsible for light absorption.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Flagged 1" })).toBeVisible();
});

test("practises the questions missed in an exam until each is right", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());
  await page.goto("/banks?new=1");
  await page.getByLabel("Name").fill("Missed practice");
  await page.getByRole("button", { name: "Create bank", exact: true }).click();
  await expect(page).toHaveURL(/\/banks\/b_[A-Za-z0-9_-]+$/);
  const id = /\/banks\/(b_[A-Za-z0-9_-]+)/.exec(page.url())![1]!;
  await seedQuestion(
    page,
    id,
    "Which is the largest planet?",
    ["Jupiter", "Mars", "Venus", "Mercury"],
    "Jupiter is more than twice the mass of the other planets together.",
  );

  await page.goto(`/banks/${id}/exam`);
  await page.getByRole("button", { name: /^Start/ }).click();
  // Skip it, then submit: a skipped question counts as missed.
  await page.getByRole("button", { name: "Finish" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("0%")).toBeVisible();

  await page.getByRole("button", { name: "Practise the 1 you missed" }).click();
  await expect(page.getByRole("heading", { name: "Which is the largest planet?" })).toBeVisible();
  await page.getByRole("button", { name: "Jupiter" }).click();
  await expect(page.getByText("Right", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "All 1 mistake fixed" })).toBeVisible();
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(page.getByText("0%")).toBeVisible();
});
