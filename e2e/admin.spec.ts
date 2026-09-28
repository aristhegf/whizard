import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

test.describe.configure({ timeout: 90_000 });

function grantAdmin(username: string) {
  execFileSync("node", ["scripts/set-admin.mjs", username, "grant"], {
    cwd: "apps/server",
    env: { ...process.env, STATS_LOCAL: "1" },
    stdio: "ignore",
  });
}

async function signedUp(browser: Browser): Promise<{ page: Page; username: string }> {
  const page = await (await browser.newContext()).newPage();
  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username);
  return { page, username };
}

test("only admins get the dashboard", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Sign in with an admin account")).toBeVisible();

  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username);
  await page.goto("/admin");
  await expect(page.getByText("This page is for Whizard admins.")).toBeVisible();
  // The server refuses too, not just the page.
  for (const path of ["overview?range=30", "users", "rooms", "analytics?range=30"]) {
    expect((await page.request.get(`/api/admin/${path}`)).status()).toBe(403);
  }

  grantAdmin(username);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible();
  for (const label of ["Games Played", "Unique Players", "Rooms Created"]) {
    await expect(page.locator(".admin-kpi", { hasText: label }).locator("dd")).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Live Activity" })).toBeVisible();

  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole("heading", { name: "Reported questions" })).toBeVisible();

  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole("heading", { name: "Visitors Over Time" })).toBeVisible();
  await expect(page.locator(".admin-kpi", { hasText: "Page Views" }).locator("dd")).toHaveText(
    /^[\d,]+$/,
  );
});

test("an admin can suspend an account and let it back in", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const player = await signedUp(browser);

  await admin.page.goto("/admin/users");
  await admin.page.getByLabel("Search accounts").fill(player.username);
  const row = admin.page.locator(".user-row", { hasText: `@${player.username}` });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Suspend" }).click();
  await expect(row.getByText("Suspended")).toBeVisible();

  // Signed out everywhere, and the passkey no longer signs in.
  await player.page.goto("/account");
  await player.page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(player.page.getByText("This account has been suspended.")).toBeVisible();

  await row.getByRole("button", { name: "Unsuspend" }).click();
  await expect(row.getByText("Active")).toBeVisible();
  await player.page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(player.page.getByText(`@${player.username}`)).toBeVisible();
});

test("an admin sees open rooms and can close one", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);

  const host = await (await browser.newContext()).newPage();
  await host.goto("/");
  await host.getByRole("button", { name: "Create a Room" }).click();
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{6}$/);
  const code = host.url().slice(-6);
  await host.getByLabel("Choose a nickname").fill("Zed");
  await host.getByRole("button", { name: "Join", exact: true }).click();
  await expect(host.getByLabel("Questions")).toBeVisible();

  await admin.page.goto("/admin/rooms");
  const row = admin.page.locator(".room-row", { hasText: code });
  await expect(row.getByText("Zed")).toBeVisible();
  await expect(row.getByText("Waiting")).toBeVisible();
  await row.getByRole("button", { name: "Close room" }).click();
  await row.getByRole("button", { name: `Close ${code}` }).click();
  await expect(row).toHaveCount(0);
  await expect(host.getByText("This room was closed by Whizard.")).toBeVisible();
});
