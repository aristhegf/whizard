import { expect, test } from "@playwright/test";

test("a guest can change sound and animations from the menu, and they're remembered", async ({
  page,
}) => {
  await page.goto("/games");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("dialog", { name: "Menu" })
    .getByRole("button", { name: "Settings" })
    .click();

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
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const nickname = page.getByLabel("Choose a nickname");
  await nickname.fill("Ada");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(settings.getByRole("switch", { name: "Sound" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await settings.getByRole("switch", { name: "Reduce animations" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-reduce-motion");
});

test("wide screens get the same top bar on every page, with the site links in the footer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ["/", "/games", "/games/quiz", "/account", "/about"]) {
    await page.goto(path);
    const bar = page.getByRole("navigation", { name: "Main" });
    for (const name of ["Games", "Quiz Topics", "Friends"]) {
      await expect(bar.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(bar.getByRole("button", { name: "Create" })).toBeVisible();
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
