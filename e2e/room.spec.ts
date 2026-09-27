import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function createRoom(page: Page, nickname: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a room" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await joinAs(page, nickname);
  return page.url();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

function playerRow(page: Page, nickname: string) {
  return page.getByRole("listitem").filter({ hasText: nickname });
}

test("two players meet in the lobby", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  await expect(playerRow(host, "Ada")).toContainText("Host");
  await expect(playerRow(host, "Ada")).toContainText("You");
  await expect(host.getByText("You're the host.")).toBeVisible();

  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");

  for (const page of [host, guest]) {
    await expect(page.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByText(/Connected · \d+ ms/)).toBeVisible();
  }
  await expect(playerRow(guest, "Tolu")).toContainText("You");
  await expect(playerRow(guest, "Tolu")).not.toContainText("Host");
  await expect(guest.getByText("Waiting for the host")).toBeVisible();
});

test("joins by typing the room code", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = (await createRoom(host, "Ada")).split("/").pop()!;

  const guest = await newPlayer(browser);
  await guest.goto("/");
  await guest.getByLabel("Room code").fill(` ${code.toLowerCase()} `);
  await guest.getByRole("button", { name: "Join" }).click();
  await joinAs(guest, "Tolu");
  await expect(guest.getByRole("listitem")).toHaveCount(2);
});

test("rejects a nickname that's already taken", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "ADA");
  await expect(guest.getByRole("alert")).toHaveText(/already has that nickname/);

  await joinAs(guest, "Ada 2");
  await expect(guest.getByRole("listitem")).toHaveCount(2);
});

test("reloading keeps your place in the room", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(host.getByRole("listitem")).toHaveCount(2);

  await guest.reload();
  await expect(playerRow(guest, "Tolu")).toContainText("You");
  await expect(guest.getByLabel("Choose a nickname")).toHaveCount(0);
  await expect(host.getByRole("listitem")).toHaveCount(2);
  await expect(playerRow(host, "Tolu")).not.toContainText("Offline");
});

test("shows players who lose connection as offline", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(host.getByRole("listitem")).toHaveCount(2);

  await guest.close();
  await expect(playerRow(host, "Tolu")).toContainText("Offline");
});

test("the host role passes on when the host leaves", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(guest.getByRole("listitem")).toHaveCount(2);

  await host.getByRole("button", { name: "Leave room" }).click();
  await expect(host).toHaveURL(/\/$/);

  await expect(guest.getByRole("listitem")).toHaveCount(1);
  await expect(playerRow(guest, "Tolu")).toContainText("Host");
  await expect(guest.getByText("You're the host.")).toBeVisible();
});

test("explains when a room doesn't exist", async ({ page }) => {
  await page.goto("/r/ZZZZZZ");
  await expect(page.getByRole("alert")).toHaveText(/doesn't exist or has expired/);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByRole("button", { name: "Create a room" })).toBeVisible();
});

test("explains when a room link is malformed", async ({ page }) => {
  await page.goto("/r/abc");
  await expect(page.getByRole("alert")).toHaveText("That isn't a valid room link.");
});
