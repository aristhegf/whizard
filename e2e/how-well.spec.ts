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

/** The answers, once the round's intro is over and the question is open. */
const answers = (page: Page) => page.locator("button.choice");

async function pick(page: Page, index: number) {
  await expect(answers(page)).toHaveCount(4, { timeout: 12_000 });
  await answers(page).nth(index).click();
}

test("three friends: the subject answers about themselves, the others guess, and it all adds up", async ({
  browser,
}) => {
  const ada = await newPlayer(browser);
  await ada.goto("/games");
  await ada.getByRole("button", { name: "Play How Well Do You Know Me?" }).click();
  await joinAs(ada, "Ada");

  // On your own there's nobody to guess, so the host is asked to invite someone.
  await expect(
    ada.getByRole("status").filter({ hasText: "needs at least 2 players" }),
  ).toBeVisible();

  await openSettings(ada);
  await chooseSetting(ada, "Pack", "best-friends");
  await chooseSetting(ada, "Rounds", "5");
  await chooseSetting(ada, "Time limit", "15");
  await closeSheet(ada);
  await expect(ada.locator(".summary")).toContainText("Best friends, 5 rounds, 15s each");

  const tolu = await newPlayer(browser);
  await tolu.goto(ada.url());
  await joinAs(tolu, "Tolu");
  const femi = await newPlayer(browser);
  await femi.goto(ada.url());
  await joinAs(femi, "Femi");
  const everyone = [ada, tolu, femi];

  await ada.getByRole("button", { name: /start game/i }).press("Enter");

  // Round 1 is Ada's: the intro says whose turn it is.
  await expect(ada.getByText("Your turn")).toBeVisible();
  await expect(tolu.getByText("Ada’s turn")).toBeVisible();

  // Ada reads about herself; the others see her face and her name in the question.
  await expect(answers(ada)).toHaveCount(4, { timeout: 12_000 });
  await expect(ada.getByText("About you. Pick the true one.")).toBeVisible();
  await expect(ada.locator(".prompt")).toContainText(/\byour?\b/);
  await expect(ada.locator(".prompt")).not.toContainText("{name}");
  for (const guesser of [tolu, femi]) {
    await expect(answers(guesser)).toHaveCount(4, { timeout: 12_000 });
    await expect(guesser.locator(".prompt")).toContainText("Ada");
    await expect(guesser.getByText("About you. Pick the true one.")).toHaveCount(0);
  }

  // Who has answered shows as faces, never what they picked.
  await pick(ada, 0);
  await expect(tolu.getByLabel("1 of 3 have answered")).toBeVisible();
  await expect(answers(ada).first()).toHaveClass(/picked/);
  await pick(tolu, 0);
  await pick(femi, 1);

  // Everyone answered, so the reveal comes at once: Ada's answer green, with Tolu's face on it.
  for (const page of everyone) {
    await expect(page.locator(".choice.correct")).toHaveCount(1, { timeout: 8_000 });
    await expect(page.locator(".choice").first()).toHaveClass(/correct/);
  }
  await expect(
    tolu.locator(".choice.correct").getByRole("img", { name: "Picked by You" }),
  ).toBeVisible();
  await expect(
    ada.locator(".choice.correct").getByRole("img", { name: "Picked by Tolu" }),
  ).toBeVisible();
  await expect(
    ada.locator(".choice").nth(1).getByRole("img", { name: "Picked by Femi" }),
  ).toBeVisible();
  await expect(tolu.locator(".howwell-toast")).toContainText(/You know Ada\s*\+\d/);
  await expect(ada.locator(".howwell-toast")).toContainText(/1 of 2 know you\s*\+500/);
  await expect(femi.locator(".howwell-toast")).toContainText("Ada keeps you guessing");

  // Round 2 is Tolu's, in seat order.
  await expect(tolu.locator(".play-count")).toContainText("Round 2 of 5", { timeout: 15_000 });
  await expect(answers(tolu)).toHaveCount(4, { timeout: 12_000 });
  await expect(tolu.getByText("About you. Pick the true one.")).toBeVisible();
  await expect(ada.locator(".prompt")).toContainText("Tolu");

  // The rest of the game: everyone picks the first answer.
  for (let round = 2; round <= 5; round++) {
    for (const page of everyone) {
      await expect(page.locator(".play-count")).toContainText(`Round ${round} of 5`, {
        timeout: 15_000,
      });
    }
    await Promise.all(everyone.map((page) => pick(page, 0)));
    await expect(ada.locator(".choice.correct")).toHaveCount(1, { timeout: 8_000 });
  }

  for (const page of everyone) {
    await expect(page.getByRole("heading", { name: "How Well Results" })).toBeVisible({
      timeout: 20_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem")).toHaveCount(3);
  }
  const rankings = ada.getByRole("complementary", { name: "Final Rankings" });
  for (const name of ["Ada", "Tolu", "Femi"]) await expect(rankings).toContainText(name);
});
