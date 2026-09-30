import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeSheet, openGameCard, openSettings, chooseSetting, expectSetting } from "./lobby";

test.describe.configure({ timeout: 120_000 });

interface Word {
  hint: string;
  word: string;
  gaps: number[];
}

const WORDS: Word[] = JSON.parse(
  readFileSync(new URL("../packages/content/src/words/words.json", import.meta.url), "utf8"),
);

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Players" }).getByRole("listitem").filter({ hasText: nickname }),
  ).toBeVisible();
}

/** Opens a room for a game from its card on the Games page. */
async function openGame(page: Page, name: string, nickname = "Ada") {
  await page.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await page
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await page.getByRole("button", { name: `Play ${name}` }).click();
  await joinAs(page, nickname);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function waitForRound(page: Page, round: number, total: number) {
  await expect(page.locator(".play-count")).toContainText(`Round ${round} / ${total}`, {
    timeout: 10_000,
  });
}

/** Works out the word from the bank, as a player who knows it would. */
async function wordPuzzle(page: Page) {
  const hint = (await page.locator(".word-kind .pill").textContent())!.trim();
  const tiles = await page.locator(".word-tile").allTextContents();
  if (tiles.length > 0) {
    const letters = [...tiles].sort().join("");
    const entry = WORDS.find((w) => w.hint === hint && [...w.word].sort().join("") === letters)!;
    return { unscramble: true, entry, wrong: tiles.join("") };
  }
  const slots = await page.locator(".word-slot").allTextContents();
  const entry = WORDS.find(
    (w) =>
      w.hint === hint &&
      w.word.length === slots.length &&
      [...w.word].every((letter, i) => (w.gaps.includes(i) ? !slots[i] : slots[i] === letter)),
  )!;
  return { unscramble: false, entry, wrong: "Z".repeat(entry.gaps.length) };
}

async function solveWord(page: Page) {
  const { unscramble, entry } = await wordPuzzle(page);
  const answer = unscramble ? entry.word : entry.gaps.map((i) => entry.word[i]).join("");
  await page.locator("#word-guess").fill(answer);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByRole("status")).toContainText("Solved");
}

/** The one cell that isn't like the others. */
async function oddCell(page: Page): Promise<number> {
  return page.locator(".spot-grid").evaluate((grid) => {
    const keys = [...grid.querySelectorAll<HTMLElement>(".spot-cell")].map(
      (cell) =>
        cell.style.background ||
        cell.querySelector<HTMLElement>(".spot-arrow")?.style.transform ||
        cell.textContent ||
        "",
    );
    return keys.findIndex((key) => keys.filter((k) => k === key).length === 1);
  });
}

test("plays solo Word Rush: wrong words shake, right ones score", async ({ browser }) => {
  const page = await newPlayer(browser);
  await openGame(page, "Word Rush");
  await openSettings(page);
  await chooseSetting(page, "Rounds", "5");
  await expectSetting(page, "Rounds", "5");
  await closeSheet(page);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText("Get ready")).toBeVisible();

  await waitForRound(page, 1, 5);
  const { wrong } = await wordPuzzle(page);
  await page.locator("#word-guess").fill(wrong);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.locator(".word-tries")).toContainText("4 tries left");
  await expect(page.locator(".word-tries s")).toHaveText(/^[A-Z]+$/);
  await solveWord(page);

  for (let round = 2; round <= 5; round++) {
    await waitForRound(page, round, 5);
    await expect(page.getByRole("button", { name: "Check" })).toBeVisible();
    await solveWord(page);
  }

  await expect(page.getByText("Your score")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("5 of 5 solved")).toBeVisible();
  await expect(page.locator(".rounds-review li")).toHaveCount(5);
});

test("two players race through Spot It", async ({ browser }) => {
  const host = await newPlayer(browser);
  await openGame(host, "Spot It");
  await openSettings(host);
  await chooseSetting(host, "Rounds", "5");
  // Each change is sent with the settings the room last confirmed, so wait for this one.
  await expectSetting(host, "Rounds", "5");
  await chooseSetting(host, "Time per round", "30");
  await expectSetting(host, "Time per round", "30");
  await closeSheet(host);

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.getByRole("heading", { name: "Spot It" })).toBeVisible();
  await expect(guest.getByText("5 rounds, 30s each")).toBeVisible();

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  for (const page of [host, guest]) await waitForRound(page, 1, 5);

  // The guest skips every grid, without waiting for the host.
  for (let round = 1; round <= 5; round++) {
    await waitForRound(guest, round, 5);
    await guest.getByRole("button", { name: "Skip this grid" }).click();
    await expect(guest.getByRole("status")).toContainText("Skipped");
  }
  await expect(guest.getByText("Waiting for everyone to finish…")).toBeVisible({
    timeout: 10_000,
  });

  // A wrong tap costs a try; the right one solves it.
  const odd = await oddCell(host);
  await host
    .locator(".spot-cell")
    .nth(odd === 0 ? 1 : 0)
    .click();
  await expect(host.getByText("2 tries left")).toBeVisible();
  await host.locator(".spot-cell").nth(odd).click();
  await expect(host.getByRole("status")).toContainText("Solved");

  for (let round = 2; round <= 5; round++) {
    await waitForRound(host, round, 5);
    await host
      .locator(".spot-cell")
      .nth(await oddCell(host))
      .click();
    await expect(host.getByRole("status")).toContainText("Solved");
  }

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Final Rankings" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".board li").first()).toContainText("Ada");
  }
  await expect(host.getByRole("button", { name: "Play Again" })).toBeVisible();
});

test("the host can switch the room to another game", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/");
  await host.getByRole("button", { name: "Create", exact: true }).click();
  await joinAs(host, "Ada");

  // Only the host can change the game.
  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await openGameCard(guest);
  await expect(guest.getByRole("button", { name: "Change Game" })).toHaveCount(0);
  await closeSheet(guest);

  await openGameCard(host);
  await host.getByRole("button", { name: "Change Game" }).click();
  await host
    .getByRole("dialog", { name: "Choose a game" })
    .getByRole("radio", { name: "Word Rush" })
    .click();
  // Choosing a game goes on to its settings, to set it up there and then.
  const setup = host.getByRole("dialog", { name: "Game Settings" });
  await expectSetting(setup, "Time per round", "30");
  await setup.getByRole("button", { name: "Back" }).click();
  // The quiz asks for its topic on the way.
  await host
    .getByRole("dialog", { name: "Choose a game" })
    .getByRole("radio", { name: "Quiz" })
    .click();
  const topics = host.getByRole("dialog", { name: "Choose a topic" });
  await expect(topics.getByRole("radio", { name: "Bible" })).toBeVisible();
  await topics.getByRole("button", { name: "Back" }).click();
  await host
    .getByRole("dialog", { name: "Choose a game" })
    .getByRole("radio", { name: "Word Rush" })
    .click();
  await setup.getByRole("button", { name: "Done" }).click();
  await expect(setup).toBeHidden();
  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Word Rush" })).toBeVisible();
    await openSettings(page);
    await expectSetting(page, "Time per round", "30");
    await expectSetting(page, "Game Mode", "speed");
    await expectSetting(page, /^Level/, "auto");
    await closeSheet(page);
  }
  await expect(guest.getByText("Speed, Auto, 10 rounds, 30s each")).toBeVisible();
});

test("three players play Word Rush Elimination down to a winner", async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await newPlayer(browser);
  await openGame(host, "Word Rush");
  await openSettings(host);
  await chooseSetting(host, "Game Mode", "elimination");
  await expect(host.getByText(/Elimination needs at least 3 players/)).toBeVisible();
  await chooseSetting(host, /^Level/, "easy");
  await expectSetting(host, /^Level/, "easy");
  await chooseSetting(host, "Words per round", "5");
  await expectSetting(host, "Words per round", "5");
  await closeSheet(host);

  const tolu = await newPlayer(browser);
  const kemi = await newPlayer(browser);
  for (const [page, name] of [
    [tolu, "Tolu"],
    [kemi, "Kemi"],
  ] as const) {
    await page.goto(host.url());
    await joinAs(page, name);
  }
  await expect(kemi.getByText("Elimination, Easy, 5 words a round, 30s each")).toBeVisible();
  await host.getByRole("button", { name: /start game/i }).press("Enter");

  // Three players at five words a round: one knock-out round of five, then a final of five.
  for (let word = 1; word <= 5; word++) {
    for (const page of [host, tolu, kemi]) {
      await expect(page.locator(".elim-progress")).toContainText(
        `Round 1 of 1 · Word ${word} of 5`,
        { timeout: 10_000 },
      );
    }
    await solveWord(host);
    await expect(host.getByText(/Waiting for the others… 1 of 3 done/)).toBeVisible();
    await solveWord(tolu);
    await kemi.getByRole("button", { name: "Give up on this word" }).click();
    // Everyone is done, so the word shows straight away.
    for (const page of [host, tolu, kemi]) {
      await expect(page.locator(".word-slots.revealed")).toBeVisible();
    }
  }

  await expect(kemi.getByText(/You’re out!/)).toBeVisible({ timeout: 10_000 });
  await expect(host.getByText("You’re in the final!")).toBeVisible();
  await expect(host.getByRole("heading", { name: "The Final" })).toBeVisible({ timeout: 10_000 });

  for (let word = 1; word <= 5; word++) {
    await expect(host.locator(".elim-progress")).toContainText(`The Final · Word ${word} of 5`, {
      timeout: 10_000,
    });
    await expect(host.getByRole("button", { name: "Check" })).toBeVisible({ timeout: 10_000 });
    // Kemi watches the final.
    await expect(kemi.getByText(/You’re out \(round 1\)/)).toBeVisible();
    await solveWord(host);
    await tolu.getByRole("button", { name: "Give up on this word" }).click();
    await expect(host.locator(".word-slots.revealed")).toBeVisible();
  }

  await expect(host.getByRole("heading", { name: "You won!" })).toBeVisible({ timeout: 10_000 });
  await expect(tolu.getByRole("heading", { name: "Ada wins!" })).toBeVisible();
  await expect(host.getByRole("heading", { name: "Your rounds" })).toBeVisible();
  await expect(host.locator(".rounds-review li")).toHaveCount(10);
});
