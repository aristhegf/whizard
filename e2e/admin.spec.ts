import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

test("only admins get the dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Sign in with an admin account")).toBeVisible();

  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username);
  await page.goto("/admin");
  await expect(page.getByText("This page is for Whizard admins.")).toBeVisible();
  // The server refuses too, not just the page.
  expect((await page.request.get("/api/admin/overview?range=30")).status()).toBe(403);

  execFileSync("node", ["scripts/set-admin.mjs", username, "grant"], {
    cwd: "apps/server",
    env: { ...process.env, STATS_LOCAL: "1" },
    stdio: "ignore",
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
  for (const label of ["Games Played", "Unique Players", "Rooms Created"]) {
    await expect(page.locator(".admin-kpi", { hasText: label }).locator("dd")).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Live Activity" })).toBeVisible();

  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole("heading", { name: "Reported questions" })).toBeVisible();
});
