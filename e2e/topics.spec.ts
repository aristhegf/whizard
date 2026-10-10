import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { openGameCard } from "./lobby";
import { signUp, uniqueUsername, withPasskeys } from "./passkeys";

// Every test here makes an account, an admin and topics through the form, so they get a
// wide budget: on a loaded machine the full loop (create, file, play, rename, delete)
// needs over 110s alone, and a 180s ceiling was already cutting it close in parallel runs.
test.describe.configure({ timeout: 240_000 });

/** Every topic this file makes carries the run's own fingerprint, in its name and so its id. */
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const SHIPPED: string[] = [
  "bible",
  "quran",
  "geography",
  "history",
  "science",
  "animals",
  "football",
  "movies",
  "music",
  "nigerian-culture",
  "general-knowledge",
  "pop-culture",
];

const ADDED_NOTE = "Added. It’s in the question editor’s topic list already.";
const SAVED_NOTE = "Saved.";
const PICTURE_NOTE = "Picture replaced. The colours below came from it — save to use them.";
const NOT_A_PICTURE = "That file isn’t a picture we can use.";
const NOT_WEBP = "That isn’t a WebP image we can use.";
const WRONG_SIZE = "Images must be between 32 and 2048 pixels on each side.";
const HAS_QUESTIONS = "That topic has questions — delete them first.";

interface PublicCatalogue {
  categories: {
    id: string;
    name: string;
    tagline: string;
    questions: { easy: number; medium: number; hard: number };
  }[];
}

interface AdminCatalogue {
  topics: { id: string; name: string; tagline: string; off: boolean; questionCount: number }[];
}

function grantAdmin(username: string) {
  // Several tests grant at once when the suite runs side by side, and two wrangler calls
  // against the one local database can collide before its own busy-retry even starts.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("node", ["scripts/set-admin.mjs", username, "grant"], {
        cwd: "apps/server",
        env: { ...process.env, STATS_LOCAL: "1" },
        stdio: "ignore",
      });
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
  }
}

async function signedUp(browser: Browser): Promise<{ page: Page; username: string }> {
  const page = await (await browser.newContext()).newPage();
  await withPasskeys(page);
  const username = uniqueUsername();
  await signUp(page, username);
  return { page, username };
}

async function get<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(path)).json()) as T;
}

const rowFor = (page: Page, id: string) =>
  page.locator(".topic-row").filter({ has: page.locator(`code:text-is("${id}")`) });

const tileFor = (page: Page, name: string) =>
  page.locator(".topic-tile").filter({ has: page.locator(`.topic-name:text-is("${name}")`) });

async function gotoBrowse(page: Page) {
  await page.goto("/games/quiz");
  await expect(page.getByRole("heading", { name: "Browse Quiz Topics" })).toBeVisible();
}

/** Creates a topic through the form; the server's id comes back from the edit form it lands on. */
async function createTopic(page: Page, name: string, tagline: string): Promise<string> {
  await page.goto("/admin/topics");
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Tagline/).fill(tagline);
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.locator(".form-saved")).toHaveText(ADDED_NOTE);
  const id = await page.getByLabel(/^Id/).inputValue();
  expect(id).toBe(name);
  await expect(rowFor(page, id)).toHaveCount(1);
  return id;
}

/** Files one custom question against a topic: the id it was given, and its own prompt. */
async function fileQuestion(page: Page, id: string): Promise<{ qid: string; prompt: string }> {
  await page.goto("/admin/content/new");
  await expect(page.locator(`option[value="${id}"]`)).toBeAttached();
  await page.getByLabel(/^Topic/).selectOption(id);
  await page.getByLabel(/^Level/).selectOption("easy");
  await page.getByLabel(/^Sub-topic/).fill("Testing");
  const word = `W${Math.random().toString(36).slice(2, 9)}`;
  // The prompt carries the word's length and a marker of its own, never the word: a question
  // that contains its own answer is refused ("The answer gives itself away in the question."),
  // and identical prompts are refused across topics ("Another topic already asks this").
  const prompt = `Which option is the test word ${word.length}, marker ${Math.random().toString(36).slice(2, 8)}?`;
  await page.getByLabel(/^Question/).fill(prompt);
  await page.getByLabel(/^Correct answer/).fill(word);
  await page.getByLabel(/^Wrong answer 1/).fill(`${word}a`);
  await page.getByLabel(/^Wrong answer 2/).fill(`${word}b`);
  await page.getByLabel(/^Wrong answer 3/).fill(`${word}c`);
  await page.getByLabel(/^Explanation/).fill("It was written for the topic catalogue test.");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/content/${id}-\\d+$`));
  await expect(page.locator(".status-pill", { hasText: "Added" })).toBeVisible();
  return { qid: page.url().split("/").pop()!, prompt };
}

async function deleteQuestion(page: Page, qid: string) {
  await page.goto(`/admin/content/${qid}`);
  await page.getByRole("button", { name: "Delete question" }).click();
  await expect(page).toHaveURL(/\/admin\/content$/);
}

async function deleteTopicRow(page: Page, id: string) {
  const row = rowFor(page, id);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row).toHaveCount(0);
}

async function joinAs(page: Page, nickname: string) {
  const field = page.getByLabel("Choose a nickname");
  try {
    await expect(field).toBeVisible({ timeout: 10_000 });
  } catch {
    // A signed-in player is put straight into the room, with no join screen to fill in.
    await expect(page.getByRole("list", { name: "Players" })).toBeVisible();
    return;
  }
  await field.fill(nickname);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByRole("list", { name: "Players" })).toBeVisible();
}

async function openRoom(page: Page) {
  await page.goto("/");
  // Guests get the welcome page's own "Create a Room"; a signed-in page (the admin account)
  // gets the bar's plain "Create" instead.
  const hero = page.getByRole("button", { name: /Create a Room/ });
  const nav = page.getByRole("button", { name: "Create", exact: true });
  await expect(hero.or(nav)).toBeVisible();
  await ((await hero.isVisible()) ? hero : nav).click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 15_000 });
  await joinAs(page, "Ada");
}

test("every shipped topic is in both catalogues, with counts only on the admin side", async ({
  browser,
}) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;

  // Another test can turn a topic off for a moment, so a topic counts as covered when the
  // public catalogue has it or the admin list shows it switched off.
  await expect
    .poll(async () => {
      const publicCatalogue = await get<PublicCatalogue>(page, "/api/quiz/categories");
      const adminCatalogue = await get<AdminCatalogue>(page, "/api/admin/topics");
      const have = new Set([
        ...publicCatalogue.categories.map((topic) => topic.id),
        ...adminCatalogue.topics.filter((topic) => topic.off).map((topic) => topic.id),
      ]);
      return SHIPPED.filter((id) => !have.has(id));
    })
    .toEqual([]);

  const adminCatalogue = await get<AdminCatalogue>(page, "/api/admin/topics");
  const seeded = adminCatalogue.topics.filter((topic) => SHIPPED.includes(topic.id));
  expect(seeded.map((topic) => topic.id).sort()).toEqual([...SHIPPED].sort());

  await page.goto("/admin/topics");
  await expect(page.getByRole("heading", { name: "Quiz Topics" })).toBeVisible();
  for (const topic of seeded) {
    const row = rowFor(page, topic.id);
    await expect(row).toHaveCount(1);
    await expect(row.locator("strong")).toHaveText(topic.name);
    await expect(row.locator(".name-text > span").first()).toContainText(
      /· (No questions|\d[\d,]* questions?)$/,
    );
  }
  await expect(rowFor(page, "bible").locator(".name-text > span").first()).toContainText(
    /· \d[\d,]* questions$/,
  );

  const publicCatalogue = await get<PublicCatalogue>(page, "/api/quiz/categories");
  const published = publicCatalogue.categories.filter((topic) => SHIPPED.includes(topic.id));
  expect(published.length).toBeGreaterThanOrEqual(11);

  await gotoBrowse(page);
  // Spec §16.11: the chips row and its Popular filter are gone — search is the only filter.
  await expect(page.locator(".topics-page .chip")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Topics" })).toHaveCount(0);
  for (const id of SHIPPED) {
    const inPublic = published.some((topic) => topic.id === id);
    if (!inPublic) {
      expect(adminCatalogue.topics.find((topic) => topic.id === id)?.off).toBe(true);
      continue;
    }
    const topic = published.find((candidate) => candidate.id === id)!;
    const tile = tileFor(page, topic.name);
    await expect(tile).toHaveCount(1);
    await expect(tile.locator(".topic-tagline")).toHaveText(topic.tagline);
    await expect(tile.locator(".topic-art img")).toHaveAttribute("src", /\S/);
    const playable = topic.questions.easy + topic.questions.medium + topic.questions.hard;
    if (playable === 0) {
      await expect(tile).toBeDisabled();
      await expect(tile.locator(".topic-count")).toHaveText("Coming soon");
    } else {
      await expect(tile).toBeEnabled();
      await expect(tile.locator(".topic-count")).toHaveCount(0);
    }
  }
  // A count never reaches the public grid: the badge is the only thing under a tile's name.
  const badges = await page.locator(".topic-count").allInnerTexts();
  expect(badges.every((text) => text.trim() === "Coming soon")).toBe(true);
  await expect(page.getByText(/\d[\d,]* questions/)).toHaveCount(0);
});

test("a topic can be added, played, renamed, played again and removed", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const first = `mars-${RUN}`;
  const firstTagline = "Rocks and craters only";
  const renamed = `red-${RUN}`;

  const id = await createTopic(page, first, firstTagline);

  // With no questions yet it's a coming-soon tile on the public grid.
  await gotoBrowse(page);
  await page.getByPlaceholder("Search topics…").fill(first);
  const empty = tileFor(page, first);
  await expect(empty).toBeDisabled();
  await expect(empty.locator(".topic-count")).toHaveText("Coming soon");
  await expect(empty.locator(".topic-tagline")).toHaveText(firstTagline);

  const question = await fileQuestion(page, id);

  // One question in, the tile can start a game and the badge is gone.
  await gotoBrowse(page);
  await page.getByPlaceholder("Search topics…").fill(first);
  const playable = tileFor(page, first);
  await expect(playable).toBeEnabled();
  await expect(playable.locator(".topic-count")).toHaveCount(0);

  // The topic can be picked in the lobby and played: the question it holds comes up.
  await openRoom(page);
  await openGameCard(page);
  await page.getByRole("button", { name: "Change topic" }).click();
  const picker = page.getByRole("dialog", { name: "Choose a topic" });
  await picker.getByRole("radio", { name: first, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Game Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("dialog.sheet")).toHaveCount(0);
  await expect(page.locator(".game-summary")).toContainText(first);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(page.locator(".progress")).toContainText("1 of 1", { timeout: 15_000 });
  await expect(page.locator(".prompt")).toHaveText(question.prompt, { timeout: 15_000 });
  await expect(page.locator(".quiz-topic")).toContainText(first);

  // Renaming changes the name everywhere; the id the questions hang off never moves.
  await page.goto("/admin/topics");
  const row = rowFor(page, id);
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel(/^Name/).fill(renamed);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".form-saved")).toHaveText(SAVED_NOTE);
  await expect(row.locator("strong")).toHaveText(renamed);
  await expect(row.locator("code")).toHaveText(id);
  await expect(row.locator(".name-text > span").nth(1)).toHaveText(firstTagline);

  // Starting from the renamed tile plays the same held question under the new name.
  await gotoBrowse(page);
  await page.getByPlaceholder("Search topics…").fill(renamed);
  const renamedTile = tileFor(page, renamed);
  await expect(renamedTile).toBeEnabled();
  await expect(renamedTile.locator(".topic-name")).toHaveText(renamed);
  await renamedTile.click();
  await expect(page).toHaveURL(/\/r\/[A-Z0-9]{6}$/, { timeout: 15_000 });
  await joinAs(page, "Ada");
  await expect(page.locator(".game-summary")).toContainText(renamed);
  await page.getByRole("button", { name: /play solo/i }).press("Enter");
  await expect(page.getByText("Get ready")).toBeVisible();
  await expect(page.locator(".prompt")).toHaveText(question.prompt, { timeout: 15_000 });
  await expect(page.locator(".quiz-topic")).toContainText(renamed);

  // Out again: the question first, then the topic itself, and the grid forgets it.
  await deleteQuestion(page, question.qid);
  await page.goto("/admin/topics");
  await deleteTopicRow(page, id);
  await gotoBrowse(page);
  await page.getByPlaceholder("Search topics…").fill(renamed);
  await expect(tileFor(page, renamed)).toHaveCount(0);
});

test("an empty topic deletes, a topic with questions refuses", async ({ browser }) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const empty = `venus-${RUN}`;
  const guarded = `europa-${RUN}`;

  const emptyId = await createTopic(page, empty, "Never keeps a question");
  await deleteTopicRow(page, emptyId);

  const guardedId = await createTopic(page, guarded, "Gains a question mid-delete");
  // The second page files the question while the first still holds the list it opened.
  const other = await page.context().newPage();
  const { qid } = await fileQuestion(other, guardedId);

  const stale = rowFor(page, guardedId);
  await stale.getByRole("button", { name: "Delete", exact: true }).click();
  await stale.getByRole("button", { name: "Yes, delete" }).click();
  await expect(stale.locator("p.user-error")).toHaveText(HAS_QUESTIONS);
  await expect(stale).toHaveCount(1);
  await expect(stale.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();

  // A list that has seen the question says so instead of offering a delete at all.
  await page.reload();
  const fresh = rowFor(page, guardedId);
  await expect(fresh.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await expect(fresh.locator(".status-pill")).toHaveText("Has questions");

  await deleteQuestion(page, qid);
  await page.goto("/admin/topics");
  await deleteTopicRow(page, guardedId);
});

test("a topic with no questions shows as coming soon, and counts live in the admin list", async ({
  browser,
}) => {
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const soon = `ganymede-${RUN}`;
  const soonTagline = "Not one question yet";

  const id = await createTopic(page, soon, soonTagline);

  await gotoBrowse(page);
  await page.getByPlaceholder("Search topics…").fill(soon);
  const tile = tileFor(page, soon);
  await expect(tile).toBeDisabled();
  await expect(tile.locator(".topic-count")).toHaveText("Coming soon");
  await expect(tile.locator(".topic-name")).toHaveText(soon);
  await expect(tile.locator(".topic-tagline")).toHaveText(soonTagline);
  // The search really filters: only the match stays on the grid.
  await expect(page.locator(".topic-tile")).toHaveCount(1);

  // A shipped topic with a bank behind it starts right away, with no badge at all.
  await page.getByPlaceholder("Search topics…").fill("Bible");
  const bible = tileFor(page, "Bible");
  await expect(bible).toBeEnabled();
  await expect(bible.locator(".topic-count")).toHaveCount(0);

  // Clearing the search brings the whole grid back (shipped minus none + this one).
  await page.getByPlaceholder("Search topics…").fill("");
  await expect.poll(() => page.locator(".topic-tile").count()).toBeGreaterThanOrEqual(12);

  // The list panel's own subtitle and its rows come from the same read of the catalogue.
  await page.goto("/admin/topics");
  const list = page.locator("section", { has: page.locator("#topics-list-title") });
  const snapshot = await list.evaluate((section) => ({
    subtitle: section.querySelector(".admin-panel-head p")?.textContent ?? "",
    rows: section.querySelectorAll(".topic-row").length,
  }));
  const match = snapshot.subtitle.match(/^([\d,]+) topics, the ones turned off included\.$/);
  const total = Number(match?.[1]?.replace(/,/g, ""));
  expect(Number.isNaN(total)).toBe(false);
  expect(total).toBeGreaterThanOrEqual(12);
  expect(snapshot.rows).toBe(total);

  await expect(rowFor(page, id).locator(".name-text > span").first()).toContainText("No questions");
  await expect(rowFor(page, "bible").locator(".name-text > span").first()).toContainText(
    /· \d[\d,]* questions$/,
  );

  // Spec §16.10's other half: a CSV import row naming the new topic lands a question,
  // and the next load enables its tile.
  const marker = `csv${Math.random().toString(36).slice(2, 8)}`;
  const csv = [
    "id,category,topic,difficulty,prompt,choice_1,choice_2,choice_3,choice_4,explanation,reference",
    `${soon}j,${soon},Testing,easy,"Which marker did the CSV carry, ${marker}?","${marker}a","${marker}b","${marker}c","${marker}d",It came in from a CSV.,`,
  ].join("\r\n");
  await page.goto("/admin/content");
  await page.locator('input[type="file"]').setInputFiles({
    name: "questions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("Imported 1 question from questions.csv.")).toBeVisible();

  await gotoBrowse(page);
  await page.getByPlaceholder("Search topics…").fill(soon);
  await expect(tile).toBeEnabled();
  await expect(tile.locator(".topic-count")).toHaveCount(0);

  // Cleanup: the imported question first, then the topic itself.
  await page.goto("/admin/content");
  await page.getByLabel("Search questions").fill(`carry, ${marker}`);
  await expect(page.locator(".content-row")).toHaveCount(1);
  await page.locator(".content-row").first().click();
  await expect(page.locator(".status-pill", { hasText: "Added" })).toBeVisible();
  await page.getByRole("button", { name: "Delete question" }).click();
  await expect(page).toHaveURL(/\/admin\/content$/);

  await page.goto("/admin/topics");
  await deleteTopicRow(page, id);
});

test("a topic's picture goes in through the form and the server's gates hold", async ({
  browser,
}) => {
  // The heaviest test here: an account, an admin, three picture rounds and a server probe.
  // Like jigsaw's slowest, it gets the longer budget a long run's last tests need.
  test.setTimeout(300_000);
  const admin = await signedUp(browser);
  grantAdmin(admin.username);
  const page = admin.page;
  const photo = readFileSync(new URL("./fixtures/photo.jpg", import.meta.url));
  const id = await createTopic(page, `io-${RUN}`, "Waiting for its picture");

  const row = rowFor(page, id);
  const file = row.locator('input[type="file"]');

  // The form crops the photo to a square WebP and the server takes it, colours and all.
  await file.setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator(".form-saved")).toHaveText(PICTURE_NOTE);
  const artPath = `/api/topics/${id}/art?v=1`;
  await expect(row.locator("img")).toHaveAttribute("src", artPath);
  const stored = await page.request.get(`/api/topics/${id}/art?v=1`);
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"] ?? "").toContain("image/webp");

  // A picture too small for the size gate comes back as the server's own words, inline.
  const tiny = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#c0ffee";
      context.fillRect(0, 0, 16, 16);
    }
    return canvas.toDataURL("image/png");
  });
  await file.setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: Buffer.from(tiny.slice(tiny.indexOf(",") + 1), "base64"),
  });
  await expect(row.locator("p.user-error")).toHaveText(WRONG_SIZE);
  await expect(row.locator("img")).toHaveAttribute("src", artPath);

  // The browser can't decode a broken picture, so it never reaches the server; the form says so.
  const broken = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0not a picture"),
  ]);
  await file.setInputFiles({ name: "broken.jpg", mimeType: "image/jpeg", buffer: broken });
  await expect(row.locator("p.user-error")).toHaveText(NOT_A_PICTURE);
  await expect(row.locator("img")).toHaveAttribute("src", artPath);

  // The signature gate itself, straight at the endpoint with the page's own origin: refused,
  // and the picture that was already stored stays exactly as it was.
  const origin = new URL(page.url()).origin;
  const refused = await page.request.put(`/api/admin/topics/${id}/art`, {
    headers: { Origin: origin, "Content-Type": "image/webp" },
    data: photo,
  });
  expect(refused.status()).toBe(415);
  const body = (await refused.json()) as { error: { message: string } };
  expect(body.error.message).toBe(NOT_WEBP);
  await page.reload();
  await expect(rowFor(page, id).locator("img")).toHaveAttribute("src", artPath);

  await deleteTopicRow(page, id);
});
