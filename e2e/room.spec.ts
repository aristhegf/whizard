import { expect, test, type Browser, type Page } from "@playwright/test";

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function createRoom(page: Page, nickname: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: "Create", exact: true }).click();
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

/** Says yes to "Are you sure?", which Quit and Leave ask when there's something to lose. */
async function agree(page: Page, yes: string) {
  await page.getByRole("alertdialog").getByRole("button", { name: yes }).click();
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
  await expect(visitor.getByRole("alert")).toHaveText("Codes are 6 letters and numbers");
  await expect(box).toHaveAttribute("aria-invalid", "true");
  await expect(visitor.locator(".join-room-form")).toHaveClass(/is-error/);

  // A code in the right shape that no room has.
  await box.fill("QQQQQQ");
  await expect(box).toHaveAttribute("aria-invalid", "false");
  await join.click();
  await expect(visitor.getByRole("alert")).toHaveText("No room with that code");
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
  await agree(host, "Leave");
  await expect(host).toHaveURL(/\/$/);

  await expect(players(guest)).toHaveCount(1);
  await expect(playerRow(guest, "Tolu")).toContainText("Host");
  await expect(guest.getByRole("button", { name: /play solo/i })).toBeVisible();
});

test("the host ends the game and everyone comes back to the room", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(guest)).toHaveCount(2);

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  await expect(host.getByText("Get ready")).toBeVisible();
  await expect(guest.getByText("Get ready")).toBeVisible();
  // Only the host is offered it.
  await expect(guest.getByRole("button", { name: "End Game" })).toHaveCount(0);

  await host.getByRole("button", { name: "End Game" }).click();
  await agree(host, "End Game");

  // Both are back in the room, the game is gone, and the host can set it up again.
  for (const page of [host, guest]) {
    await expect(players(page)).toHaveCount(2);
    await expect(page.getByText("Get ready")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "End Game" })).toHaveCount(0);
  }
});

test("the host ends the room for everybody in one go", async ({ browser }) => {
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(guest)).toHaveCount(2);
  // Only the host is offered it.
  await expect(guest.getByRole("button", { name: "End Room" })).toHaveCount(0);

  await host.getByRole("button", { name: "End Room" }).click();
  await agree(host, "End Room");

  await expect(host.getByText("You ended this room for everyone.")).toBeVisible();
  await expect(guest.getByText("This room was ended by its host.")).toBeVisible();
  // The room is gone for good: opening it again says so.
  await guest.goto(roomUrl);
  await expect(guest.getByRole("alert")).toHaveText(/doesn’t exist or has expired/);
});

test("explains when a room doesn’t exist", async ({ page }) => {
  await page.goto("/r/ZZZZZZ");
  await expect(page.getByRole("alert")).toHaveText(/doesn’t exist or has expired/);
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Games\s*Are Better\s*Together/);
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
  // Sound is in Settings, which the room's bar opens.
  const settings = host.getByRole("dialog", { name: "Settings", exact: true });
  const sound = settings.getByRole("switch", { name: "Sound" });
  await host.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-checked", "false");
  await host.reload();
  await host.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(sound).toHaveAttribute("aria-checked", "false");
});

test("the host slides to play, alone or with friends, and a tap doesn't start it", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const bar = host.locator(".slide-play");
  const progress = host.locator(".progress");

  /** Presses on the handle and drags it this far along the bar, from 0 to 1. */
  const slide = async (along: number) => {
    const handle = (await bar.getByRole("button").boundingBox())!;
    const track = (await bar.boundingBox())!;
    const y = handle.y + handle.height / 2;
    const from = handle.x + handle.width / 2;
    await host.mouse.move(from, y);
    await host.mouse.down();
    await host.mouse.move(from + (track.width - handle.width) * along, y, { steps: 10 });
    await host.mouse.up();
  };

  // Alone, it's still a slide: a tap does nothing, and nor does letting go early.
  await expect(bar).toContainText("Slide to Play");
  await host.getByRole("button", { name: "Slide to play solo" }).click();
  await slide(0.2);
  await expect(bar).not.toHaveClass(/done/);
  await expect(progress).toHaveCount(0);

  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  // With friends it says the same, and tells a screen reader it starts the game for everyone.
  await expect(host.getByRole("button", { name: /^Slide to Play: start game/ })).toBeVisible();
  await expect(bar).toContainText("Slide to Play");

  // Sliding it all the way starts the game.
  await slide(1);
  await expect(progress).toBeVisible();
});

test("quitting a solo game goes back to the room, and leaving closes it", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await newPlayer(browser);
  const roomUrl = await createRoom(page, "Ada");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.locator(".progress")).toContainText("1 of 10", { timeout: 10_000 });

  await page.getByRole("button", { name: "Quit" }).click();
  await agree(page, "Quit");
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
    await expect(page.locator(".progress")).toContainText("1 of 10", { timeout: 10_000 });
  }

  // Tolu quits: back to the room, while Ada plays on.
  await guest.getByRole("button", { name: "Quit" }).click();
  await agree(guest, "Quit");
  await expect(guest.getByText(/You left this game/)).toBeVisible();
  await expect(host.getByText("Tolu left the game")).toBeVisible();
  await expect(host.locator(".progress")).toContainText("1 of 10");

  // Then leaves the room, and comes back: straight back into the game they were in.
  await guest.getByRole("button", { name: "Leave" }).click();
  await agree(guest, "Leave");
  await expect(guest).toHaveURL(/\/$/);
  await expect(host.getByText("Tolu left the room")).toBeVisible();
  await guest.goto(roomUrl);
  await expect(guest.locator(".progress")).toContainText("of 10", { timeout: 10_000 });

  // Ada quits too and leaves: Tolu is the host now.
  await host.getByRole("button", { name: "Quit" }).click();
  await agree(host, "Quit");
  await expect(host.locator(".room-code")).toBeVisible();
  await host.getByRole("button", { name: "Leave" }).click();
  await agree(host, "Leave");
  await expect(guest.getByText("You’re the host now")).toBeVisible();
});

test("someone who quits a game can go back into it, with their score", async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser);
  const roomUrl = await createRoom(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(players(host)).toHaveCount(2);
  await host.getByRole("button", { name: /start game/i }).press("Enter");
  await expect(guest.locator(".progress")).toContainText("1 of 10", { timeout: 10_000 });

  // Tolu answers, quits, and goes back in: on with the game, not waiting for the next one.
  await guest.locator("button.choice").first().click();
  await expect(guest.getByRole("status")).toHaveText(/Correct|Wrong/);
  await guest.getByRole("button", { name: "Quit" }).click();
  await agree(guest, "Quit");
  await expect(guest.getByText(/You left this game/)).toBeVisible();
  await guest.getByRole("button", { name: "Rejoin the game" }).click();
  await expect(guest.locator(".progress")).toBeVisible({ timeout: 10_000 });
  await expect(guest.locator(".progress")).not.toContainText("1 of 10", { timeout: 10_000 });
});

test("a returning player goes straight into the lobby, and can change their name there", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // A first-timer sees the whole form, with Join on screen.
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create", exact: true }).click();
  await expect(host.getByLabel("Choose a nickname")).toHaveAttribute("placeholder", "e.g. Tolu");
  await expect(host.getByRole("button", { name: "Join", exact: true })).toBeInViewport();
  await joinAs(host, "Ada");
  await expect(playerRow(host, "Ada")).toContainText("You");

  // The next room skips the form.
  await host.goto("/");
  await host.getByRole("button", { name: "Create", exact: true }).click();
  await expect(playerRow(host, "Ada")).toContainText("You");
  await expect(host.getByLabel("Choose a nickname")).toHaveCount(0);
  const roomUrl = host.url();

  // Tapping your own name changes it, and the avatar.
  await host.getByRole("button", { name: "Ada: change your name or avatar" }).click();
  const dialog = host.getByRole("dialog", { name: "Your name and avatar" });
  await dialog.getByLabel("Nickname").fill("Ada L");
  await dialog.getByRole("radio", { name: "Avatar 3" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(playerRow(host, "Ada L").locator("img.avatar")).toHaveAttribute("src", /a03\.webp$/);

  // Friends see it, and it stays after a reload.
  const guest = await newPlayer(browser);
  await guest.goto(roomUrl);
  await joinAs(guest, "Tolu");
  await expect(playerRow(guest, "Ada L")).toBeVisible();
  await host.reload();
  await expect(playerRow(host, "Ada L")).toContainText("You");

  // A name someone here already has can't be taken.
  await host.getByRole("button", { name: "Ada L: change your name or avatar" }).click();
  await dialog.getByLabel("Nickname").fill("tolu");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(host.getByText("Someone in this room already has that nickname.")).toBeVisible();
  await expect(playerRow(host, "Ada L")).toContainText("You");

  // Someone whose saved name is taken here gets the form, to pick another.
  const kemi = await newPlayer(browser);
  await kemi.goto("/");
  await kemi.evaluate(() => localStorage.setItem("whizard:nickname", JSON.stringify("Tolu")));
  await kemi.goto(roomUrl);
  // Trying the saved name first can take a moment when the room is busy.
  await expect(kemi.getByRole("alert")).toContainText("already has that nickname", {
    timeout: 15_000,
  });
  await joinAs(kemi, "Kemi");
  await expect(playerRow(kemi, "Kemi")).toContainText("You");
});
