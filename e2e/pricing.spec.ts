import { expect, test } from "@playwright/test";

test("the pricing page shows the three plans and answers questions", async ({ page }) => {
  await page.goto("/");
  // The pages about Whizard are linked at the bottom of the screen.
  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Pricing" })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Play for free.Create without limits.",
  );

  for (const plan of ["Free", "Pro", "Organizations & Events"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true })).toBeVisible();
  }

  // Currency toggle lets visitors switch between NGN and USD
  await page.getByRole("button", { name: "₦ NGN" }).click();
  await expect(page.getByText("₦0", { exact: true })).toBeVisible();
  await expect(page.getByText("₦5,000", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "$ USD" }).click();
  await expect(page.getByText("$0", { exact: true })).toBeVisible();
  await expect(page.getByText("$5", { exact: true })).toBeVisible();
  await expect(page.getByText("Custom pricing", { exact: true })).toBeVisible();

  // On phones the plans slide sideways, and the dots show and pick which one is in view.
  const dot = (plan: string) => page.getByRole("button", { name: `Show the ${plan} plan` });
  await expect(dot("Free")).toHaveAttribute("aria-current", "true");
  await dot("Organizations & Events").click();
  await expect(page.getByRole("heading", { name: "Organizations & Events" })).toBeInViewport();
  await expect(dot("Organizations & Events")).toHaveAttribute("aria-current", "true");
  await expect(dot("Free")).not.toHaveAttribute("aria-current");

  // Upgrade button prompts sign-in when not signed in
  await page.getByRole("button", { name: "Upgrade to Pro" }).click();
  await expect(page).toHaveURL(/\/account\?next=%2Fpricing$/);

  // Return to pricing for FAQ and WhatsApp links
  await page.goto("/pricing");

  // Organizations reach us on WhatsApp with a message ready to send.
  const talk = page.getByRole("link", { name: "Talk to Us" });
  await expect(talk).toHaveAttribute("href", /^https:\/\/wa\.me\/2349161294881\?text=Hi%20Whizard/);

  const question = page.getByText("Do my friends need a Whizard account to play?");
  await question.click();
  await expect(page.getByText("Your friends join with just a nickname.")).toBeVisible();

  await page.getByRole("link", { name: "Get Started Free" }).click();
  await expect(page).toHaveURL(/\/games$/);
});
