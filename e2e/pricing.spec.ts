import { expect, test } from "@playwright/test";

test("the pricing page shows the three plans and answers questions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Play for free.Create without limits.",
  );

  for (const plan of ["Free", "Pro", "Organizations & Events"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }
  await expect(page.getByText("₦0", { exact: true })).toBeVisible();
  await expect(page.getByText("₦5,000", { exact: true })).toBeVisible();
  await expect(page.getByText("Custom pricing", { exact: true })).toBeVisible();

  // On phones the plans slide sideways, and the dots show and pick which one is in view.
  const dot = (plan: string) => page.getByRole("button", { name: `Show the ${plan} plan` });
  await expect(dot("Free")).toHaveAttribute("aria-current", "true");
  await dot("Organizations & Events").click();
  await expect(page.getByRole("heading", { name: "Organizations & Events" })).toBeInViewport();
  await expect(dot("Organizations & Events")).toHaveAttribute("aria-current", "true");
  await expect(dot("Free")).not.toHaveAttribute("aria-current");

  // Pro can't be bought yet, so the button says it's coming.
  await page.getByRole("button", { name: "Upgrade to Pro" }).click();
  // Filtered, since a site announcement is a status too.
  await expect(page.getByRole("status").filter({ hasText: /Pro is coming soon/ })).toBeVisible();

  // Organizations reach us on WhatsApp with a message ready to send.
  const talk = page.getByRole("link", { name: "Talk to Us" });
  await expect(talk).toHaveAttribute("href", /^https:\/\/wa\.me\/2349161294881\?text=Hi%20Whizard/);

  const question = page.getByText("Do my friends need a Whizard account to play?");
  await question.click();
  await expect(page.getByText("Your friends join with just a nickname.")).toBeVisible();

  await page.getByRole("link", { name: "Get Started Free" }).click();
  await expect(page).toHaveURL(/\/games$/);
});
