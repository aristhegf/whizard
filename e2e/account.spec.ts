import { expect, test, type Page } from "@playwright/test";
import {
  closeSheet,
  openSettings as openRoomSettings,
  chooseSetting,
  expectSetting,
} from "./lobby";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

async function openRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  // The home page has a Join button too (for codes), so wait until the room is open.
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  // Signed in, they go straight in under their account name.
  await openRoomSettings(page);
  await chooseSetting(page, "Questions", "5");
  await expectSetting(page, "Questions", "5");
  await closeSheet(page);
}

async function playSoloGame(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const nickname = page.getByLabel("Choose a nickname");
  const lobby = page.locator(".lobby");
  await expect(nickname.or(lobby)).toBeVisible();
  if (await nickname.isVisible()) {
    await nickname.fill("Ada");
    await page.getByRole("button", { name: "Join", exact: true }).click();
  }
  await openRoomSettings(page);
  await chooseSetting(page, "Questions", "5");
  await expectSetting(page, "Questions", "5");
  await closeSheet(page);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  for (let i = 1; i <= 5; i++) {
    await expect(page.locator(".progress")).toContainText(`${i} of 5`, { timeout: 10_000 });
    await page.locator("button.choice").first().click();
    // The pause offers Skip; "Go straight on" has already asked for the next question.
    await page
      .getByRole("button", { name: "Skip" })
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
  await expect(page.getByText("Your score")).toBeVisible();
}

test("signs up, signs out and signs back in with a passkey", async ({ page }) => {
  await withPasskeys(page);
  await page.goto("/");
  // Guests find Sign in in the menu under "Me".
  const signIn = async () => {
    await page.getByRole("button", { name: "Me", exact: true }).click();
    await page.getByRole("group", { name: "Menu" }).getByRole("link", { name: "Sign in" }).click();
  };
  await signIn();

  const username = uniqueUsername();
  await signUp(page, username);

  await page.getByRole("button", { name: "Sign out" }).click();
  // Signing out goes back home, which for a guest is the welcome page.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Games\s*Are Better\s*Together/);
  await signIn();
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
  await second.getByLabel("Display name").fill("Tolu");
  await second.getByLabel(/13 or older/).check();
  // Checked while typing, so there's no passkey prompt for a name that can't be had.
  await expect(second.getByText("That username is taken.")).toBeVisible();
  await expect(second.getByRole("button", { name: "Create account" })).toBeDisabled();
});

test("changes the username, then not again for a week", async ({ browser }) => {
  const taken = uniqueUsername();
  const other = await browser.newPage();
  await withPasskeys(other);
  await signUp(other, taken);

  const page = await browser.newPage();
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada 🧙‍♀️");

  await page.goto("/account/settings");
  const field = page.getByLabel("Username");
  const change = page.getByRole("button", { name: "Change", exact: true });
  await field.fill(taken);
  await expect(page.getByText("That username is taken.")).toBeVisible();
  await expect(change).toBeDisabled();

  const fresh = uniqueUsername();
  await field.fill(`@${fresh.toUpperCase()}`);
  await expect(page.getByText(`@${fresh} is available.`)).toBeVisible();
  await change.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Change" }).click();
  await expect(page.getByText(`Friends can find you as @${fresh} now.`)).toBeVisible();

  // Locked for 7 days, and it sticks after a reload.
  await page.reload();
  await expect(field).toBeDisabled();
  await expect(page.getByText(/You can change it again on/)).toBeVisible();

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.locator(".profile-handle")).toContainText(`@${fresh}`);
  await expect(page.getByRole("heading", { name: "Ada 🧙‍♀️", level: 1 })).toBeVisible();

  // Friends find the account by its new name.
  await other.goto("/friends");
  await other.getByLabel("Friend’s username").fill(fresh);
  await other.getByRole("button", { name: "Add", exact: true }).click();
  await expect(other.getByText("Request sent", { exact: true })).toBeVisible();
});

test("keeps a guest's game when they sign up, and records new ones", async ({ page }) => {
  await withPasskeys(page);
  await playSoloGame(page);

  await signUp(page, uniqueUsername());
  const games = page.locator(".matches li");
  await expect(games).toHaveCount(1);
  await expect(games.first()).toContainText("Bible Quiz · Easy");
  await expect(games.first()).toContainText("Solo · Today");
  await expect(page.locator(".stat-tiles")).toContainText("Games1");
  await expect(page.locator(".game-stats li")).toContainText("Quiz1 game · 0 wins");

  await playSoloGame(page);
  await page.goto("/account");
  await expect(games).toHaveCount(2);
});

test("saves settings and uses the account name in rooms", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  await page.goto("/account/settings");
  await page.getByLabel("Display name").fill("Ada L");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Ada L", level: 1 })).toBeVisible();

  // Quiz settings live in the Settings dialog, saved to the account.
  const openSettings = async () => {
    await page.getByRole("button", { name: "Me", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    return page.getByRole("dialog", { name: "Settings", exact: true });
  };
  let settings = await openSettings();
  const explanations = settings.getByRole("group", { name: "Explanations" });
  const pause = settings.getByRole("group", { name: "After you answer" });
  const pressed = (group: typeof pause, name: string) =>
    expect(group.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  await pressed(explanations, "After each question");
  await pressed(pause, "Go straight on");
  await explanations.getByRole("button", { name: "At the end" }).click();
  await pressed(explanations, "At the end");
  await pause.getByRole("button", { name: "Pause 3 seconds" }).click();
  await pressed(pause, "Pause 3 seconds");

  await page.reload();
  settings = await openSettings();
  await pressed(explanations, "At the end");
  await pressed(pause, "Pause 3 seconds");
  await settings.getByRole("button", { name: "Done" }).click();

  // Solo now pauses after each answer, and keeps the explanations for the end.
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const nickname = page.getByLabel("Choose a nickname");
  const lobby = page.locator(".lobby");
  await expect(nickname.or(lobby)).toBeVisible();
  if (await nickname.isVisible())
    await page.getByRole("button", { name: "Join", exact: true }).click();
  await openRoomSettings(page);
  await chooseSetting(page, "Questions", "5");
  await expectSetting(page, "Questions", "5");
  await closeSheet(page);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.locator(".progress")).toContainText("1 of 5", { timeout: 10_000 });
  await page.locator("button.choice").first().click();
  await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  await expect(page.locator(".explanation")).toHaveCount(0);
});

test("deletes the account", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());
  await page.goto("/account/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Me", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Menu" }).getByRole("link", { name: "Sign in" }),
  ).toBeVisible();
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
  await expect(
    ada.getByRole("list", { name: "Players" }).getByRole("listitem").filter({ hasText: "Tolu" }),
  ).toBeVisible();
  await ada.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [ada, tolu]) {
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(".progress")).toContainText(`${i} of 5`, { timeout: 10_000 });
      await page.locator("button.choice").first().click();
    }
  }
  await expect(ada.getByRole("heading", { name: "Final Rankings" })).toBeVisible();

  await ada.goto("/friends");
  await expect(friendRow).toContainText("1 game");

  // Tapping Tolu opens his profile: the record between them, and the game they played.
  await friendRow.getByRole("link", { name: /Tolu/ }).click();
  await expect(ada).toHaveURL(new RegExp(`/u/${toluName}$`));
  await expect(ada.getByRole("heading", { name: "Tolu", level: 1 })).toBeVisible();
  await expect(ada.getByText(/Friends since/)).toBeVisible();
  await expect(ada.getByRole("region", { name: "You and Tolu" })).toContainText("1 game together");
  await expect(ada.getByRole("button", { name: "Ping to play" })).toBeVisible();
  const together = ada.getByRole("region", { name: "Played together" });
  await expect(together.getByRole("listitem")).toHaveCount(1);
  await expect(together).toContainText("Bible Quiz");
  await ada.goto("/friends");

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
  await ada.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [ada, tolu]) {
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(".progress")).toContainText(`${i} of 5`, { timeout: 10_000 });
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

  // Ada pings Tolu from the friends page: a room opens, with her friends to ping over the invites.
  await ada.goto("/friends");
  await ada.getByRole("button", { name: "Ping", exact: true }).click();
  await expect(ada).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const pings = ada.getByRole("dialog", { name: "Ping Friend" });
  await expect(pings.getByRole("status")).toHaveText("Pinged");
  const room = new URL(ada.url()).pathname;

  // The same friends are behind Ping Friend in the lobby's invites.
  await pings.getByRole("button", { name: "Done" }).click();
  await ada.getByRole("button", { name: "Ping Friend" }).click();
  await expect(pings.getByRole("button", { name: "Ping Tolu" })).toBeVisible();

  // Tolu has no device with pings turned on, but it's there on the page he has open, and he joins.
  await tolu.goto("/friends");
  const ping = tolu.getByRole("region", { name: "Ping from a friend" });
  await expect(ping).toContainText("Ada wants to play");
  await ping.getByRole("link", { name: "Join" }).click();
  await expect(tolu).toHaveURL(new RegExp(`${room}$`));

  // Tolu can mute Ada, and turn on quiet hours.
  await tolu.goto("/friends");
  await tolu.getByLabel("More for Ada").click();
  await tolu.getByRole("button", { name: "Mute pings" }).click();
  await expect(tolu.locator(".people li").filter({ hasText: `@${adaName}` })).toContainText(
    "Muted",
  );
  await tolu.goto("/account/settings");
  const quiet = tolu.getByRole("switch", { name: "Quiet hours" });
  await quiet.click();
  await expect(tolu.getByLabel("Quiet from")).toBeVisible();
  await tolu.reload();
  await expect(quiet).toHaveAttribute("aria-checked", "true");
});

test("players choose whether they appear on the public leaderboard", async ({ page }) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername());

  await page.goto("/account/settings");
  const setting = page.getByRole("switch", { name: "Show me on the leaderboard" });
  await expect(setting).toHaveAttribute("aria-checked", "false");
  await setting.click();
  await expect(setting).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect(setting).toHaveAttribute("aria-checked", "true");
});

test("the profile signs out and opens settings from the top, and settings can't sign out", async ({
  page,
}) => {
  await withPasskeys(page);
  await signUp(page, uniqueUsername(), "Ada");

  // Sign out first, then the gear, at the top right.
  const signOut = page.getByRole("button", { name: "Sign out" });
  const gear = page.getByRole("link", { name: "Settings", exact: true });
  const [out, settings] = [await signOut.boundingBox(), await gear.boundingBox()];
  expect(out && settings && out.x < settings.x && Math.abs(out.y - settings.y) < 4).toBe(true);

  await gear.click();
  await expect(page).toHaveURL(/\/account\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Sound" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Ada");
});
