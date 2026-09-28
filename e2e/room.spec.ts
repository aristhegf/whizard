import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function createRoom(page: Page, nickname: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a Room" }).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  await joinAs(page, nickname);
  return page.url();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

/** The lobby's players (not toasts, which are list items too). */
function players(page: Page) {
  return page.getByRole("list", { name: "Players" }).getByRole("listitem");
}

function playerRow(page: Page, nickname: string) {
  return players(page).filter({ hasText: nickname });
}

test("two players meet in the lobby", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  await expect(playerRow(host, "Ada")).toContainText("Host");
  await expect(playerRow(host, "Ada")).toContainText("You");
  await expect(host.getByRole("button", { name: /play solo/i })).toBeVisible();

  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");

  for (const page of [host, guest]) {
    await expect(players(page)).toHaveCount(2);
    await expect(page.getByText(/^\d+\sms$/)).toBeVisible();
  }
  // The host is told who joined.
  await expect(host.getByText("Tolu joined")).toBeVisible();
  await expect(playerRow(guest, "Tolu")).toContainText("You");
  await expect(playerRow(guest, "Tolu")).not.toContainText("Host");
  await expect(guest.getByText("Waiting for the host")).toBeVisible();
  await expect(host.getByRole("button", { name: /start game/i })).toBeVisible();
});

test("joins by typing the room code", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = (await createRoom(host, "Ada")).split("/").pop()!;

  const guest = await newPlayer(browser);
  await guest.goto("/");
  await guest.getByLabel("Room code").fill(` ${code.toLowerCase()} `);
  await guest.getByRole("button", { name: "Join" }).click();
  await joinAs(guest, "Tolu");
  await expect(players(guest)).toHaveCount(2);
});

test("the room code box says why a code won’t work", async ({ browser }) => {
  const visitor = await newPlayer(browser);
  await visitor.goto("/");
  const box = visitor.getByLabel("Room code");
  const join = visitor.getByRole("button", { name: "Join", exact: true });

  await box.fill("AB1");
  await join.click();
  await expect(visitor.getByRole("alert")).toHaveText("Room codes are 6 letters and numbers.");
  await expect(box).toHaveAttribute("aria-invalid", "true");
  await expect(box).toHaveClass(/is-error/);

  // A code in the right shape that no room has.
  await box.fill("QQQQQQ");
  await expect(box).toHaveAttribute("aria-invalid", "false");
  await join.click();
  await expect(visitor.getByRole("alert")).toHaveText(/No room has that code/);
  await expect(visitor).toHaveURL(/\/$/);

  // A game already running without late join still lets them in, to wait for the next one.
  const host = await newPlayer(browser);
  const code = (await createRoom(host, "Ada")).split("/").pop()!;
  await host.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(host.getByText("Get ready")).toBeVisible();
  await box.fill(code);
  await join.click();
  await expect(visitor).toHaveURL(new RegExp(`/r/${code}$`));
  await joinAs(visitor, "Tolu");
  await expect(
    visitor.getByText("A game is in progress. You’ll be in the next one."),
  ).toBeVisible();
});

test("rejects a nickname that’s already taken", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "ADA");
  await expect(guest.getByRole("alert")).toHaveText(/already has that nickname/);
  await expect(guest.getByLabel("Choose a nickname")).toHaveAttribute("aria-invalid", "true");

  await joinAs(guest, "Ada 2");
  await expect(players(guest)).toHaveCount(2);
});

test("reloading keeps your place in the room", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(host)).toHaveCount(2);

  await guest.reload();
  await expect(playerRow(guest, "Tolu")).toContainText("You");
  await expect(guest.getByLabel("Choose a nickname")).toHaveCount(0);
  await expect(players(host)).toHaveCount(2);
  await expect(playerRow(host, "Tolu")).not.toContainText("Offline");
});

test("shows players who lose connection as offline", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(host)).toHaveCount(2);

  await guest.close();
  await expect(playerRow(host, "Tolu")).toContainText("Offline");
});

test("the host role passes on when the host leaves", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(guest)).toHaveCount(2);

  await host.getByRole("button", { name: "Leave" }).click();
  await expect(host).toHaveURL(/\/$/);

  await expect(players(guest)).toHaveCount(1);
  await expect(playerRow(guest, "Tolu")).toContainText("Host");
  await expect(guest.getByRole("button", { name: /play solo/i })).toBeVisible();
});

test("explains when a room doesn’t exist", async ({ page }) => {
  await page.goto("/r/ZZZZZZ");
  await expect(page.getByRole("alert")).toHaveText(/doesn’t exist or has expired/);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByRole("button", { name: "Create a Room" })).toBeVisible();
});

test("explains when a room link is malformed", async ({ page }) => {
  await page.goto("/r/abc");
  await expect(page.getByRole("alert")).toHaveText("That isn’t a valid room link.");
});

test("a host who goes back can return to the same room", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(playerRow(host, "Tolu")).toBeVisible();

  await host.goBack();
  const bar = host.getByRole("region", { name: "Your room" });
  await expect(bar).toContainText("is still open");
  await bar.getByRole("link", { name: "Return" }).click();

  await expect(host).toHaveURL(roomUrl);
  await expect(playerRow(host, "Ada")).toContainText("Host");
  await expect(playerRow(host, "Tolu")).toBeVisible();
  await expect(playerRow(guest, "Ada")).not.toContainText("Offline");
  await expect(host.getByRole("button", { name: /start game/i })).toBeVisible();
});

test("the sound setting is remembered", async ({ browser }) => {
  const host = await newPlayer(browser);
  await createRoom(host, "Ada");
  const sound = host.getByRole("button", { name: "Sound" });
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await host.reload();
  await expect(host.getByRole("button", { name: "Sound" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("on a phone the host slides to start, and a tap alone doesn't start the game", async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  await createRoom(host, "Ada");
  const thumb = host.getByRole("button", { name: "Slide to play solo" });
  await expect(thumb).toBeVisible();

  // A tap on the handle does nothing.
  await thumb.click();
  await expect(host.locator(".progress")).toHaveCount(0);

  // Dragging it to the end starts the game.
  const track = host.locator(".slide-start");
  const handle = (await thumb.boundingBox())!;
  const end = (await track.boundingBox())!;
  await host.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await host.mouse.down();
  await host.mouse.move(end.x + end.width - 10, handle.y + handle.height / 2, { steps: 12 });
  await host.mouse.up();
  await expect(host.locator(".progress")).toBeVisible();
});

test("quitting a solo game goes back to the room, and leaving closes it", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await newPlayer(browser);
  const roomUrl = await createRoom(page, "Ada");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.locator(".progress")).toContainText("1 / 10", { timeout: 10_000 });

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Quit" }).click();
  // Back in the room, not on the home page, ready for another game.
  await expect(page).toHaveURL(roomUrl);
  await expect(page.locator(".room-code")).toBeVisible();
  await expect(page.getByRole("button", { name: /play solo/i })).toBeVisible();

  // The last one out closes the room.
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(roomUrl);
  await expect(page.getByRole("alert")).toHaveText(/doesn’t exist or has expired/);
});

test("friends hear who quits, leaves and comes back, and who the host is", async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(host)).toHaveCount(2);

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) {
    await expect(page.locator(".progress")).toContainText("1 / 10", { timeout: 10_000 });
  }

  // Tolu quits: back to the room, while Ada plays on.
  guest.once("dialog", (dialog) => void dialog.accept());
  await guest.getByRole("button", { name: "Quit" }).click();
  await expect(guest.getByText(/You quit this game/)).toBeVisible();
  await expect(host.getByText("Tolu left the game")).toBeVisible();
  await expect(host.locator(".progress")).toContainText("1 / 10");

  // Then leaves the room, and comes back.
  await guest.getByRole("button", { name: "Leave" }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(host.getByText("Tolu left the room")).toBeVisible();
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(host.getByText("Tolu joined")).toBeVisible();

  // Ada quits too and leaves: Tolu is the host now.
  host.once("dialog", (dialog) => void dialog.accept());
  await host.getByRole("button", { name: "Quit" }).click();
  await expect(host.locator(".room-code")).toBeVisible();
  await host.getByRole("button", { name: "Leave" }).click();
  await expect(guest.getByText("You’re the host now")).toBeVisible();
});
