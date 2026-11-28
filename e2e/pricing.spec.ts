import { expect, test } from "@playwright/test";
import { openMenu } from "./menu";

test("the pricing page shows the two plans and answers questions", async ({ page }) => {
  await page.goto("/");
  // The pages about Whizard are in the side strip.
  await (await openMenu(page)).getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Playing is free");

  const plans = page.getByRole("list", { name: "Plans" });
  for (const plan of ["Free", "Pro"]) {
    await expect(plans.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  // No comparison table any more: the plan cards say it once.
  await expect(page.getByRole("table")).toHaveCount(0);

  // Currency toggle lets visitors switch between NGN and USD
  await page.getByRole("button", { name: "₦ NGN" }).click();
  await expect(page.getByText("₦0", { exact: true })).toBeVisible();
  await expect(page.getByText("₦5,000", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "$ USD" }).click();
  await expect(page.getByText("$0", { exact: true })).toBeVisible();
  await expect(page.getByText("$5", { exact: true })).toBeVisible();

  // Going Pro asks a guest to sign in first.
  await page.getByRole("button", { name: "Go Pro" }).click();
  await expect(page).toHaveURL(/\/account\?next=%2Fpricing$/);

  await page.goto("/pricing");

  // Organizations reach us on WhatsApp with a message ready to send.
  const talk = page.getByRole("link", { name: "Talk to us" });
  await expect(talk).toHaveAttribute("href", /^https:\/\/wa\.me\/2349161294881\?text=Hi%20Whizard/);

  const answer = page.getByText("Word documents (.docx and .doc), CSV files and plain text.");
  await expect(answer).toBeHidden();
  await page.getByText("What files can I import?").click();
  await expect(answer).toBeVisible();

  await page.getByRole("link", { name: "Play now" }).click();
  await expect(page).toHaveURL(/\/games$/);
});
