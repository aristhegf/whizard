import { expect, test } from "@playwright/test";
import { accountMenu, createRoomFromMenu, openMenu } from "./menu";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test("a guest can change sound and animations, and they're remembered", async ({ page }) => {
  await page.goto("/games");
  // Settings is in the side strip (and the avatar's menu).
  const panel = await openMenu(page);
  await panel.getByRole("button", { name: "Settings", exact: true }).click();

  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  const sound = settings.getByRole("switch", { name: "Sound" });
  const still = settings.getByRole("switch", { name: "Reduce animations" });
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await expect(still).toHaveAttribute("aria-checked", "false");

  await sound.click();
  await still.click();
  await expect(sound).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");
  await settings.getByRole("button", { name: "Done" }).click();
  await expect(settings).toBeHidden();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");

  // The same settings open from the room's bar.
  await createRoomFromMenu(page);
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await page.getByLabel("Choose a nickname").fill("Ada");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settings.getByRole("switch", { name: "Sound" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await settings.getByRole("switch", { name: "Reduce animations" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-reduce-motion");
});

test("the Play screen fits a laptop screen, and pages through the games", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  // Guests land on the page that introduces Whizard; the games are one click away.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Games are better together");
  await page.getByRole("link", { name: "See all games" }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole("heading", { name: "What do you want to play?" })).toBeVisible();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(720);

  // The top bar, the same on every page; everything else is in the strip down the left, with
  // the games and their kinds first.
  await expect(page.getByLabel("Room code")).toBeVisible();
  const panel = page.locator("#side-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: "Games", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Every game is in one row of cards at their own shape, with arrows at either end to move
  // along it.
  const cards = page.getByRole("list", { name: "Games" }).getByRole("listitem");
  await expect(cards).toHaveCount(11);
  const previous = page.getByRole("button", { name: "Previous games" });
  await expect(previous).toBeDisabled();
  // Where the row is wider than the screen, the arrow moves along it.
  const more = page.getByRole("button", { name: "More games" });
  if (await more.isEnabled()) {
    await more.click();
    await expect(previous).toBeEnabled();
  }
  // Every game in the catalogue is playable now.
  await expect(cards.filter({ hasText: "Most Likely To" })).not.toContainText("Soon");

  // The kinds of game, under Games in the panel, narrow it down.
  await panel.getByRole("link", { name: "Couples" }).click();
  await expect(page).toHaveURL(/\/games\?kind=couples$/);
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("How Well Do You Know Me?");

  // The menu under the avatar has Sign in and Settings.
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("group", { name: "Menu" });
  await expect(menu.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // The pages about Whizard are in a row at the bottom, still on the one screen.
  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link", { name: "About" })).toBeInViewport();
  await site.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(panel.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // The button beside the logo hides the strip, and the page has the screen to itself; pressed
  // again, the strip comes back.
  await page.getByRole("button", { name: "Hide menu" }).click();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Show menu" }).click();
  await expect(panel).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`mobile Games screen fits one ${viewport.width}x${viewport.height} viewport, and the menu picks a kind of game`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/games");

    await expect(page.getByRole("heading", { name: "What do you want to play?" })).toBeVisible();
    const cards = page.getByRole("list", { name: "Games to play" }).getByRole("listitem");
    await expect(cards.first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );

    // The strip down the left has every kind of game.
    const panel = await openMenu(page);
    for (const kind of ["Quiz", "Brain Games", "Puzzles", "Word & Skill", "Party & Social"]) {
      await expect(panel.getByRole("link", { name: kind })).toBeVisible();
    }
    await expect(panel.getByRole("link", { name: "Couples" })).toBeAttached();

    // Picking one narrows the games.
    await panel.getByRole("link", { name: "Brain Games" }).click();
    await expect(page).toHaveURL(/kind=brain$/);
    await expect(page.getByRole("link", { name: /Brain Games.*show all games/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
  });
}

test("phones find Create, the leaderboard and stats in the menu, with no tabs at the bottom", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
  let panel = await openMenu(page);
  await expect(panel.getByRole("button", { name: "Create a room" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Leaderboard" })).toBeVisible();
  await panel.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole("heading", { name: "What do you want to play?" })).toBeVisible();
  panel = await openMenu(page);
  await panel.getByRole("link", { name: "Stats" }).click();
  await expect(page).toHaveURL(/\/stats$/);
});

test("signed-in players find their profile and friends in the menu", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  await accountMenu(page).click();
  const menu = page.getByRole("group", { name: "Menu" });
  await menu.getByRole("link", { name: "Friends" }).click();
  await expect(page).toHaveURL(/\/friends$/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  // Signed in, the panel has the player's own pages.
  const panel = page.locator("#side-panel");
  await expect(panel.getByRole("link", { name: "My profile" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Friends" })).toBeVisible();
  await page.getByRole("button", { name: "Menu for Ada" }).click();
  await menu.getByRole("link", { name: "My profile" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("link", { name: "Friend requests" })).toBeVisible();
});
