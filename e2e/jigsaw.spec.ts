import { expect, test, type Browser, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("list", { name: "Players" })).toBeVisible();
}

/** Puts every piece in its place: tap the piece that belongs in the first wrong spot, then the spot. */
async function solve(page: Page) {
  const pieces = page.locator(".jigsaw-piece");
  // Pieces can move once the countdown ends.
  await expect(page.locator(".jigsaw-piece:enabled").first()).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 60; i++) {
    const board = await pieces.evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).dataset.piece)),
    );
    const spot = board.findIndex((piece, at) => piece !== at);
    if (spot === -1) return;
    await pieces.nth(board.indexOf(spot)).click();
    await pieces.nth(spot).click();
    // The last swap can end the game and take the board with it, so both are checked in one
    // read of the page: checking one then the other can wait forever on a board that's gone.
    await expect
      .poll(() =>
        pieces.evaluateAll(
          (els, at) =>
            els.length === 0 || (els[at] as HTMLElement | undefined)?.dataset.piece === String(at),
          spot,
        ),
      )
      .toBe(true);
    if ((await pieces.count()) === 0) return;
  }
  throw new Error("The puzzle didn't come together.");
}

test("plays a solo jigsaw from the picture page", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/games");
  await page.getByRole("link", { name: /Jigsaw/ }).click();
  await expect(page).toHaveURL(/\/games\/jigsaw$/);

  await page.getByRole("button", { name: /Easy · 9 pieces/ }).click();
  await page.getByRole("button", { name: "The crew" }).click();
  await joinAs(page, "Ada");
  await expect(page.getByLabel("Picture", { exact: true })).toHaveValue("crew");
  await expect(page.getByLabel("Pieces", { exact: true })).toHaveValue("3");

  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText(/Get ready/)).toBeVisible();
  await expect(page.locator(".jigsaw-piece")).toHaveCount(9);

  // A piece in its place locks.
  const pieces = page.locator(".jigsaw-piece");
  const board = await pieces.evaluateAll((els) =>
    els.map((el) => Number((el as HTMLElement).dataset.piece)),
  );
  await expect(pieces.first()).toBeEnabled({ timeout: 10_000 });
  await pieces.nth(board.indexOf(0)).click();
  await pieces.nth(0).click();
  await expect(pieces.nth(0)).toBeDisabled();

  await solve(page);
  await expect(page.getByRole("heading", { name: /Jigsaw\s+Results/ })).toBeVisible();
  await expect(page.getByText("Solved in")).toBeVisible();
  await expect(page.getByText(/^\d+ moves?$/)).toBeVisible();

  // Change Picture goes back to the lobby with the same settings.
  await page.getByRole("button", { name: "Change Picture" }).click();
  await expect(page.getByLabel("Picture", { exact: true })).toHaveValue("crew");
});

test("two players race the same puzzle, and the faster one wins", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 9 pieces/ }).click();
  await host.getByRole("button", { name: "Game night" }).click();
  await joinAs(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.locator(".game-summary")).toContainText("Game night");

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) await expect(page.locator(".jigsaw-piece")).toHaveCount(9);

  // Both start from the same shuffle.
  const boardOf = (page: Page) =>
    page
      .locator(".jigsaw-piece")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.piece));
  expect(await boardOf(host)).toEqual(await boardOf(guest));

  await solve(guest);
  await expect(guest.getByText(/Waiting for everyone to finish/)).toBeVisible();
  await solve(host);

  for (const page of [host, guest]) {
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem").first()).toContainText("Tolu");
    await expect(rankings.getByRole("listitem").nth(1)).toContainText("Ada");
  }
});

test("the host frames their own photo, and everyone plays it", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 9 pieces/ }).click();
  // Choosing the photo on the picture page opens a room, then the framing step.
  await host
    .getByLabel("Choose your photo")
    .setInputFiles(new URL("./fixtures/photo.jpg", import.meta.url).pathname);
  await joinAs(host, "Ada");

  const cropper = host.getByRole("dialog", { name: "Frame your jigsaw" });
  await expect(cropper).toBeVisible();
  const frame = cropper.getByRole("slider", { name: /The square to use/ });
  await expect(frame).toBeVisible();
  // The photo is wider than tall, so the frame starts in the middle and can move sideways.
  const before = await frame.boundingBox();
  await frame.hover();
  await host.mouse.down();
  await host.mouse.move(before!.x + before!.width / 2 - 60, before!.y + before!.height / 2);
  await host.mouse.up();
  await expect.poll(async () => (await frame.boundingBox())!.x).toBeLessThan(before!.x - 20);
  await cropper.getByLabel("Size").fill("0.6");
  await cropper.getByRole("button", { name: "Use this photo" }).click();
  await expect(cropper).toBeHidden();

  await expect(host.getByLabel("Picture", { exact: true })).toHaveValue("photo");
  const art = host.locator(".game-summary img");
  await expect(art).toHaveAttribute("src", /\/api\/rooms\/[A-Z0-9]+\/photo\/[a-z0-9]+$/);
  const src = (await art.getAttribute("src"))!;
  const photo = await host.request.get(src);
  expect(photo.status()).toBe(200);
  expect(photo.headers()["content-type"]).toBe("image/jpeg");

  // Only the host can change it.
  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  const refused = await guest.evaluate(async (url) => {
    const code = /\/r\/([^/]+)/.exec(url)![1]!;
    const sessions = JSON.parse(localStorage.getItem("whizard:sessions") ?? "{}") as Record<
      string,
      { sessionToken: string }
    >;
    const token = sessions[code]?.sessionToken ?? "missing-token";
    const response = await fetch(`/api/rooms/${code}/photo`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}` },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    return response.status;
  }, host.url());
  expect(refused).toBe(403);

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) {
    await expect(page.locator(".jigsaw-piece")).toHaveCount(9);
    await expect(page.locator(".jigsaw-piece").first()).toHaveAttribute(
      "style",
      new RegExp(src.replace(/[/]/g, "\\/")),
    );
  }
  await solve(host);
  await expect(host.getByText("Solved in")).toBeVisible({ timeout: 10_000 });
});
