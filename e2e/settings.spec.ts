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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Games\s*Are Better\s*Together/);
  await page.getByRole("link", { name: "Explore Games" }).click();
  await expect(page).toHaveURL(/\/games$/);
  await expect(page.getByRole("heading", { name: "What do you want to play?" })).toBeVisible();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(720);

  // The top bar, the same on every page.
  expect(await labels(page, "Main")).toEqual(["How it works", "Pricing", "Stats"]);
  await expect(page.getByLabel("Room code")).toBeVisible();

  // Quiz is the big card; six others show at a time, with arrows for the rest.
  await expect(page.getByRole("link", { name: "Play now" })).toBeVisible();
  const cards = page.getByRole("list", { name: "Games" }).getByRole("listitem");
  await expect(cards).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Previous games" })).toBeDisabled();
  await page.getByRole("button", { name: "More games" }).click();
  await expect(cards).toHaveCount(4);
  await expect(cards.filter({ hasText: "Impostor" })).toContainText("Coming soon");

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
  expect(await labels(page, "Main")).toEqual(["How it works", "Pricing", "Stats"]);
});

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
