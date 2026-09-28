import { expect, test, type Browser, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Players" }).getByRole("listitem").filter({ hasText: nickname }),
  ).toBeVisible();
}

async function openRoom(page: Page, nickname = "Ada") {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a Room" }).click();
  await joinAs(page, nickname);
}

async function answerFirstChoice(page: Page, question: number, total: number) {
  await expect(page.locator(".progress")).toContainText(`${question} / ${total}`, {
    timeout: 10_000,
  });
  const choice = page.locator("button.choice").first();
  await expect(choice).toBeEnabled();
  await choice.click();
  await expect(page.getByRole("status")).toHaveText(/Correct|Wrong/);
}

test("plays a solo quiz with explanations and a review", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);

  await expect(page.getByLabel("Game Mode")).toHaveValue("classic");
  await expect(page.getByLabel("Time per question")).toHaveCount(0);
  await page.getByLabel("Questions").selectOption("5");
  await expect(page.getByLabel("Questions")).toHaveValue("5");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText("Get ready")).toBeVisible();

  for (let i = 1; i <= 5; i++) {
    await expect(page.locator(".progress")).toContainText(`${i} / 5`, { timeout: 10_000 });
    await expect(page.getByRole("progressbar", { name: "Time left" })).toHaveCount(0);
    await answerFirstChoice(page, i, 5);
    await expect(page.locator(".explanation")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
  }

  await expect(page.getByText("Your score")).toBeVisible();
  await expect(page.getByText(/\d of 5 correct/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your answers" })).toBeVisible();
  await expect(page.locator(".review li")).toHaveCount(5);
  await expect(page.locator(".review .explanation")).toHaveCount(5);

  // Any question in the review can be reported.
  const first = page.locator(".review li").first();
  await first.getByRole("button", { name: "Report this question" }).click();
  await expect(first.getByRole("button", { name: "Send report" })).toBeDisabled();
  await first.getByLabel("It’s unclear or has a typo").check();
  await first.getByRole("button", { name: "Send report" }).click();
  await expect(first.getByRole("status")).toHaveText(/Thanks for the report/);

  await page.getByRole("button", { name: "Change Game" }).click();
  await expect(page.getByLabel("Questions")).toHaveValue("5");
});

test("solo moves on by itself after the explanation", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  await answerFirstChoice(page, 1, 10);
  await expect(page.locator(".progress")).toContainText("2 / 10", { timeout: 6000 });
});

test("every category can be picked and played", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);

  const category = page.getByLabel("Category");
  await expect(category.locator("option:disabled")).toHaveCount(0);
  await category.selectOption({ label: "Nigerian culture" });
  await expect(page.getByLabel("Category")).toHaveValue("nigerian-culture");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await answerFirstChoice(page, 1, 10);
});

test("Speed mode puts a timer on every question", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);

  await page.getByLabel("Game Mode").selectOption("speed");
  await expect(page.getByLabel("Time per question")).toBeVisible();
  await page.getByLabel("Time per question").selectOption("10");
  await expect(page.getByLabel("Time per question")).toHaveValue("10");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  await expect(page.locator(".progress")).toContainText("1 / 10", { timeout: 10_000 });
  await expect(page.getByRole("progressbar", { name: "Time left" })).toBeVisible();
});

test("friends play at their own pace and only see points", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openRoom(host);
  await host.getByLabel("Questions").selectOption("5");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.getByText(/Classic quiz · Bible · Easy · 5 questions/)).toBeVisible();
  await expect(guest.getByRole("button", { name: /start game/i })).toHaveCount(0);

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) await expect(page.getByText("Get ready")).toBeVisible();

  // The host plays the whole game while the guest hasn’t answered anything.
  for (let i = 1; i <= 5; i++) {
    await answerFirstChoice(host, i, 5);
    await expect(host.locator(".explanation")).toHaveCount(0);
    await expect(host.getByRole("button", { name: "Skip" })).toHaveCount(0);
  }
  await expect(guest.locator(".progress")).toContainText("1 / 5");

  await expect(host.getByRole("heading", { name: "Results so far" })).toBeVisible();
  await expect(host.locator(".board li").filter({ hasText: "Tolu" })).toContainText("Playing");
  await expect(host.locator(".review li")).toHaveCount(5);

  for (let i = 1; i <= 5; i++) await answerFirstChoice(guest, i, 5);

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Final Rankings" })).toBeVisible();
    const board = page.locator(".board li");
    await expect(board).toHaveCount(2);
    await expect(board.first()).toHaveText(/^1(Ada|Tolu)[\d,]+$/);
    await expect(page.locator(".board")).not.toContainText("correct");
    await expect(page.locator(".review li")).toHaveCount(5);
  }
  await expect(host.getByRole("button", { name: "Play again" })).toBeVisible();
  await expect(guest.getByText("Waiting for the host to start the next game.")).toBeVisible();
});

test("a player who arrives mid-game watches until the next one", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openRoom(host);
  await host.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(host.getByText("Get ready")).toBeVisible();

  const late = await newPlayer(browser);
  await late.goto(host.url());
  await late.getByLabel("Choose a nickname").fill("Tolu");
  await late.getByRole("button", { name: "Join", exact: true }).click();
  await expect(late.getByText("A game is in progress.")).toBeVisible();
});

test("shows live scores on tablets and computers, but not on phones", async ({ browser }) => {
  const desktop = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 } })
  ).newPage();
  await openRoom(desktop);
  // Wider screens get the morphing dropdown instead of the built-in one.
  await desktop.getByRole("button", { name: /^Questions/ }).click();
  await desktop.getByRole("option", { name: "5", exact: true }).click();
  await expect(desktop.getByRole("button", { name: /^Questions/ })).toContainText("5");
  const phone = await newPlayer(browser);
  await phone.goto(desktop.url());
  await joinAs(phone, "Tolu");
  await desktop.getByRole("button", { name: /start game/i }).press("Enter");

  await expect(desktop.locator(".progress")).toContainText("1 / 5", { timeout: 10_000 });
  await expect(phone.locator(".progress")).toContainText("1 / 5", { timeout: 10_000 });
  const live = desktop.getByRole("complementary", { name: "Live scores" });
  await expect(live).toBeVisible();
  await expect(live.getByRole("listitem")).toHaveCount(2);
  await expect(phone.getByRole("complementary", { name: "Live scores" })).toBeHidden();
});

test("a late joiner plays the running game when the host allows it", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openRoom(host);
  await host.getByRole("switch", { name: "Allow Late Join" }).click();
  await expect(host.getByRole("switch", { name: "Allow Late Join" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await host.getByRole("button", { name: /play solo/i }).press("Enter");
  await answerFirstChoice(host, 1, 10);

  const late = await newPlayer(browser);
  await late.goto(host.url());
  await late.getByLabel("Choose a nickname").fill("Tolu");
  await late.getByRole("button", { name: "Join", exact: true }).click();
  await answerFirstChoice(late, 1, 10);
});

test("the lobby has a QR code and room limits", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openRoom(host);
  await expect(host.getByRole("img", { name: "QR code that opens this room" })).toBeVisible();
  await host.getByLabel("Max Players").selectOption("2");
  await expect(host.getByText("1/2 players")).toBeVisible();
});

test("a long game with friends ends on the final rankings", async ({ browser }) => {
  // A finished 15-question game's review is much bigger than anything a player sends; it once
  // got dropped by the size check meant for players, leaving everyone stuck on the last answer.
  const host = await newPlayer(browser);
  await openRoom(host);
  await host.getByLabel("Questions").selectOption("15");
  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await host.getByRole("button", { name: /start game/i }).press("Enter");

  const play = async (page: Page) => {
    for (let i = 1; i <= 15; i++) await answerFirstChoice(page, i, 15);
  };
  await Promise.all([play(host), play(guest)]);

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Final Rankings" })).toBeVisible();
    await expect(page.locator(".review li")).toHaveCount(15);
  }
  // Reloading keeps the results.
  await guest.reload();
  await expect(guest.getByRole("heading", { name: "Final Rankings" })).toBeVisible();
});

test("playing again doesn't repeat questions", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);
  await page.getByLabel("Questions").selectOption("5");

  const play = async () => {
    const prompts: string[] = [];
    for (let i = 1; i <= 5; i++) {
      await expect(page.locator(".progress")).toContainText(`${i} / 5`, { timeout: 10_000 });
      prompts.push(await page.locator(".prompt").innerText());
      await answerFirstChoice(page, i, 5);
      await page.getByRole("button", { name: "Skip" }).click();
    }
    await expect(page.getByText("Your score")).toBeVisible();
    return prompts;
  };

  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  const first = await play();
  await page.getByRole("button", { name: "Play again" }).click();
  const second = await play();
  expect(second.filter((prompt) => first.includes(prompt))).toEqual([]);
});

test("an Elimination game knocks players out until two meet in the final", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await newPlayer(browser);
  await openRoom(host);
  // Each change is sent with the settings the room last confirmed, so wait for each one.
  await host.getByLabel("Game Mode").selectOption("elimination");
  await expect(host.getByLabel("Game Mode")).toHaveValue("elimination");
  // In Elimination the number is each round's.
  await host.getByLabel("Questions per round").selectOption("5");
  await expect(host.getByLabel("Questions per round")).toHaveValue("5");
  await host.getByLabel("Time per question").selectOption("10");
  await expect(host.getByLabel("Time per question")).toHaveValue("10");
  await expect(
    host.getByText(/With 3 players that’s 1 knock-out round and the final: 10/),
  ).toBeVisible();
  // Alone, the host is told how many more are needed.
  await expect(host.getByText("Elimination needs at least 3 players. Invite 2 more")).toBeVisible();

  const players = [host];
  for (const name of ["Tolu", "Kemi"]) {
    const page = await newPlayer(browser);
    await page.goto(host.url());
    await joinAs(page, name);
    players.push(page);
  }
  await expect(
    players[1]!.getByText(/Elimination quiz · Bible · Easy · 5 questions a round/),
  ).toBeVisible();
  await host.getByRole("button", { name: /start game/i }).press("Enter");

  // Everyone answers every question they can until the game ends. With three players there's
  // one knock-out round of five questions, then a final of five.
  const seen = new Set<string>();
  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline && !seen.has("done")) {
    for (const [i, page] of players.entries()) {
      const choice = page.locator("button.choice:not([disabled])");
      if ((await choice.count()) > 0)
        await choice
          .nth(i % 4)
          .click()
          .catch(() => undefined);
    }
    if (await host.locator(".elim-cut").count()) seen.add("cut");
    if (await host.getByRole("heading", { name: "The Final" }).count()) seen.add("final");
    if (await host.getByRole("heading", { name: "Final Rankings" }).count()) seen.add("done");
    await host.waitForTimeout(200);
  }
  expect([...seen].sort()).toEqual(["cut", "done", "final"]);

  for (const page of players) {
    await expect(page.getByRole("heading", { name: "Final Rankings" })).toBeVisible();
    const board = page.locator(".board li");
    await expect(board).toHaveCount(3);
    await expect(board.nth(0)).toContainText("Winner");
    await expect(board.nth(1)).toContainText("Runner-up");
    // Round 1, or a tie-break round after it if two tied exactly.
    await expect(board.nth(2)).toContainText(/Out in round \d/);
  }
});

test("Auto starts easy and gets harder", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);
  await page.getByLabel(/^Level/).selectOption("auto");
  await expect(page.getByLabel(/^Level/)).toHaveValue("auto");
  await expect(page.getByText(/Starts easy and gets harder each round/)).toBeVisible();
  await page.getByLabel("Questions").selectOption("5");
  await expect(page.getByLabel("Questions")).toHaveValue("5");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  for (let i = 1; i <= 5; i++) {
    await answerFirstChoice(page, i, 5);
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await expect(page.getByText("Your score")).toBeVisible();
  await expect(page.locator(".review li")).toHaveCount(5);
});

test("the results can be shared as a 16:9 picture", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openRoom(page);
  await page.getByLabel("Questions").selectOption("5");
  await expect(page.getByLabel("Questions")).toHaveValue("5");
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  for (let i = 1; i <= 5; i++) {
    await answerFirstChoice(page, i, 5);
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await expect(page.getByText("Your score")).toBeVisible();

  await page.getByRole("button", { name: "Share" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Share your results" });
  const picture = dialog.getByRole("img", { name: /Your game results/ });
  await expect(picture).toBeVisible({ timeout: 10_000 });
  const size = await picture.evaluate((img: HTMLImageElement) => [
    img.naturalWidth,
    img.naturalHeight,
  ]);
  expect(size).toEqual([1920, 1080]);
  await expect(dialog.getByRole("link", { name: "Download" })).toHaveAttribute(
    "download",
    "whizard-results.png",
  );
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});
