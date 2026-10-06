import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseSetting, closeSheet, openSettings } from "./lobby";

test.describe.configure({ timeout: 120_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

/** Opens Memory from the games page and joins its new room. */
async function openMemory(page: Page, nickname: string) {
  await page.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await page
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await page.getByRole("button", { name: "Play Memory" }).click();
  await joinAs(page, nickname);
}

/** Waits for the question (after the countdown and the reveal) and picks the first answer. */
async function answerFirst(page: Page) {
  const choices = page.locator("button.choice");
  await expect(choices).toHaveCount(4, { timeout: 12_000 });
  await choices.first().click();
  // The choices leave for the round's answers: the round really ended.
  await expect(choices).toHaveCount(0, { timeout: 8_000 });
}

test("a solo game: the items show, the question follows, and the scores add up", async ({
  page,
}) => {
  await openMemory(page, "Ada");
  await openSettings(page);
  await chooseSetting(page, "Rounds", "5");
  await chooseSetting(page, "Time to remember", "3");
  await closeSheet(page);
  // The lobby's one line about what's set up.
  await expect(page.locator(".summary")).toContainText("5 rounds, 3s to remember");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  await expect(page.getByText("Get ready")).toBeVisible();
  // The six items come up for their three seconds, then the question about them.
  await expect(page.getByLabel("Items to remember").getByRole("listitem")).toHaveCount(6, {
    timeout: 15_000,
  });
  const choices = page.locator("button.choice");
  await expect(choices).toHaveCount(4, { timeout: 12_000 });
  await choices.first().click();
  await expect(choices).toHaveCount(0, { timeout: 8_000 });
  // Solo, the round ends on the spot and shows its verdict and the right answer.
  await expect(page.locator(".verdict")).toBeVisible();
  await expect(page.locator(".choice.correct")).toHaveCount(1);

  for (let round = 2; round <= 5; round++) {
    await expect(page.locator(".play-count")).toContainText(`Round ${round} of 5`, {
      timeout: 15_000,
    });
    await expect(page.getByLabel("Items to remember").getByRole("listitem")).toHaveCount(6, {
      timeout: 15_000,
    });
    await answerFirst(page);
  }

  await expect(page.getByRole("heading", { name: "Memory Results" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".solo-score")).toBeVisible();
  await expect(page.locator(".pill")).toContainText("5 rounds");
});

test("two friends answer the same question and see the final scores", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openMemory(host, "Ada");
  await openSettings(host);
  await chooseSetting(host, "Rounds", "5");
  await chooseSetting(host, "Time to remember", "3");
  await closeSheet(host);

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await host.getByRole("button", { name: /start game/i }).press("Enter");

  for (let round = 1; round <= 5; round++) {
    for (const page of [host, guest]) {
      await expect(page.locator(".play-count")).toContainText(`Round ${round} of 5`, {
        timeout: 15_000,
      });
    }
    await Promise.all([answerFirst(host), answerFirst(guest)]);
    // Both answers are up between rounds.
    if (round < 5) {
      for (const page of [host, guest]) {
        await expect(page.locator(".memory-answers li")).toHaveCount(2, { timeout: 8_000 });
      }
    }
  }

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Memory Results" })).toBeVisible({
      timeout: 15_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem")).toHaveCount(2);
    await expect(rankings.getByRole("listitem").first()).toContainText(/\d/);
  }
});
