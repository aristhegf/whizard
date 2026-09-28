import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

async function openRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a Room" }).click();
  // The home page has a Join button too (for codes), so wait until the room is open.
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.getByLabel("Questions").selectOption("5");
}

async function playSoloGame(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a Room" }).click();
  const nickname = page.getByLabel("Choose a nickname");
  const questions = page.getByLabel("Questions");
  await expect(nickname.or(questions)).toBeVisible();
  if (await nickname.isVisible()) {
    await nickname.fill("Ada");
    await page.getByRole("button", { name: "Join", exact: true }).click();
  }
  await questions.selectOption("5");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  for (let i = 1; i <= 5; i++) {
    await expect(page.locator(".progress")).toContainText(`${i} / 5`, { timeout: 10_000 });
    await page.locator("button.choice").first().click();
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await expect(page.getByText("Your score")).toBeVisible();
}

test("signs up, signs out and signs back in with a passkey", async ({ page }) => {
  await withPasskeys(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();

  const username = uniqueUsername();
  await signUp(page, username);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByText(`@${username}`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`@${username}`)).toBeVisible();
});

test("rejects a username that's already taken", async ({ browser }) => {
  const username = uniqueUsername();
  const first = await browser.newPage();
  await withPasskeys(first);
  await signUp(first, username);

  const second = await browser.newPage();
  await withPasskeys(second);
  await second.goto("/account");
  await second.getByLabel("Username").fill(username);
  await second.getByLabel("Name", { exact: true }).fill("Tolu");
  await second.getByLabel(/13 or older/).check();
  await second.getByRole("button", { name: "Create account" }).click();
  await expect(second.getByRole("alert")).toHaveText("That username is taken.");
});

test("keeps a guest's game when they sign up, and records new ones", async ({ page }) => {
  await withPasskeys(page);
  await playSoloGame(page);

  await signUp(page, uniqueUsername());
  const games = page.locator(".matches li");
  await expect(games).toHaveCount(1);
  await expect(games.first()).toContainText("Bible · Easy");
  await expect(games.first()).toContainText("Solo");
  await expect(page.locator(".tiles")).toContainText("Games1");

  await playSoloGame(page);
  await page.goto("/account");
  await expect(games).toHaveCount(2);
});

test("saves settings and uses the account name in rooms", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  await page.getByLabel("Name", { exact: true }).fill("Ada L");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Ada L", level: 1 })).toBeVisible();

  const explanations = page.getByRole("group", { name: "Explanations" });
  await explanations.getByRole("button", { name: "Each answer" }).click();
  await expect(explanations.getByRole("button", { name: "Each answer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(explanations.getByRole("button", { name: "Each answer" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("deletes the account", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
});

test("shows the privacy policy", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
});

test("friends add each other, play together and see their record", async ({ browser }) => {
  const ada = await browser.newPage();
  await withPasskeys(ada);
  const adaName = uniqueUsername();
  await signUp(ada, adaName, "Ada");

  const tolu = await browser.newPage();
  await withPasskeys(tolu);
  const toluName = uniqueUsername();
  await signUp(tolu, toluName, "Tolu");

  // Ada sends a request by username; Tolu accepts it from the invite link.
  await ada.goto("/friends");
  await ada.getByLabel("Friend’s username").fill(toluName);
  await ada.getByRole("button", { name: "Add", exact: true }).click();
  await expect(ada.getByText("Request sent", { exact: true })).toBeVisible();

  await tolu.goto(`/add/${adaName}`);
  await tolu.getByRole("button", { name: "Accept friend request" }).click();
  await expect(tolu.getByText("You’re friends.")).toBeVisible();

  await ada.reload();
  const friendRow = ada.locator(".people li").filter({ hasText: `@${toluName}` });
  await expect(friendRow).toContainText("No games together yet");

  // One game together.
  await openRoom(ada);
  await tolu.goto(ada.url());
  await tolu.getByRole("button", { name: "Join", exact: true }).click();
  await expect(
    ada.getByRole("list", { name: "Players" }).getByRole("listitem").filter({ hasText: "Tolu" }),
  ).toBeVisible();
  await ada.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [ada, tolu]) {
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(".progress")).toContainText(`${i} / 5`, { timeout: 10_000 });
      await page.locator("button.choice").first().click();
    }
  }
  await expect(ada.getByRole("heading", { name: "Final Rankings" })).toBeVisible();

  await ada.goto("/friends");
  await expect(friendRow).toContainText("1 game");

  // A group shows who tops it.
  await ada.getByRole("button", { name: "New group" }).click();
  await ada.getByLabel("Group name").fill("Game night");
  await ada.getByRole("checkbox", { name: /Tolu/ }).check();
  await ada.getByRole("button", { name: "Create group" }).click();
  await expect(ada.getByRole("heading", { name: "Game night", level: 1 })).toBeVisible();
  const board = ada.getByRole("list", { name: "Leaderboard" }).locator("li");
  await expect(board).toHaveCount(2);
  await expect(board.first()).toContainText("1 / 1");

  await tolu.goto("/friends");
  await expect(tolu.getByRole("link", { name: /Game night/ })).toBeVisible();
});

test("offers to add signed-in players after a game", async ({ browser }) => {
  const ada = await browser.newPage();
  await withPasskeys(ada);
  await signUp(ada, uniqueUsername(), "Ada");
  const tolu = await browser.newPage();
  await withPasskeys(tolu);
  const toluName = uniqueUsername();
  await signUp(tolu, toluName, "Tolu");

  await openRoom(ada);
  await tolu.goto(ada.url());
  await tolu.getByRole("button", { name: "Join", exact: true }).click();
  await ada.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [ada, tolu]) {
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(".progress")).toContainText(`${i} / 5`, { timeout: 10_000 });
      await page.locator("button.choice").first().click();
    }
  }
  const offer = ada.getByRole("region", { name: "Add as a friend" });
  await expect(offer).toContainText(`@${toluName}`);
  await offer.getByRole("button", { name: "Add" }).click();
  await expect(offer).toContainText("Request sent");
});

test("pings a friend from the friends page and the lobby", async ({ browser }) => {
  const ada = await browser.newPage();
  await withPasskeys(ada);
  const adaName = uniqueUsername();
  await signUp(ada, adaName, "Ada");
  const tolu = await browser.newPage();
  await withPasskeys(tolu);
  const toluName = uniqueUsername();
  await signUp(tolu, toluName, "Tolu");
  await tolu.goto(`/add/${adaName}`);
  await tolu.getByRole("button", { name: "Add friend" }).click();
  await ada.goto(`/add/${toluName}`);
  await ada.getByRole("button", { name: "Accept friend request" }).click();

  // Tolu has no device with pings turned on, so the ping is held back.
  await ada.goto("/friends");
  await ada.getByRole("button", { name: "Ping", exact: true }).click();
  await expect(ada).toHaveURL(/\/r\/[A-Z0-9]{6}/);
  await ada.getByRole("button", { name: "Join", exact: true }).click();
  const pings = ada.getByRole("region", { name: "Ping a friend" });
  await expect(pings.getByRole("status")).toHaveText("Can’t get pings now");

  // Tolu can mute Ada, and turn on quiet hours.
  await tolu.goto("/friends");
  await tolu.getByLabel("More for Ada").click();
  await tolu.getByRole("button", { name: "Mute pings" }).click();
  await expect(tolu.locator(".people li").filter({ hasText: `@${adaName}` })).toContainText(
    "Muted",
  );
  await tolu.goto("/account");
  const quiet = tolu.getByRole("group", { name: "Quiet hours" });
  await quiet.getByRole("button", { name: "On" }).click();
  await expect(tolu.getByLabel("Quiet from")).toBeVisible();
  await tolu.reload();
  await expect(quiet.getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
});

test("players choose whether they appear on the public leaderboard", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());

  const setting = page.getByRole("group", { name: "Public leaderboard" });
  await expect(setting.getByRole("button", { name: "Hide me" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await setting.getByRole("button", { name: "Show me" }).click();
  await expect(setting.getByRole("button", { name: "Show me" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Public leaderboard" })
      .getByRole("button", { name: "Show me" }),
  ).toHaveAttribute("aria-pressed", "true");
});
