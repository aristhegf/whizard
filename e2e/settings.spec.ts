import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

/** The words on each link or button in a navigation bar, in order. */
async function labels(page: Page, name: string) {
  const bar = page.getByRole("navigation", { name });
  await expect(bar.locator("a, button").first()).toBeVisible();
  // The words as written: the bar shows them in capitals.
  return (await bar.locator("a, button").allTextContents()).map((t) => t.trim());
}

test("a guest can change sound and animations, and they're remembered", async ({ page }) => {
  await page.goto("/games");
  // On phones, Settings is in the menu under "Me".
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

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
  await page.getByRole("button", { name: "Create", exact: true }).click();
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

  // The top bar, the same on every page.
  expect(await labels(page, "Main")).toEqual(["Games", "Pricing", "Stats"]);
  await expect(page.getByLabel("Room code")).toBeVisible();

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

  // The kinds of game narrow it down.
  await page.getByRole("button", { name: "Couples" }).click();
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
  expect(await labels(page, "Main")).toEqual(["Games", "Pricing", "Stats"]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`mobile Games screen fits one ${viewport.width}x${viewport.height} viewport and categories fit without scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/games");

    await expect(page.getByRole("heading", { name: "What do you want to play?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Categories/ })).toBeVisible();
    const card = page.getByRole("list", { name: "Games to play" }).getByRole("listitem").first();
    await expect(card).toBeVisible();
    await expect(page.locator(".play-featured")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );

    await page.getByRole("button", { name: /Categories/ }).click();
    const sheet = page.getByRole("dialog", { name: "Game Categories" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "All Games" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Couples" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Brain Games" })).toBeVisible();
    await expect(sheet.locator(".category-options")).toHaveCSS("overflow-y", "hidden");

    // Once the sheet's slide-in has settled, every row fits inside the viewport. The sheet opens
    // over the cards like a menu (they're blurred behind it), so they keep their size.
    await sheet.evaluate(async (el) => {
      const running = el.getAnimations();
      if (running.length) await Promise.all(running.map((a) => a.finished.catch(() => {})));
    });
    const sheetBox = await sheet.boundingBox();
    const couplesBox = await sheet.getByRole("button", { name: "Couples" }).boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(couplesBox).not.toBeNull();
    expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(couplesBox!.y + couplesBox!.height).toBeLessThanOrEqual(
      sheetBox!.y + sheetBox!.height + 1,
    );

    await sheet.getByRole("button", { name: "Brain Games" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: /Categories.*Brain Games/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewport.height,
    );
  });
}

test("phones get Play, Create, Leaderboard, Stats and Me at the bottom", async ({ page }) => {
  await page.goto("/");
  expect(await labels(page, "Sections")).toEqual(["Play", "Create", "Leaderboard", "Stats", "Me"]);
  const tabs = page.getByRole("navigation", { name: "Sections" });
  // A guest's home page introduces Whizard, so their Play goes on to the games themselves.
  await tabs.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole("heading", { name: "What do you want to play?" })).toBeVisible();
  await tabs.getByRole("link", { name: "Stats" }).click();
  await expect(page).toHaveURL(/\/stats$/);
});

test("signed-in players find their profile and friends in the menu", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  await page.getByRole("button", { name: "Me", exact: true }).click();
  const menu = page.getByRole("group", { name: "Menu" });
  await menu.getByRole("link", { name: "Friends" }).click();
  await expect(page).toHaveURL(/\/friends$/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  // Signed in, the top bar is about playing rather than explaining Whizard.
  expect(await labels(page, "Main")).toEqual(["Play", "Create", "Stats", "Leaderboard"]);
  await page.getByRole("button", { name: "Menu for Ada" }).click();
  await menu.getByRole("link", { name: "My profile" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("link", { name: "Friend requests" })).toBeVisible();
});
