import { expect, type Locator, type Page } from "@playwright/test";

/** On phones the lobby's game settings open in a sheet; wider screens show them already. */
export async function openSettings(page: Page) {
  await page.locator(".lobby").waitFor();
  const button = page.getByRole("button", { name: "Game settings" });
  if (await button.isVisible()) {
    await button.click();
    await page.locator("dialog.sheet[open]").waitFor();
  }
}

/** On phones the game's card, with Change topic and Change Game, opens from the game line. */
export async function openGameCard(page: Page) {
  await page.locator(".lobby").waitFor();
  const line = page.getByRole("button", { name: "About the game" });
  if (await line.isVisible()) {
    await line.click();
    await page.locator("dialog.sheet[open]").waitFor();
  }
}

/** Closes whichever sheet is open, so the rest of the lobby can be used again. */
export async function closeSheet(page: Page) {
  const sheet = page.locator("dialog.sheet[open]");
  if (await sheet.count()) {
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
  }
}

type Scope = Page | Locator;

/**
 * A setting in the lobby, by its label: the button that shows its choice and opens the others
 * under it. Its name is the label, a colon and the choice, as in "Questions: 10".
 */
export function setting(scope: Scope, label: string | RegExp): Locator {
  // A label given as words is matched whole, so "Questions" isn't also "Questions per round".
  const name = typeof label === "string" ? new RegExp(`^${label}: `, "i") : label;
  return scope.getByRole("button", { name });
}

/** Opens a setting and picks the option with this value. */
export async function chooseSetting(scope: Scope, label: string | RegExp, value: string) {
  const head = setting(scope, label);
  await head.click();
  await head.locator("..").locator(`[role="option"][data-value="${value}"]`).click();
  await expect(head).toHaveAttribute("data-value", value);
}

/** Checks which value a setting is on. */
export async function expectSetting(scope: Scope, label: string | RegExp, value: string) {
  await expect(setting(scope, label)).toHaveAttribute("data-value", value);
}
