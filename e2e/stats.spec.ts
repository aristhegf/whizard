import { expect, test } from "@playwright/test";

/** Reads "N here now" from a page. Other tests run at the same time, so counts are "at least". */
function hereNow(text: string): number {
  const match = /([\d,]+) here now/.exec(text);
  return match ? Number(match[1]!.replace(/,/g, "")) : 0;
}

test("the home page shows visitors so far and who's here now", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  await first.goto("/");
  const counter = first.locator(".live-count");
  await expect(counter).toHaveText(/^[\d,]+ visitors? so far[\d,]+ here now$/);
  await expect.poll(async () => hereNow(await counter.innerText())).toBeGreaterThanOrEqual(1);

  // A second person arriving shows up for the first without a reload.
  const second = await (await browser.newContext()).newPage();
  await second.goto("/games");
  await expect
    .poll(async () => hereNow(await counter.innerText()), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
});

test("the stats page shows rooms, games and visits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Stats" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("heading", { name: "Who’s been playing" })).toBeVisible();

  for (const label of ["Visitors", "Visits", "Page views", "Rooms created", "Games played"]) {
    await expect(page.locator(".stat-tile", { hasText: label }).locator("dd")).toHaveText(
      /^[\d,]+$/,
    );
  }
  await expect(page.getByText(/Visitors per day · last 30 days/)).toBeVisible();

  await page.getByRole("button", { name: "7d" }).click();
  await expect(page.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Visitors per day · last 7 days/)).toBeVisible();
  await expect(page.locator(".day-chart").first().locator(".bar")).toHaveCount(7);
});
