import { expect, type Page } from "@playwright/test";

/** The side panel: the strip of icons down the left, brought back if it was hidden. */
export async function openMenu(page: Page) {
  const show = page.getByRole("button", { name: "Show menu" });
  if (await show.isVisible()) await show.click();
  const panel = page.locator("#side-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Opens a new room from the side panel's "Create a room". */
export async function createRoomFromMenu(page: Page) {
  const panel = await openMenu(page);
  await panel.getByRole("button", { name: "Create a room" }).click();
}

/** The account menu: the avatar at the end of the top bar. */
export const accountMenu = (page: Page) => page.getByRole("button", { name: /^Menu( for |$)/ });
