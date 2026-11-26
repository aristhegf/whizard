import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseSetting, closeSheet, openSettings } from "./lobby";

test.describe.configure({ timeout: 150_000 });

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

/** The host opens Most Likely To from the games page, sets it up, and two friends join. */
async function room(browser: Browser, anonymous: boolean): Promise<[Page, Page, Page]> {
  const ada = await newPlayer(browser);
  await ada.goto("/games");
  await ada.getByRole("button", { name: "Play Most Likely To" }).click();
  await joinAs(ada, "Ada");
  await openSettings(ada);
  await chooseSetting(ada, "Pack", "family");
  await chooseSetting(ada, "Rounds", "5");
  await chooseSetting(ada, "Time limit", "10");
  if (anonymous) await ada.getByRole("switch", { name: "Anonymous votes" }).click();
  await closeSheet(ada);
  await expect(ada.locator(".summary")).toContainText(
    `Family, 5 rounds, 10s${anonymous ? ", anonymous" : ""}`,
  );
  // It takes three: someone to vote for besides yourself.
  await expect(ada.getByText("Most Likely To needs at least 3 players.")).toBeVisible();

  const bo = await newPlayer(browser);
  await bo.goto(ada.url());
  await joinAs(bo, "Bo");
  const cy = await newPlayer(browser);
  await cy.goto(ada.url());
  await joinAs(cy, "Cy");
  await ada.getByRole("button", { name: /start game/i }).press("Enter");
  return [ada, bo, cy];
}

/** Waits for the vote of this round and taps the tile with this name. */
async function vote(page: Page, round: number, name: string) {
  await expect(page.locator(".play-count")).toContainText(`Round ${round} of 5`, {
    timeout: 15_000,
  });
  await expect(page.getByText("Most likely to", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page
    .getByLabel("Players", { exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}

test("three friends vote, see who the room picked and who voted for whom, then the results", async ({
  browser,
}) => {
  const [ada, bo, cy] = await room(browser, false);

  // Round 1: everyone picks Bo (Bo picks themselves, "You").
  await vote(ada, 1, "Bo");
  await expect(ada.getByRole("button", { name: "Bo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Ada's vote shows as her face lit up; the others are still dimmed.
  await expect(bo.getByLabel("1 of 3 have voted")).toBeVisible();
  await vote(bo, 1, "You");
  await vote(cy, 1, "Bo");

  // The vote closes as soon as everyone has voted.
  for (const page of [ada, cy]) {
    await expect(page.locator(".mlt-winner-name")).toHaveText("Bo", { timeout: 8_000 });
    await expect(page.locator(".mlt-count")).toHaveText("3 votes");
    await expect(page.getByRole("img", { name: /^Voted for by / })).toHaveCount(1);
    await expect(page.locator(".mlt-winner .mlt-stack .avatar")).toHaveCount(3);
    await expect(page.getByText("You read the room")).toContainText("+100");
  }
  await expect(bo.locator(".mlt-winner-name")).toHaveText("You");

  // The rest of the game: a split vote in round 2 shows a winner and a row for the other.
  await Promise.all([vote(ada, 2, "Cy"), vote(bo, 2, "Cy"), vote(cy, 2, "Ada")]);
  await expect(ada.locator(".mlt-winner-name")).toHaveText("Cy", { timeout: 8_000 });
  const rows = ada.getByRole("list", { name: "Other votes" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("You");
  await expect(rows.first()).toContainText("1");

  for (let round = 3; round <= 5; round++) {
    await Promise.all([vote(ada, round, "Bo"), vote(bo, round, "Cy"), vote(cy, round, "Bo")]);
  }

  for (const page of [ada, bo, cy]) {
    await expect(page.getByRole("heading", { name: "Most Likely To Results" })).toBeVisible({
      timeout: 15_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem")).toHaveCount(3);
  }
  // Ada went with the room every round: five reads of 100.
  const first = ada.getByRole("complementary", { name: "Final Rankings" }).getByRole("listitem");
  await expect(first.first()).toContainText("Ada");
  await expect(first.first()).toContainText("500");
});

test("anonymous votes show the tally but not who voted", async ({ browser }) => {
  const [ada, bo, cy] = await room(browser, true);
  await Promise.all([vote(ada, 1, "Cy"), vote(bo, 1, "Cy"), vote(cy, 1, "Ada")]);
  for (const page of [ada, bo, cy]) {
    await expect(page.locator(".mlt-count")).toHaveText("2 votes", { timeout: 8_000 });
    await expect(page.getByRole("list", { name: "Other votes" }).getByRole("listitem")).toHaveCount(
      1,
    );
    await expect(page.locator(".mlt-stack")).toHaveCount(0);
  }
  await expect(ada.locator(".mlt-winner-name")).toHaveText("Cy");
  await expect(ada.getByText("You read the room")).toBeVisible();
  await expect(cy.getByText("You read the room")).toHaveCount(0);
});
