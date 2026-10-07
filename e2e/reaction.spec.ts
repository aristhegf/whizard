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

/** What this round asks for, as the announcement says it: "Tap the 🍌 Banana". */
async function targetName(page: Page): Promise<string> {
  const ask = await page.locator(".reaction-ask").textContent();
  return ask!.trim().split(/\s+/).at(-1)!;
}

test("a solo game: the wrong tile is turned down, the right one records the time", async ({
  page,
}) => {
  await openReaction(page, "Ada");
  await openSettings(page);
  await chooseSetting(page, "Level", "medium");
  await chooseSetting(page, "Rounds", "5");
  await closeSheet(page);
  // The lobby's one line about what's set up.
  await expect(page.locator(".summary")).toContainText("5 rounds, Medium level, 3s to tap");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  await expect(page.getByText("Get ready")).toBeVisible();
  // The announcement says what to tap through the countdown, then two tiles come up.
  await expect(page.locator(".reaction-ask")).toContainText("Tap the");
  for (let round = 1; round <= 5; round++) {
    await expect(page.locator(".play-count")).toContainText(`Round ${round} of 5`, {
      timeout: 15_000,
    });
    const grid = page.locator(".reaction-grid");
    await expect(grid.getByRole("button")).toHaveCount(2, { timeout: 15_000 });
    const name = await targetName(page);
    const target = grid.getByRole("button", { name, exact: true });
    if (round === 1) {
      // The wrong tile flashes red on the spot — and nothing locks: the target takes the next
      // tap at once, with no round trip in between.
      const tiles = grid.getByRole("button");
      let wrongIndex = 0;
      for (let i = 0; i < (await tiles.count()); i++) {
        if ((await tiles.nth(i).getAttribute("aria-label")) !== name) {
          wrongIndex = i;
          break;
        }
      }
      await tiles.nth(wrongIndex).click();
      await expect(grid.locator(".reaction-cell.wrong")).toHaveCount(1);
      await expect(target).toBeEnabled();
    }
    // Solo, finding the target ends the round on the spot and shows the time.
    await target.click();
    await expect(page.locator(".verdict")).toHaveText(/\d+ ms/, { timeout: 8_000 });
  }

  await expect(page.getByRole("heading", { name: "Reaction Results" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Fastest reaction")).toBeVisible();
  await expect(page.locator(".pill")).toContainText("5 rounds");
});

test("friends search the same grid and see the final times", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openReaction(host, "Ada");
  await openSettings(host);
  await chooseSetting(host, "Level", "insane");
  // The grid row appears with Insane: a 6×6 of 36 tiles.
  await chooseSetting(host, "Grid", "6");
  await chooseSetting(host, "Rounds", "5");
  await closeSheet(host);
  await expect(host.locator(".summary")).toContainText("5 rounds, Insane 6×6 level, 3s to tap");

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
    // Both search the same 36-tile grid for the same target.
    await Promise.all(
      [host, guest].map(async (page) => {
        const grid = page.locator(".reaction-grid");
        await expect(grid.getByRole("button")).toHaveCount(36, { timeout: 15_000 });
        const name = await targetName(page);
        await grid.getByRole("button", { name, exact: true }).click();
      }),
    );
    // Both times are up between rounds.
    if (round < 5) {
      for (const page of [host, guest]) {
        await expect(page.locator(".reaction-times li")).toHaveCount(2, { timeout: 8_000 });
      }
    }
  }

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Reaction Results" })).toBeVisible({
      timeout: 15_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem")).toHaveCount(2);
    await expect(rankings.getByRole("listitem").first()).toContainText(/\d/);
  }
});
