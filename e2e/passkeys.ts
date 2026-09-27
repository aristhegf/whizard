import { expect, type Page } from "@playwright/test";

/** Gives the page a virtual authenticator that approves every passkey prompt. */
export async function withPasskeys(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

export const uniqueUsername = () => `ada_${Math.random().toString(36).slice(2, 10)}`;

export async function signUp(page: Page, username: string, name = "Ada") {
  await page.goto("/account");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel(/13 or older/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText(`@${username}`)).toBeVisible();
}
