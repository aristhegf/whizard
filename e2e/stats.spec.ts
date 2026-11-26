import { expect, test } from "@playwright/test";

/** Reads "N playing now" or "N here now" from a page. Other tests run at the same time, so
 * counts are "at least". */
function hereNow(text: string): number {
  const match = /([\d,]+) (?:playing|here) now/.exec(text);
  return match ? Number(match[1]!.replace(/,/g, "")) : 0;
}

test("the home page shows who's playing now, once, beside the games", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  await first.goto("/");
  const picks = first.locator("section", {
    has: first.getByRole("heading", { name: "Pick a game" }),
  });
  const counter = picks.getByText(/playing now$/);
  await expect(counter).toHaveText(/^[\d,]+ playing now$/);
  await expect.poll(async () => hereNow(await counter.innerText())).toBeGreaterThanOrEqual(1);
  // The only count on the page: none in the top bar, and no visitor total.
  await expect(first.locator("header.topnav")).not.toContainText(/now|so far/);
  await expect(first.getByText(/so far/)).toHaveCount(0);

  // A second person arriving shows up for the first without a reload.
  const second = await (await browser.newContext()).newPage();
  await second.goto("/games");
  await expect
    .poll(async () => hereNow(await counter.innerText()), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);

  // The Games screen keeps its own pill, with the visitors so far.
  await expect(second.locator(".live-count")).toHaveText(
    /^[\d,]+ visitors? so far[\d,]+ here now$/,
  );
});

test("the stats page shows what the community plays", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Stats" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The worldis playingWhizard");

  for (const label of [
    "Games played",
    "Players joined",
    "Game rooms created",
    "Questions played",
  ]) {
    await expect(page.locator(".total", { hasText: label }).locator("dd")).toHaveText(/^[\d,]+$/);
  }
  for (const heading of [
    "Most Played Games",
    "Most Popular Topics",
    "Whizard Around the World",
    "Currently Popular",
    "Top Players",
    "Ready to be part of the fun?",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  // Games that aren't out yet say so instead of showing a count.
  const games = page.locator("section", {
    has: page.getByRole("heading", { name: "Most Played Games" }),
  });
  await expect(games.getByText("Quiz", { exact: true })).toBeVisible();
  await games.getByRole("button", { name: "View all" }).click();
  await expect(games.getByRole("listitem")).toHaveCount(11);
  await expect(games.getByRole("listitem").filter({ hasText: "Memory" })).not.toContainText(
    "Coming soon",
  );
  await expect(
    games.getByRole("listitem").filter({ hasText: "How Well Do You Know Me?" }),
  ).not.toContainText("Coming soon");
  await expect(games.getByRole("listitem").filter({ hasText: "Impostor" })).toContainText(
    "Coming soon",
  );
  await expect(games.getByRole("listitem").filter({ hasText: "Spot It" })).not.toContainText(
    "Coming soon",
  );
});
