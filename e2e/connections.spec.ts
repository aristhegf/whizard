import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeSheet, openSettings, chooseSetting, expectSetting } from "./lobby";

test.describe.configure({ timeout: 120_000 });

interface Puzzle {
  id: string;
  groups: { name: string; words: string[] }[];
}

const PUZZLES: Puzzle[] = JSON.parse(
  readFileSync(
    new URL("../packages/content/src/connections/puzzles.json", import.meta.url),
    "utf8",
  ),
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

const tiles = (page: Page) => page.getByRole("group", { name: "Words" }).getByRole("button");

/** The puzzle on the board, found in the bank by its sixteen words. */
async function puzzleOn(page: Page): Promise<Puzzle> {
  await expect(tiles(page)).toHaveCount(16, { timeout: 10_000 });
  const words = new Set(await tiles(page).allInnerTexts());
  const puzzle = PUZZLES.find((p) => p.groups.every((g) => g.words.every((w) => words.has(w))));
  if (!puzzle) throw new Error(`No puzzle has these words: ${[...words].join(", ")}`);
  return puzzle;
}

/** Groups found and mistakes made, which change when a guess has been judged. */
const progress = (page: Page) =>
  page.evaluate(
    () =>
      `${document.querySelectorAll(".conn-group").length}/${document.querySelectorAll(".play-dot.used").length}`,
  );

/** Picks four words, submits them and waits for the verdict. A miss stays picked, so clear it. */
async function pick(page: Page, words: string[]) {
  const deselect = page.getByRole("button", { name: "Deselect All" });
  if (await deselect.isEnabled()) await deselect.click();
  for (const word of words) {
    await tiles(page)
      .filter({ hasText: new RegExp(`^${word}$`) })
      .click();
  }
  const before = await progress(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => progress(page)).not.toBe(before);
}

test("one player finds the four groups, with a miss and a near miss on the way", async ({
  page,
}) => {
  await page.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await page
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await page.getByRole("button", { name: "Play Connections" }).click();
  await joinAs(page, "Ada");
  await expect(page.getByRole("heading", { name: "Connections" })).toBeVisible();
  await openSettings(page);
  await chooseSetting(page, "Level", "easy");
  await expectSetting(page, "Level", "easy");
  await closeSheet(page);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");

  const puzzle = await puzzleOn(page);
  const [a, b, c, d] = puzzle.groups.map((g) => g.words);

  // One word from each group: a plain miss.
  await pick(page, [a![0]!, b![0]!, c![0]!, d![0]!]);
  await expect(page.getByRole("status").filter({ hasText: "Not quite." })).toBeVisible();
  await expect(page.getByLabel("3 mistakes left")).toBeVisible();

  // Three from a group and one stray: one away. The pick stays, so swap the stray out.
  await pick(page, [...a!.slice(0, 3), b![1]!]);
  await expect(page.getByRole("status").filter({ hasText: "One away…" })).toBeVisible();
  await expect(page.getByLabel("2 mistakes left")).toBeVisible();

  await tiles(page)
    .filter({ hasText: new RegExp(`^${b![1]}$`) })
    .click();
  await tiles(page)
    .filter({ hasText: new RegExp(`^${a![3]}$`) })
    .click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator(".conn-group", { hasText: puzzle.groups[0]!.name })).toBeVisible();
  await expect(tiles(page)).toHaveCount(12);

  for (const words of [b!, c!, d!]) await pick(page, words);

  await expect(page.getByRole("heading", { name: "Connections Results" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Solved in")).toBeVisible();
  await expect(page.getByText("2 mistakes")).toBeVisible();
  for (const group of puzzle.groups) {
    await expect(page.getByLabel("The answer").getByText(group.name)).toBeVisible();
  }
});

test("two players race: the solver wins, and running out of mistakes shows the answer", async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  await host.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await host
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await host.getByRole("button", { name: "Play Connections" }).click();
  await joinAs(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.getByRole("heading", { name: "Connections" })).toBeVisible();

  await host.getByRole("button", { name: /start game/i }).press("Enter");
  const puzzle = await puzzleOn(host);
  expect(await puzzleOn(guest)).toEqual(puzzle);
  const groups = puzzle.groups.map((g) => g.words);

  // The guest makes four different misses and sees how the words fit.
  for (let i = 0; i < 4; i++) {
    await pick(
      guest,
      groups.map((words) => words[i]!),
    );
    if (i < 3) await expect(guest.getByLabel(`${3 - i} mistakes left`)).toBeVisible();
  }
  await expect(guest.getByText("Out of mistakes. Here’s how they fit.")).toBeVisible();
  await expect(guest.locator(".conn-group.missed")).toHaveCount(4);

  for (const words of groups) await pick(host, words);

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Connections Results" })).toBeVisible({
      timeout: 10_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem").first()).toContainText("Ada");
    await expect(rankings.getByRole("listitem").nth(1)).toContainText("0/4");
  }
});
