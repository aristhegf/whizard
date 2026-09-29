import { expect, test } from "@playwright/test";

test("the about page tells the story and shows the community's numbers", async ({ page }) => {
  await page.goto("/");
  // On phones the site's pages are in the menu under "Me".
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await page
    .getByRole("navigation", { name: "About Whizard" })
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("More ThanJust a Quiz.");

  for (const heading of [
    "Built for People, Not Just Players.",
    "Fun Brings People Closer",
    "A Growing Global Community",
    "Ready to be part of the story?",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  for (const belief of ["Connection First", "Learning Can Be Fun", "For Everyone"]) {
    await expect(page.getByRole("heading", { name: belief })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /to churches and communities/ })).toBeVisible();

  // The numbers come from the live stats, not the design.
  const played = page.locator(".impact-stat", { hasText: "Games played" }).locator("strong");
  await expect(played).toHaveText(/^\d[\d,]*$/);

  await page.getByRole("button", { name: "Create a Room" }).first().click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
});
