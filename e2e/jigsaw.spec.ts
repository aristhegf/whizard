import { fileURLToPath } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseSetting, closeSheet, expectSetting, openSettings } from "./lobby";

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

/** Puts every piece in its place: drags each tray piece onto its home on the canvas. */
async function solve(page: Page, pieces = 16) {
  const tray = page.getByRole("list", { name: /Pieces to place/ });
  // Pieces can move once the countdown ends.
  await expect(tray.getByRole("listitem").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".insane-view")).toBeVisible({ timeout: 10_000 });
  const canvas = page.locator(".insane-canvas");
  const cols = Math.round(Math.sqrt(pieces));
  for (let i = 0; i < pieces + 4; i++) {
    const remaining = await tray.getByRole("listitem").count();
    if (remaining === 0) return;
    const ids = await tray
      .locator("[data-piece]")
      .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.piece)));
    if (ids.length === 0) return;
    const target = ids[0]!;
    const item = tray.locator(`[data-piece="${target}"]`);
    await item.scrollIntoViewIfNeeded();
    const box = (await item.boundingBox())!;
    const c = (await canvas.boundingBox())!;
    const unit = c.width / cols;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 4 });
    await page.mouse.move(
      c.x + ((target % cols) + 0.5) * unit,
      c.y + (Math.floor(target / cols) + 0.5) * unit,
      { steps: 8 },
    );
    await page.mouse.up();
    // The last place can end the game and take the tray with it.
    await expect
      .poll(async () => tray.getByRole("listitem").count(), { timeout: 5000 })
      .toBeLessThan(remaining);
    if ((await tray.getByRole("listitem").count()) === 0) return;
  }
  throw new Error("The puzzle didn't come together.");
}

test("plays a solo jigsaw from the picture page", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await page
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await page.getByRole("link", { name: /Jigsaw/ }).click();
  await expect(page).toHaveURL(/\/games\/jigsaw$/);

  await page.getByRole("button", { name: /Easy · 16 pieces/ }).click();
  await page.getByRole("button", { name: "The crew" }).click();
  await joinAs(page, "Ada");
  await openSettings(page);
  await expectSetting(page, "Picture", "crew");
  await expectSetting(page, "Level", "easy");
  await expectSetting(page, "Game Mode", "classic");
  await closeSheet(page);

  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText(/Get ready/)).toBeVisible();
  const tray = page.getByRole("list", { name: /Pieces to place/ });
  await expect(tray.getByRole("listitem")).toHaveCount(16);

  // A piece on its spot snaps in and locks.
  await expect(page.locator(".insane-view")).toBeVisible({ timeout: 10_000 });
  const canvas = page.locator(".insane-canvas");
  const firstBox = (await tray.locator("[data-piece]").first().boundingBox())!;
  const firstPiece = await tray
    .locator("[data-piece]")
    .first()
    .evaluate((el) => Number((el as HTMLElement).dataset.piece));
  const c0 = (await canvas.boundingBox())!;
  const unit0 = c0.width / 4;
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y - 30, { steps: 4 });
  await page.mouse.move(
    c0.x + ((firstPiece % 4) + 0.5) * unit0 + 4,
    c0.y + (Math.floor(firstPiece / 4) + 0.5) * unit0 - 3,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator(`[data-placed="${firstPiece}"]`)).toHaveCount(1);

  await solve(page);
  await expect(page.getByRole("heading", { name: /Jigsaw\s+Results/ })).toBeVisible();
  await expect(page.getByText("Solved in")).toBeVisible();
  await expect(page.getByText(/^\d+ moves?$/)).toBeVisible();

  // Change Picture goes back to the lobby with the same settings.
  await page.getByRole("button", { name: "Change Picture" }).click();
  await openSettings(page);
  await expectSetting(page, "Picture", "crew");
});

test("two players race the same puzzle, and the faster one wins", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 16 pieces/ }).click();
  await host.getByRole("button", { name: "Game night" }).click();
  await joinAs(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.locator(".game-summary")).toContainText("Game night");

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) {
    await expect(
      page.getByRole("list", { name: /Pieces to place/ }).getByRole("listitem"),
    ).toHaveCount(16);
  }

  // Both start from the same shuffle.
  const trayOf = (page: Page) =>
    page
      .getByRole("list", { name: /Pieces to place/ })
      .locator("[data-piece]")
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.piece));
  expect(await trayOf(host)).toEqual(await trayOf(guest));

  await solve(guest);
  await expect(guest.getByText(/Waiting for everyone to finish/)).toBeVisible();
  await solve(host);

  for (const page of [host, guest]) {
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem").first()).toContainText("Tolu");
    await expect(rankings.getByRole("listitem").nth(1)).toContainText("Ada");
  }
});

test("who leaves and comes back shows in one line at the bottom, with faces for scores", async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 16 pieces/ }).click();
  await host.getByRole("button", { name: "Game night" }).click();
  await joinAs(host, "Ada");
  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await host.getByRole("button", { name: /start game/i }).press("Enter");
  await expect(
    host
      .getByRole("list", { name: /Pieces to place/ })
      .getByRole("listitem")
      .first(),
  ).toBeVisible({ timeout: 10_000 });

  // On a phone the scores are faces, no names.
  await expect(host.getByRole("list", { name: "Scores" }).getByRole("listitem")).toHaveCount(2);

  await guest.getByRole("button", { name: "Quit" }).click();
  await guest.getByRole("alertdialog").getByRole("button", { name: "Quit" }).click();
  await expect(host.locator(".play-toast")).toHaveText("Tolu left the game");
  await guest.getByRole("button", { name: "Rejoin the game" }).click();
  await expect(host.locator(".play-toast")).toHaveText("Tolu is back in the game");
});

test("the host frames their own photo, and everyone plays it", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 16 pieces/ }).click();
  // Choosing the photo on the picture page opens a room, then the framing step.
  await host
    .getByLabel("Choose your photo")
    .setInputFiles(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url)));
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

  await openSettings(host);
  await expectSetting(host, "Picture", "photo");
  await closeSheet(host);
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
    await expect(
      page.getByRole("list", { name: /Pieces to place/ }).getByRole("listitem"),
    ).toHaveCount(16);
    await expect(
      page
        .getByRole("list", { name: /Pieces to place/ })
        .locator("[data-piece]")
        .first()
        .locator("image"),
    ).toHaveAttribute("href", src);
  }
  await solve(host);
  await expect(host.getByText("Solved in")).toBeVisible({ timeout: 10_000 });
});

test("Insane: pieces come out of the tray, snap onto their spot, and stay where they're left", async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await page.goto("/games/jigsaw");
  await page.getByRole("button", { name: /Insane · about 100 pieces/ }).click();
  await page.getByRole("button", { name: "The crew" }).click();
  await joinAs(page, "Ada");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  const tray = page.getByRole("list", { name: /Pieces to place/ });
  await expect(tray.getByRole("listitem")).toHaveCount(100);
  // Classic has no clock: the canvas shows once the countdown is over.
  await expect(page.locator(".insane-view")).toBeVisible({ timeout: 10_000 });

  const canvas = (await page.locator(".insane-canvas").boundingBox())!;
  const unit = canvas.width / 10;
  const dragFromTray = async (piece: number, x: number, y: number) => {
    const box = (await tray.locator(`[data-piece="${piece}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 4 });
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
  };
  const [first, second] = await tray
    .locator("[data-piece]")
    .evaluateAll((els) => els.slice(0, 2).map((el) => Number((el as HTMLElement).dataset.piece)));

  // Near its spot, it snaps in.
  await dragFromTray(
    first!,
    canvas.x + ((first! % 10) + 0.5) * unit + 4,
    canvas.y + (Math.floor(first! / 10) + 0.5) * unit - 3,
  );
  await expect(page.locator(".play-count")).toHaveText("1 / 100 placed");
  await expect(page.locator(`[data-placed="${first}"]`)).toHaveCount(1);

  // Anywhere else, it stays on the canvas where it was dropped, even after a reload.
  const far = (second! + 55) % 100;
  await dragFromTray(
    second!,
    canvas.x + ((far % 10) + 0.5) * unit,
    canvas.y + (Math.floor(far / 10) + 0.5) * unit,
  );
  await expect(page.locator(`[data-loose="${second}"]`)).toHaveCount(1);
  await expect(tray.getByRole("listitem")).toHaveCount(98);
  await page.reload();
  await expect(page.locator(`[data-loose="${second}"]`)).toHaveCount(1);
  await expect(page.locator(".play-count")).toHaveText("1 / 100 placed");
});

test("Classic has no clock, and Next Jigsaw moves straight on to the next picture", async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await page.goto("/games/jigsaw");
  await page.getByRole("button", { name: /Easy · 16 pieces/ }).click();
  await page.getByRole("button", { name: "The crew" }).click();
  await joinAs(page, "Ada");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(
    page
      .getByRole("list", { name: /Pieces to place/ })
      .getByRole("listitem")
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".play-timer")).toHaveCount(0);

  await solve(page);
  await page.getByRole("button", { name: "Next Jigsaw" }).click();
  await expect(page.getByText(/Get ready/)).toBeVisible();
  await expect(page.locator(".jigsaw-preview")).toHaveAttribute("alt", "Quiz cards");
});

test("Elimination: finishers are safe, the fewest pieces go out, and the final picks the winner", async ({
  browser,
}) => {
  // Three full drag solves (two round-1, one final): needs the extra time on a loaded machine.
  test.setTimeout(240_000);
  const host = await newPlayer(browser);
  await host.goto("/games/jigsaw");
  await host.getByRole("button", { name: /Easy · 16 pieces/ }).click();
  await host.getByRole("button", { name: "Game night" }).click();
  await joinAs(host, "Ada");
  await openSettings(host);
  await chooseSetting(host, "Game Mode", "elimination");
  await expectSetting(host, "Level", "easy");
  await closeSheet(host);

  const tolu = await newPlayer(browser);
  await tolu.goto(host.url());
  await joinAs(tolu, "Tolu");
  const kemi = await newPlayer(browser);
  await kemi.goto(host.url());
  await joinAs(kemi, "Kemi");

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, tolu, kemi]) {
    await expect(page.locator(".play-count")).toContainText("Round 1");
  }
  await expect(host.locator(".play-timer")).toBeVisible({ timeout: 10_000 });

  // Two of three stay in: once two have finished, the third is out.
  await solve(tolu);
  await solve(host);
  await expect(kemi.getByRole("heading", { name: "You’re out" })).toBeVisible();
  await expect(host.getByRole("heading", { name: "Round 1 is over" })).toBeVisible();

  // The final starts on its own, with a new picture.
  await expect(host.locator(".play-count")).toHaveText("The final", { timeout: 20_000 });
  await solve(host);
  const rankings = host.getByRole("complementary", { name: "Final Rankings" });
  await expect(rankings.getByRole("listitem").first()).toContainText("Ada");
  await expect(rankings.getByRole("listitem").nth(2)).toContainText("Kemi");
});

test("Insane keeps a photo's own shape: the canvas is as wide as the photo", async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  await page.goto("/games/jigsaw");
  await page.getByRole("button", { name: /Insane/ }).click();
  await page
    .getByLabel("Choose your photo")
    .setInputFiles(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url)));
  await joinAs(page, "Ada");
  const cropper = page.getByRole("dialog", { name: "Frame your jigsaw" });
  await expect(cropper.getByRole("slider", { name: /The part to use/ })).toBeVisible();
  await cropper.getByRole("button", { name: "Use this photo" }).click();
  await expect(cropper).toBeHidden();

  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.locator(".insane-view")).toBeVisible({ timeout: 10_000 });
  // The photo is wider than tall, so the canvas is too, in about a hundred pieces.
  const box = (await page.locator(".insane-canvas").boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(1.3);
  const pieces = await page
    .getByRole("list", { name: /Pieces to place/ })
    .getByRole("listitem")
    .count();
  expect(pieces).toBeGreaterThanOrEqual(90);
  expect(pieces).toBeLessThanOrEqual(110);
});
