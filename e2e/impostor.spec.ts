import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseSetting, closeSheet, openSettings } from "./lobby";

test.describe.configure({ timeout: 240_000 });

const NAMES = ["Ada", "Bola", "Chidi", "Dayo"];
const CLUES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];

async function newPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

async function joinAs(page: Page, nickname: string) {
  await page.getByLabel("Choose a nickname").fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

/** The host opens Impostor from the games page, sets it up, and three friends join. */
async function startRoom(browser: Browser, clues: "typed" | "spoken"): Promise<Page[]> {
  const host = await newPlayer(browser);
  await host.goto("/games");
  await host.getByRole("button", { name: "Play Impostor" }).click();
  await joinAs(host, NAMES[0]!);
  await openSettings(host);
  await chooseSetting(host, "Clues", clues);
  await chooseSetting(host, "Rounds", "3");
  await chooseSetting(host, "Clue time", "15");
  await chooseSetting(host, "Vote time", "20");
  await closeSheet(host);
  await expect(host.locator(".summary")).toContainText(
    `${clues === "typed" ? "Typed clues" : "Clues out loud"}, Mixed words, 3 rounds`,
  );

  const pages = [host];
  for (const name of NAMES.slice(1)) {
    const page = await newPlayer(browser);
    await page.goto(host.url());
    await joinAs(page, name);
    await expect(page.locator(".lobby")).toBeVisible();
    pages.push(page);
  }
  await expect(host.locator(".lobby")).toContainText("Dayo");
  await host.getByRole("button", { name: /start game/i }).press("Enter");
  return pages;
}

/**
 * The role cards: exactly one player is the impostor and sees no word; everyone else sees the
 * same word. Returns who the impostor is and the word.
 */
async function readRoles(pages: Page[]): Promise<{ impostor: number; word: string }> {
  for (const page of pages)
    await expect(page.locator(".imp-card")).toBeVisible({ timeout: 20_000 });
  const impostors: number[] = [];
  const words = new Set<string>();
  for (const [i, page] of pages.entries()) {
    if (await page.locator(".imp-card.impostor").isVisible()) {
      impostors.push(i);
      await expect(page.locator(".imp-card")).toContainText("You’re the impostor");
      await expect(page.locator(".imp-card-title.word")).toHaveCount(0);
    } else {
      await expect(page.locator(".imp-card")).toContainText("One of you doesn’t have this word.");
      words.add((await page.locator(".imp-card-title.word").textContent())!.trim());
    }
  }
  expect(impostors).toHaveLength(1);
  expect(words.size).toBe(1);
  const [word] = words;
  // The impostor's screen never holds the word.
  expect(await pages[impostors[0]!]!.content()).not.toContain(`>${word}<`);
  return { impostor: impostors[0]!, word: word! };
}

/** Whose turn it is: the page showing its clue box (or Done, spoken). */
async function whoseTurn(pages: Page[], control: string): Promise<number> {
  let turn = -1;
  await expect
    .poll(
      async () => {
        for (const [i, page] of pages.entries()) {
          if (await page.locator(control).isVisible()) turn = i;
        }
        return turn;
      },
      { timeout: 25_000 },
    )
    .toBeGreaterThanOrEqual(0);
  return turn;
}

/** One typed round, the vote catching the impostor, who picks the word on their last chance. */
async function playTypedRound(pages: Page[], round: number, checkRejection: boolean) {
  const { impostor, word } = await readRoles(pages);
  const impostorName = NAMES[impostor]!;

  let rejected = !checkRejection;
  for (let turn = 0; turn < pages.length; turn++) {
    const at = await whoseTurn(pages, "#imp-clue");
    const page = pages[at]!;
    await expect(page.locator(".imp-row.now")).toContainText("Your turn");
    if (!rejected && at !== impostor) {
      // Saying the word itself is turned down, and the bottom line says why.
      await page.locator("#imp-clue").fill(word.split(" ")[0]!);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.locator(".play-toast")).toContainText("gives the word away");
      await expect(page.locator("#imp-clue")).toBeVisible();
      rejected = true;
    }
    const clue = CLUES[(round * pages.length + turn) % CLUES.length]!;
    await page.locator("#imp-clue").fill(clue);
    await page.getByRole("button", { name: "Send" }).click();
    // Everyone sees it arrive: on that player's row, or after the last clue on their vote tile.
    for (const other of pages) {
      const shown =
        turn < pages.length - 1
          ? other.locator(".imp-clue", { hasText: clue })
          : other.locator(other === page ? ".imp-ask" : ".imp-pick-clue", {
              hasText: other === page ? "Who’s the impostor?" : clue,
            });
      await expect(shown).toBeVisible();
    }
  }

  for (const page of pages) {
    await expect(page.getByRole("heading", { name: "Who’s the impostor?" })).toBeVisible();
  }
  // You can't vote for yourself: your own tile isn't there.
  await expect(pages[0]!.getByRole("group", { name: "Vote" }).getByRole("button")).toHaveCount(3);
  for (const [i, page] of pages.entries()) {
    const suspect = i === impostor ? NAMES[(impostor + 1) % NAMES.length]! : impostorName;
    const tile = page.getByRole("group", { name: "Vote" }).getByRole("button", { name: suspect });
    await tile.click();
    // The last vote closes it at once; until then your pick shows, and who has voted.
    if (i < pages.length - 1) {
      await expect(tile).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("list", { name: `${i + 1} of 4 have voted` })).toBeVisible();
    }
  }

  // Caught: the last chance, the word among eight.
  const caught = pages[impostor]!;
  await expect(
    caught.getByRole("heading", { name: "Last chance: what’s the word?" }),
  ).toBeVisible();
  await expect(caught.locator(".imp-option")).toHaveCount(8);
  for (const [i, page] of pages.entries()) {
    if (i !== impostor) {
      await expect(
        page.getByRole("heading", { name: `${impostorName} is guessing the word` }),
      ).toBeVisible();
    }
  }
  await caught.locator(".imp-option", { hasText: new RegExp(`^${word}$`) }).click();

  for (const [i, page] of pages.entries()) {
    const title = i === impostor ? "You were the impostor" : `${impostorName} was the impostor`;
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator(".imp-reveal-line")).toContainText(`The word was ${word}.`);
    await expect(page.locator(".imp-reveal-line")).toContainText("guessed it.");
    await expect(page.locator(".imp-tally-row.impostor .imp-count")).toHaveText("3");
    await expect(page.locator(".imp-points")).toContainText(
      i === impostor ? "You guessed the word+750" : "You caught them+1,000",
    );
  }
}

test("four players: one impostor, typed clues, the vote, the last chance and the reveal", async ({
  browser,
}) => {
  const pages = await startRoom(browser, "typed");
  for (let round = 0; round < 3; round++) {
    for (const page of pages) {
      await expect(page.locator(".play-count")).toContainText(`Round ${round + 1} of 3`, {
        timeout: 20_000,
      });
    }
    await playTypedRound(pages, round, round === 0);
  }

  for (const page of pages) {
    await expect(page.getByRole("heading", { name: "Impostor Results" })).toBeVisible({
      timeout: 20_000,
    });
    const rankings = page.getByRole("complementary", { name: "Final Rankings" });
    await expect(rankings.getByRole("listitem")).toHaveCount(4);
  }
});

test("clues out loud: the turn just shows whose it is, with Done", async ({ browser }) => {
  const pages = await startRoom(browser, "spoken");
  const { impostor } = await readRoles(pages);

  // The word hides behind the label's chip, for anyone looking over your shoulder.
  const crew = pages[(impostor + 1) % pages.length]!;
  for (let turn = 0; turn < pages.length; turn++) {
    const at = await whoseTurn(pages, ".imp-bottom button:text-is('Done')");
    const page = pages[at]!;
    await expect(page.locator("#imp-clue")).toHaveCount(0);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // The rows mark who has said theirs, until the last one opens the vote.
    if (turn < pages.length - 1) {
      await expect(crew.locator(".imp-clue", { hasText: "said it" })).toHaveCount(turn + 1);
    }
  }
  await expect(crew.getByRole("heading", { name: "Who’s the impostor?" })).toBeVisible();
  await crew.getByRole("button", { name: "Hide your word" }).click();
  await expect(crew.getByRole("button", { name: "Show your word" })).toBeVisible();
});
