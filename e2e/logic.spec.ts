import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeSheet, openSettings, chooseSetting, expectSetting } from "./lobby";

test.describe.configure({ timeout: 120_000 });

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

const SHAPES: Record<number, [number, number]> = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };

/** Solves a grid the way a player would have to: every row, column and box once. */
function solve(grid: number[], size: number): number[] {
  const [boxRows, boxCols] = SHAPES[size]!;
  const cells = [...grid];
  const fits = (cell: number, n: number) => {
    const row = Math.floor(cell / size);
    const col = cell % size;
    const top = row - (row % boxRows);
    const left = col - (col % boxCols);
    for (let i = 0; i < size; i++) {
      if (cells[row * size + i] === n || cells[i * size + col] === n) return false;
    }
    for (let r = top; r < top + boxRows; r++) {
      for (let c = left; c < left + boxCols; c++) if (cells[r * size + c] === n) return false;
    }
    return true;
  };
  const search = (): boolean => {
    const cell = cells.indexOf(0);
    if (cell === -1) return true;
    for (let n = 1; n <= size; n++) {
      if (!fits(cell, n)) continue;
      cells[cell] = n;
      if (search()) return true;
      cells[cell] = 0;
    }
    return false;
  };
  if (!search()) throw new Error("No solution");
  return cells;
}

const grid = (page: Page) => page.getByRole("grid");

/** The grid as shown: each cell's number, or 0. */
async function readGrid(page: Page): Promise<number[]> {
  const labels = await grid(page)
    .getByRole("gridcell")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return labels.map((label) => Number(/, (\d)$/.exec(label)?.[1] ?? 0));
}

async function place(page: Page, cell: number, value: number) {
  await grid(page).locator(`[data-cell="${cell}"]`).click();
  await page
    .getByRole("group", { name: "Numbers" })
    .getByRole("button", { name: String(value) })
    .click();
}

async function start(page: Page, size: "4" | "6" | "9", button: RegExp) {
  await openSettings(page);
  await chooseSetting(page, "Grid", size);
  await expectSetting(page, "Grid", size);
  await closeSheet(page);
  await page.getByRole("button", { name: button }).press("Enter");
  await expect(grid(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("group", { name: "Numbers" })).toBeVisible({ timeout: 10_000 });
}

test("one player cracks a grid, with a wrong number on the way", async ({ page }) => {
  await page.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await page
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await page.getByRole("button", { name: "Play Logic" }).click();
  await joinAs(page, "Ada");
  await expect(page.getByRole("heading", { name: "Logic" })).toBeVisible();
  await start(page, "4", /play solo/i);

  const clues = await readGrid(page);
  const answer = solve(clues, 4);
  const empty = clues.flatMap((n, cell) => (n === 0 ? [cell] : []));

  // A wrong number flashes, costs a mistake and leaves the cell empty.
  const first = empty[0]!;
  await place(page, first, (answer[first]! % 4) + 1);
  await expect(page.getByLabel("2 mistakes left")).toBeVisible();
  await expect(grid(page).locator(`[data-cell="${first}"]`)).toHaveClass(/wrong/);

  for (const cell of empty.slice(0, -1)) {
    await place(page, cell, answer[cell]!);
    await expect(grid(page).locator(`[data-cell="${cell}"]`)).toHaveText(String(answer[cell]));
  }
  // The last number solves it, and the results take over from the grid.
  const last = empty.at(-1)!;
  await place(page, last, answer[last]!);

  await expect(page.getByRole("heading", { name: "Logic Results" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Solved in")).toBeVisible();
  await expect(page.getByText("1 mistake", { exact: true })).toBeVisible();
});

test("two players race on the same grid, and the faster one wins", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto("/games");
  // On phones the games are in a sheet, opened from the kinds of game.
  await host
    .getByRole("group", { name: "Kinds of game" })
    .getByRole("button", { name: "All" })
    .click();
  await host.getByRole("button", { name: "Play Logic" }).click();
  await joinAs(host, "Ada");

  const guest = await newPlayer(browser);
  await guest.goto(host.url());
  await joinAs(guest, "Tolu");
  await expect(guest.getByRole("heading", { name: "Logic" })).toBeVisible();

  await start(host, "4", /start game/i);
  await expect(grid(guest)).toBeVisible({ timeout: 10_000 });
  const clues = await readGrid(host);
  expect(await readGrid(guest)).toEqual(clues);
  const answer = solve(clues, 4);

  // The guest fills one cell, then runs out of mistakes on the next.
  const empty = clues.flatMap((n, cell) => (n === 0 ? [cell] : []));
  await place(guest, empty[0]!, answer[empty[0]!]!);
  const next = empty[1]!;
  for (const value of [1, 2, 3, 4].filter((n) => n !== answer[next])) {
    await place(guest, next, value);
  }
  await expect(guest.getByText("Out of mistakes. Here’s the full grid.")).toBeVisible();

  for (const cell of empty) await place(host, cell, answer[cell]!);

  for (const page of [host, guest]) {
    await expect(page.getByRole("heading", { name: "Logic Results" })).toBeVisible({
      timeout: 10_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem").first()).toContainText("Ada");
    await expect(rankings.getByRole("listitem").nth(1)).toContainText(`1/${empty.length}`);
  }
});
