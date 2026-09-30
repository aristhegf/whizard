import { expect, test, type Browser, type Page } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

function playerRow(page: Page, nickname: string) {
  return page
    .getByRole("list", { name: "Players" })
    .getByRole("listitem")
    .filter({ hasText: nickname });
}

/** Picks a skin tone and a background in the creator, and saves. */
async function makeAvatar(page: Page) {
  await expect(page.getByRole("heading", { name: "Build your Whizard" })).toBeVisible();
  await page
    .getByRole("radiogroup", { name: "Skin tone" })
    .getByRole("radio", { name: "Tone 2" })
    .click();
  await page.getByRole("tab", { name: "Colour", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Background" })
    .getByRole("radio", { name: "Blue" })
    .click();
  // The preview draws the avatar with both.
  await expect(page.getByRole("img", { name: "Your avatar" })).toHaveAttribute(
    "data-avatar",
    /^w1\.classic\.1\..*\.1\.front\.happy\./,
  );
  await page.getByRole("button", { name: "Save my Whizard" }).click();
}

test("a guest's own avatar goes into the room, and friends see it", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create", exact: true }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const roomUrl = host.url();

  // Players aren't offered the creator until more of the art is in, but the page works.
  await expect(host.getByLabel("Choose a nickname")).toBeVisible();
  await expect(host.getByRole("button", { name: "Make your own avatar" })).toBeHidden();
  await host.goto(`/avatar?back=${encodeURIComponent(new URL(roomUrl).pathname)}`);
  await makeAvatar(host);

  // Back on the join screen, with the new avatar picked.
  await expect(host).toHaveURL(roomUrl);
  await host.getByLabel("Choose a nickname").fill("Ada");
  await expect(host.getByRole("radio", { name: "Your avatar" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await host.getByRole("button", { name: "Join", exact: true }).click();
  await expect(playerRow(host, "Ada").locator("img.avatar")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );

  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await guest.getByLabel("Choose a nickname").fill("Tolu");
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(playerRow(guest, "Ada").locator("img.avatar")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  // Tolu kept a built-in avatar.
  await expect(playerRow(guest, "Tolu").locator("img.avatar")).toHaveAttribute(
    "src",
    /\/art\/avatars\/a\d\d\.webp$/,
  );
});

test("an account keeps its avatar", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  await page.goto("/avatar?back=/account/settings");
  await makeAvatar(page);
  await expect(page).toHaveURL(/\/account\/settings$/);
  const change = page.getByRole("button", { name: "Change avatar" });
  await change.click();
  const mine = page.getByRole("radio", { name: "Your avatar" });
  await expect(mine).toHaveAttribute("aria-checked", "true");

  // It's saved on the account, not just in this browser.
  await page.evaluate(() => localStorage.removeItem("whizard:my-avatar"));
  await page.reload();
  await change.click();
  await expect(mine).toHaveAttribute("aria-checked", "true");

  // Picking a built-in avatar keeps the made-up one to go back to.
  await page.getByRole("radio", { name: "Avatar 3" }).click();
  await expect(page.getByRole("radio", { name: "Avatar 3" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await mine.click();
  await expect(mine).toHaveAttribute("aria-checked", "true");
});
