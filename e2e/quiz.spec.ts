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

async function answerFirstChoice(page: Page) {
  const choice = page.locator("button.choice").first();
  await expect(choice).toBeEnabled({ timeout: 10_000 });
  await choice.click();
}

test("plays a solo Speed Quiz from start to finish", async ({ browser }) => {
  const page = await newPlayer(browser);
  await page.goto("/");
  await page.getByRole("button", { name: "Play solo" }).click();
  await joinAs(page, "Ada");

  await option(page, "Mode", "Speed Quiz").click();
  await expect(option(page, "Mode", "Speed Quiz")).toHaveAttribute("aria-pressed", "true");
  await option(page, "Questions", "5").click();
  await expect(option(page, "Questions", "5")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Play solo" }).click();
  await expect(page.getByText("Get ready")).toBeVisible();

  for (let i = 1; i <= 5; i++) {
    await expect(page.getByText(`Question ${i} of 5`)).toBeVisible({ timeout: 10_000 });
    await answerFirstChoice(page);
    await expect(page.getByRole("status")).toHaveText(/Correct!|Not quite/);
    await page.getByRole("button", { name: i < 5 ? "Next question" : "See results" }).click();
  }

  await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible();
  await expect(page.getByText(/\d of 5 correct/)).toBeVisible();

  await page.getByRole("button", { name: "Change settings" }).click();
  await expect(option(page, "Mode", "Speed Quiz")).toHaveAttribute("aria-pressed", "true");
});

test("two players play a Classic quiz together", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Play with friends" }).click();
  await joinAs(host, "Ada");
  await option(host, "Questions", "5").click();

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.getByText(/Classic/)).toBeVisible();
  await expect(guest.getByText(/5 questions/)).toBeVisible();
  await expect(guest.getByRole("button", { name: "Start game" })).toHaveCount(0);

  await host.getByRole("button", { name: "Start game" }).click();

  for (let i = 1; i <= 5; i++) {
    for (const page of [host, guest]) {
      await expect(page.getByText(`Question ${i} of 5`)).toBeVisible({ timeout: 15_000 });
    }
    await answerFirstChoice(host);
    await expect(host.getByText("1 of 2 answered")).toBeVisible();
    await answerFirstChoice(guest);
    for (const page of [host, guest]) {
      await expect(page.getByRole("status")).toHaveText(/Correct!|Not quite/);
    }
  }

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Final results" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".standings li")).toHaveCount(2);
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
