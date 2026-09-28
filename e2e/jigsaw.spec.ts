import { expect, test, type Browser, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("list", { name: "Players" })).toBeVisible();
}

/** Puts every piece in its place: tap the piece that belongs in the first wrong spot, then the spot. */
async function solve(page: Page) {
  const pieces = page.locator(".jigsaw-piece");
  // Pieces can move once the countdown ends.
  await expect(page.locator(".jigsaw-piece:enabled").first()).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 60; i++) {
    const board = await pieces.evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).dataset.piece)),
    );
    const spot = board.findIndex((piece, at) => piece !== at);
    if (spot === -1) return;
    await pieces.nth(board.indexOf(spot)).click();
    await pieces.nth(spot).click();
    // The last swap can end the game, and the board with it.
    await expect
      .poll(
        async () =>
          (await pieces.count()) === 0 ||
          (await pieces.nth(spot).getAttribute("data-piece")) === String(spot),
      )
      .toBe(true);
    if ((await pieces.count()) === 0) return;
  }
  throw new Error("The puzzle didn't come together.");
}

test("plays a solo jigsaw from the picture page", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/games");
  await page.getByRole("link", { name: /Jigsaw/ }).click();
  await expect(page).toHaveURL(/\/games\/jigsaw$/);

  await page.getByRole("button", { name: /Easy · 9 pieces/ }).click();
  await page.getByRole("button", { name: "The crew" }).click();
  await joinAs(page, "Ada");
  await expect(page.getByLabel("Picture", { exact: true })).toHaveValue("crew");
  await expect(page.getByLabel("Pieces", { exact: true })).toHaveValue("3");

  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText(/Get ready/)).toBeVisible();
  await expect(page.locator(".jigsaw-piece")).toHaveCount(9);

  // A piece in its place locks.
  const pieces = page.locator(".jigsaw-piece");
  const board = await pieces.evaluateAll((els) =>
    els.map((el) => Number((el as HTMLElement).dataset.piece)),
  );
  await expect(pieces.first()).toBeEnabled({ timeout: 10_000 });
  await pieces.nth(board.indexOf(0)).click();
  await pieces.nth(0).click();
  await expect(pieces.nth(0)).toBeDisabled();

  await solve(page);
  await expect(page.getByRole("heading", { name: /Jigsaw\s+Results/ })).toBeVisible();
  await expect(page.getByText("Solved in")).toBeVisible();
  await expect(page.getByText(/^\d+ moves?$/)).toBeVisible();

  // Change Picture goes back to the lobby with the same settings.
  await page.getByRole("button", { name: "Change Picture" }).click();
  await expect(page.getByLabel("Picture", { exact: true })).toHaveValue("crew");
});

test("two players race the same puzzle, and the faster one wins", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 9 pieces/ }).click();
  await host.getByRole("button", { name: "Game night" }).click();
  await joinAs(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.locator(".game-summary")).toContainText("Game night");

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) await expect(page.locator(".jigsaw-piece")).toHaveCount(9);

  // Both start from the same shuffle.
  const boardOf = (page: Page) =>
    page
      .locator(".jigsaw-piece")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.piece));
  expect(await boardOf(host)).toEqual(await boardOf(guest));

  await solve(guest);
  await expect(guest.getByText(/Waiting for everyone to finish/)).toBeVisible();
  await solve(host);

  for (const page of [host, guest]) {
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem").first()).toContainText("Tolu");
    await expect(rankings.getByRole("listitem").nth(1)).toContainText("Ada");
  }
});
