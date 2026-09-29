import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

/** The words on each link or button in a navigation bar, in order. */
async function labels(page: Page, name: string) {
  const bar = page.getByRole("navigation", { name });
  await expect(bar.locator("a, button").first()).toBeVisible();
  return (await bar.locator("a, button").allInnerTexts()).map((t) => t.trim());
}

test("a guest can change sound and animations, and they're remembered", async ({ page }) => {
  await page.goto("/games");
  // There's no menu button on phones any more: Settings is in the top bar.
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();

  const settings = page.getByRole("dialog", { name: "Settings" });
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
  await page.goto("/");
  await page.getByRole("button", { name: "Create a Room" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await page.getByLabel("Choose a nickname").fill("Ada");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(settings.getByRole("switch", { name: "Sound" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await settings.getByRole("switch", { name: "Reduce animations" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-reduce-motion");
});

test("guests get Games, Pricing, About and Stats, on every page", async ({ page }) => {
  // Phones: the tabs at the bottom.
  await page.goto("/");
  expect(await labels(page, "Sections")).toEqual(["Games", "Pricing", "Stats", "Profile"]);
  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Pricing" })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);

  // Wide screens: the top bar, the same on every page, with the site links in the footer too.
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ["/", "/games", "/games/quiz", "/account", "/about"]) {
    await page.goto(path);
    expect(await labels(page, "Main")).toEqual(["Games", "Pricing", "About", "Stats"]);
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    const footer = page.getByRole("navigation", { name: "About Whizard" });
    for (const name of ["Pricing", "About", "Stats", "Privacy"]) {
      await expect(footer.getByRole("link", { name })).toBeAttached();
    }
    // The sign-in page doesn't offer Sign In a second time.
    await expect(page.getByRole("link", { name: "Sign In", exact: true })).toHaveCount(
      path === "/account" ? 0 : 1,
    );
  }
});

test("signed-in players get Games, Friends and Create, and their avatar for the profile", async ({
  page,
}) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  const tabs = page.getByRole("navigation", { name: "Sections" });
  expect(await labels(page, "Sections")).toEqual(["Games", "Friends", "Create", "Profile"]);
  await expect(tabs.getByRole("link", { name: "Profile" }).locator("img.avatar")).toBeVisible();
  await tabs.getByRole("link", { name: "Friends" }).click();
  await expect(page).toHaveURL(/\/friends$/);
  await tabs.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/games");
  expect(await labels(page, "Main")).toEqual(["Games", "Friends", "Create"]);
});
