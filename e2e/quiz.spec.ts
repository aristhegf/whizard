import { expect, test, type Browser, type Page } from "@playwright/test";

test.describe.configure({ timeout: 90_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: nickname })).toBeVisible();
}

function option(page: Page, group: string, name: string) {
  return page.getByRole("group", { name: group }).getByRole("button", { name, exact: true });
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
  await page.goto("/");
  await page.getByRole("button", { name: "Play solo" }).click();
  await joinAs(page, "Ada");

  await expect(option(page, "Mode", "Classic")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Time per question" })).toHaveCount(0);
  await option(page, "Questions", "5").click();
  await expect(option(page, "Questions", "5")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Play solo" }).click();
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

  await page.getByRole("button", { name: "Change settings" }).click();
  await expect(option(page, "Questions", "5")).toHaveAttribute("aria-pressed", "true");
});

test("solo moves on by itself after the explanation", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/");
  await page.getByRole("button", { name: "Play solo" }).click();
  await joinAs(page, "Ada");
  await page.getByRole("button", { name: "Play solo" }).click();

  await answerFirstChoice(page, 1, 10);
  await expect(page.locator(".progress")).toContainText("2 / 10", { timeout: 6000 });
});

test("every category can be picked and played", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/");
  await page.getByRole("button", { name: "Play solo" }).click();
  await joinAs(page, "Ada");

  const category = page.getByLabel("Category");
  await expect(category.locator("option:disabled")).toHaveCount(0);
  await category.selectOption({ label: "Nigerian culture" });
  await expect(page.getByLabel("Category")).toHaveValue("nigerian-culture");
  await page.getByRole("button", { name: "Play solo" }).click();
  await answerFirstChoice(page, 1, 10);
});

test("Speed mode puts a timer on every question", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/");
  await page.getByRole("button", { name: "Play solo" }).click();
  await joinAs(page, "Ada");

  await option(page, "Mode", "Speed").click();
  await expect(page.getByRole("group", { name: "Time per question" })).toBeVisible();
  await option(page, "Time per question", "10s").click();
  await expect(option(page, "Time per question", "10s")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Play solo" }).click();

  await expect(page.locator(".progress")).toContainText("1 / 10", { timeout: 10_000 });
  await expect(page.getByRole("progressbar", { name: "Time left" })).toBeVisible();
});

test("friends play at their own pace and only see points", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Play with friends" }).click();
  await joinAs(host, "Ada");
  await option(host, "Questions", "5").click();

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.getByText(/Classic quiz · Bible · Easy · 5 questions/)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Start game" })).toHaveCount(0);

  await host.getByRole("button", { name: "Start game" }).click();
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
    await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible();
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
  await host.goto("/");
  await host.getByRole("button", { name: "Play with friends" }).click();
  await joinAs(host, "Ada");
  await host.getByRole("button", { name: "Play solo" }).click();
  await expect(host.getByText("Get ready")).toBeVisible();

  const late = await newPlayer(browser);
  await late.goto(host.url());
  await late.getByLabel("Choose a nickname").fill("Tolu");
  await late.getByRole("button", { name: "Join", exact: true }).click();
  await expect(late.getByText("A game is in progress.")).toBeVisible();
});
