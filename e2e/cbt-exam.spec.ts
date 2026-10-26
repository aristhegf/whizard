import { expect, test } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

test("runs timed CBT exam simulation mode with delayed answer reveals, flagging, and comprehensive review", async ({
  page,
}) => {
  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username, "CBT Scholar");

  // 1. Create a question bank
  await page.goto("/banks");
  const uniqueBankTitle = `WAEC CBT Biology ${Math.random().toString(36).slice(2, 8)}`;
  await page.getByLabel("Name").fill(uniqueBankTitle);
  await page.getByLabel("Exam").fill("WAEC");
  await page.getByLabel("Subject").fill("Biology");
  await page.getByRole("button", { name: "Create a bank", exact: true }).click();
  await expect(page.getByRole("heading", { name: uniqueBankTitle, level: 1 })).toBeVisible();

  // 2. Add two questions with explanations
  await page.getByRole("button", { name: "Add a question", exact: true }).click();
  const field = (name: string) => page.getByRole("textbox", { name });
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
    page.getByText("Which cell organelle is known as the powerhouse of the cell?"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add a question", exact: true }).click();
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
    page.getByText("What green pigment in plants absorbs light energy for photosynthesis?"),
  ).toBeVisible();

  // 3. Launch Timed CBT Exam Simulation from bank detail page
  const cbtBtn = page.getByRole("button", { name: /Timed CBT Exam/i });
  await expect(cbtBtn).toBeVisible();
  await cbtBtn.click();

  // Setup phase
  await expect(page.getByRole("heading", { name: uniqueBankTitle })).toBeVisible();
  await expect(page.getByText("Timed CBT Simulation")).toBeVisible();
  await expect(page.getByText("Experience real exam conditions")).toBeVisible();

  // Desktop viewport check & screenshot
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "test-results/cbt-exam-setup-desktop-1440x900.png" });

  // 4. Start Exam
  await page.getByRole("button", { name: /Start Exam Simulation/i }).click();

  // Verify Active CBT Exam screen
  await expect(page.locator(".cbt-header")).toBeVisible();
  await expect(page.locator(".cbt-timer")).toBeVisible();
  await expect(page.locator(".cbt-badge")).toHaveText("CBT Mode");
  await expect(page.getByText(/Question 1 of 2/)).toBeVisible();

  // Select an answer on question 1
  const firstChoice = page.locator(".cbt-choice").first();
  await firstChoice.click();
  await expect(firstChoice).toHaveClass(/picked/);

  // Verify NO immediate answer feedback (no green/red reveals)
  await expect(page.locator(".choice.correct")).toHaveCount(0);
  await expect(page.locator(".choice.wrong")).toHaveCount(0);

  // Flag Question 1 for review
  const flagBtn = page.locator(".cbt-flag-toggle");
  await flagBtn.click();
  await expect(flagBtn).toHaveClass(/flagged/);
  await expect(page.locator(".palette-flag-dot")).toHaveCount(1);

  // Take screenshot of active exam simulation on desktop and mobile
  await page.screenshot({ path: "test-results/cbt-exam-active-desktop-1440x900.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/cbt-exam-active-mobile-390x844.png" });
  await page.setViewportSize({ width: 1440, height: 900 });

  // Jump to Question 2 using palette
  const q2PaletteBtn = page.locator(".cbt-palette-btn").nth(1);
  await q2PaletteBtn.click();
  await expect(page.getByText(/Question 2 of 2/)).toBeVisible();

  // Answer question 2
  await page.locator(".cbt-choice").first().click();

  // Click Submit Exam
  await page.getByRole("button", { name: "Submit Exam" }).click();

  // Confirmation modal opens
  await expect(page.getByRole("heading", { name: "Submit Exam Simulation?" })).toBeVisible();
  await expect(
    page.locator(".cbt-modal-card").getByText("Answered", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, Submit Exam" }).click();

  // 5. Results & Comprehensive Review
  await expect(page.getByRole("heading", { name: "Exam Simulation Complete" })).toBeVisible();
  await expect(page.locator(".cbt-score-card")).toBeVisible();
  await expect(page.getByText("Question-by-Question Review & Explanations")).toBeVisible();
  await expect(page.locator(".cbt-review-card")).toHaveCount(2);

  // Explanation and source are present in review
  await expect(page.locator(".cbt-review-explanation").first()).toBeVisible();

  // Screenshot Desktop Results
  await page.screenshot({ path: "test-results/cbt-exam-results-desktop-1440x900.png" });

  // Screenshot Mobile (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/cbt-exam-results-mobile-390x844.png" });

  // Screenshot Short Mobile (375x667)
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: "test-results/cbt-exam-results-short-375x667.png" });
});
