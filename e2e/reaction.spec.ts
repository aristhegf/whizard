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

/** Opens Reaction from the games page and joins its new room. */
async function openReaction(page: Page, nickname: string) {
  await page.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await page
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await page.getByRole("button", { name: "Play Reaction" }).click();
  await joinAs(page, nickname);
}

/** Waits for the pad to light up (a signal can come 1.5 to 4 seconds in) and taps it. */
async function tapWhenGreen(page: Page) {
  await page.getByRole("button", { name: "Tap now!" }).click({ timeout: 8000 });
}

test("a solo game: a false start loses the round, and the rest go on green", async ({ page }) => {
  await openReaction(page, "Ada");
  await openSettings(page);
  await chooseSetting(page, "Rounds", "5");
  await closeSheet(page);
  // The lobby's one line about what's set up.
  await expect(page.locator(".summary")).toContainText("5 rounds, 3s to tap");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  await expect(page.getByText("Get ready")).toBeVisible();
  // The pad appears for the wait: tapping before the signal is a false start.
  const waiting = page.getByRole("button", { name: "Wait for the signal" });
  await expect(waiting).toBeVisible({ timeout: 8000 });
  await waiting.click();
  // Solo, the round ends on the spot and shows its verdict: the time is none.
  await expect(page.locator(".verdict")).toHaveText(/False start/);

  for (let round = 2; round <= 5; round++) {
    await expect(page.locator(".play-count")).toContainText(`Round ${round} of 5`, {
      timeout: 15_000,
    });
    await tapWhenGreen(page);
    await expect(page.locator(".verdict")).toHaveText(/\d+ ms/, { timeout: 8000 });
  }

  await expect(page.getByRole("heading", { name: "Reaction Results" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Fastest reaction")).toBeVisible();
  await expect(page.locator(".pill")).toContainText("5 rounds");
});

test("friends race the same signal and see the final times", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openReaction(host, "Ada");
  await openSettings(host);
  await chooseSetting(host, "Rounds", "5");
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
    await Promise.all([tapWhenGreen(host), tapWhenGreen(guest)]);
    // Both times are up between rounds.
    if (round < 5) {
      for (const page of [host, guest]) {
        await expect(page.locator(".reaction-times li")).toHaveCount(2, { timeout: 8000 });
      }
    }
  }

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Reaction Results" })).toBeVisible({
      timeout: 15_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem")).toHaveCount(2);
    await expect(rankings.getByRole("listitem").first()).toContainText(/ms|s\b/);
  }
});
