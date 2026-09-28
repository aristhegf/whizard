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

/** Picks an afro and a crown in the creator, and saves. */
async function makeAvatar(page: Page) {
  await expect(page.getByRole("heading", { name: "Your avatar" })).toBeVisible();
  await page.getByRole("tab", { name: "Hair", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Style" })
    .getByRole("radio", { name: "Afro" })
    .click();
  await page.getByRole("tab", { name: "Hats", exact: true }).click();
  await page.getByRole("radio", { name: "Crown" }).click();
  await expect(page.getByRole("radio", { name: "Crown" })).toHaveAttribute("aria-checked", "true");
  // The preview draws the avatar with both.
  await expect(page.getByRole("img", { name: "Your avatar" })).toHaveAttribute(
    "data-avatar",
    /^w1\.[a-z0-9.-]*\.afro\..*\.crown\./,
  );
  await page.getByRole("button", { name: "Save avatar" }).click();
}

test("a guest makes an avatar on the way into a room, and friends see it", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create a Room" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const roomUrl = host.url();

  await host.getByLabel("Choose a nickname").fill("Ada");
  await host.getByRole("button", { name: "Make your own avatar" }).click();
  await expect(host).toHaveURL(/\/avatar\?back=/);
  await makeAvatar(host);

  // Back on the join screen, with the nickname kept and the new avatar picked.
  await expect(host).toHaveURL(roomUrl);
  await expect(host.getByLabel("Choose a nickname")).toHaveValue("Ada");
  await expect(host.getByRole("radio", { name: "Your avatar" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(host.getByRole("button", { name: "Edit your avatar" })).toBeVisible();
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

  await page.getByRole("button", { name: "Make your own avatar" }).click();
  await makeAvatar(page);
  await expect(page).toHaveURL(/\/account$/);
  const mine = page.getByRole("radio", { name: "Your avatar" });
  await expect(mine).toHaveAttribute("aria-checked", "true");

  // It's saved on the account, not just in this browser.
  await page.evaluate(() => localStorage.removeItem("whizard:my-avatar"));
  await page.reload();
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
