# Topic Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make quiz topics admin-editable rows in D1 (create, rename, tagline, colours, artwork, delete-when-empty) with every topic ID validated against the live catalogue, and a browse grid driven by it.

**Architecture:** One migration seeds a `topics` table that becomes the sole source of truth; a new server module (`topics.ts`) caches it for 15 s with an all-or-nothing shipped fallback; public and admin endpoints expose it; the client keeps a live-catalogue lookup layered over the shipped 12-topic constant. Artwork is a D1 BLOB served at `/api/topics/:id/art?v=N`.

**Tech Stack:** TypeScript, React + Vite, Cloudflare Workers + D1, zod, vitest (unit), Playwright (e2e, mobile-chrome).

**Spec:** `docs/superpowers/specs/2026-10-08-topic-catalogue-design.md` — the plan argues from the spec; executors read both. All line references are against `main` @ `9967ee6`.

## Global Constraints

- `topics.id` is an immutable slug; renaming changes only `name`. Every reference (questions, stats, settings, imports) uses the id (spec §1).
- Slug: server-generated from the name — lowercase `a-z0-9`/hyphens, starts alphanumeric, ≤ 40 chars; collisions resolve `biology`, `biology-2`, `biology-3` (spec §4, §5).
- D1 is authoritative; the shipped 12-topic constant is used **only** when D1 errors **or** yields zero valid rows — complete fallback, never merged with D1 rows (spec §3.1).
- `forgetTopics()` runs before any topic mutation's response returns (spec §3.3).
- No `status`/`is_active` column — `topics_off` is the only availability switch (spec §2).
- Artwork: D1 BLOB only (no R2); WebP by byte signature; ≤ 400 KB; dimensions 32–2048 — validated on the server regardless of browser preprocessing (spec §8).
- `GET /api/quiz/categories`: `Cache-Control: no-store`, rows ordered by `sort_order`, off topics excluded, `questions` = playable counts only (spec §7). Admin endpoints respond `no-store`.
- Public response fields per topic: `id, name, tagline, colors, art, questions`. Art resolution: `hasArt → /api/topics/:id/art?v=<artVersion>` → shipped static path → `/art/games/quiz.webp` (spec §8).
- Seed exactly the 12 rows of spec §4 (id, name, tagline, colours, `sort_order` 1–12, `art` NULL).
- Delete on non-empty topic: `409` with message `That topic has questions — delete them first.`; never cascade; strip id from `topics_off`; reset `quiz_defaults.category` if it pointed at the id (spec §7).
- New topic defaults: `colors` `["#6d5bff","#1a1747"]`, generic art `/art/games/quiz.webp` (spec §17.4).
- Configure/start unknown-topic message: `That topic isn't available. Pick another.` (spec §17.7).
- Commands that must pass before any task is done: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (CI runs these — `.github/workflows/ci.yml`), plus `pnpm exec playwright test` from Task 10 on.
- Commit messages: one-line sentences matching `git log` style (e.g. "Serve the live topic catalogue and topic artwork"). Commit at each task's end.

## Review Focus

1. **Parallel e2e runs racing picker counts.** `e2e/quiz.spec.ts:100-101` asserts exactly 12 radios and 0 disabled; this plan's topic-creating tests can overlap them. Expected: seeded topics always present and enabled regardless of extras. → Test: Task 10 rewrites those two assertions to seeded-based (`≥ 11` total, "Nigerian culture" enabled).
2. **Malformed rows in `topics`** (bad `colors` JSON) must neither crash nor summon the fallback while good rows exist. Expected: invalid rows are skipped; fallback only when zero valid rows remain. → Tests: Task 2 "never merges" / "falls back when … every row is malformed".
3. **Uploads that pass a browser but shouldn't reach D1** (truncated WebP, JPEG, 3000 px, 16 px). Expected: all rejected 413/415, nothing written. → Tests: Task 4 `webpDimensions` unit cases incl. real `bible.webp` positive; Task 10 e2e rejects `photo.jpg`.
4. **Deleting a topic leaves stale availability** — `topics_off` still lists it, `quiz_defaults.category` points at it, caches still serve it. Expected: both cleaned, `forgetSettings()` + `forgetTopics()` called, next reads fresh. → Tests: Task 4 delete-path unit tests + Task 10 e2e cleanup assertions.
5. **Rename breaks import matching.** Expected: after rename, new name and id match, old name doesn't, error lists live names. → Test: Task 6 `categoryOf` rename cases.

---

## File Structure

| File                                                                                                                                                                                                                                                           | Responsibility                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Create: `apps/server/migrations/0020_topics.sql`                                                                                                                                                                                                               | `topics` table + seed of the 12                                                                               |
| Create: `apps/server/src/topics.ts`                                                                                                                                                                                                                            | Catalogue cache/fallback, slug helpers, emptiness, playable counts, WebP header parse, art URL + art endpoint |
| Create: `apps/server/src/topics.test.ts`                                                                                                                                                                                                                       | Seed consistency + module unit tests                                                                          |
| Create: `apps/server/src/adminTopics.ts`                                                                                                                                                                                                                       | Admin list/create/patch/delete/upload handlers                                                                |
| Create: `apps/server/src/adminSettings.test.ts`                                                                                                                                                                                                                | Settings membership-validation tests                                                                          |
| Create: `apps/web/src/topics.ts`                                                                                                                                                                                                                               | Live-catalogue store, `useTopics`, `topicName`/`topicStyle` lookups                                           |
| Create: `apps/web/src/topics.test.ts`                                                                                                                                                                                                                          | Lookup-chain unit tests                                                                                       |
| Create: `apps/web/src/admin/Topics.tsx`                                                                                                                                                                                                                        | Admin Topics section UI                                                                                       |
| Create: `apps/web/src/admin/artwork.ts` (+ `.test.ts`)                                                                                                                                                                                                         | `squareWebP` resize + `dominantColors` extraction                                                             |
| Create: `e2e/topics.spec.ts`                                                                                                                                                                                                                                   | Seed, CRUD, full-loop, Coming-soon, artwork e2e                                                               |
| Modify: `packages/game-core/src/games/quiz/settings.ts`, `packages/game-core/src/index.ts`                                                                                                                                                                     | Shipped catalogue fields, `ShippedTopicId`, `QuizCategory = string`, `topicIdSchema`, `DEFAULT_TOPIC_COLORS`  |
| Modify: `packages/content/src/schema.ts`, `packages/content/src/index.ts`                                                                                                                                                                                      | Schema uses `topicIdSchema`; shipped-only maps keyed `ShippedTopicId`                                         |
| Modify: `apps/server/src/{index,gameRules,room,adminQuestions,adminImport,adminSettings,adminGames}.ts`                                                                                                                                                        | Routes + every validation site from spec §9                                                                   |
| Modify: `apps/web/src/{api,catalog,matchInfo,RoomScreen,FriendsScreen}`, `pages/{TopicsPage,StatsPage}.tsx`, `games/quiz/{TopicPicker,QuizScreen,EliminationScreen}.tsx`, `admin/{AdminApp,Content,Games,Analytics,Dashboard,Rooms,Reports,questionParts}.tsx` | Live catalogue everywhere                                                                                     |
| Modify: `e2e/quiz.spec.ts`                                                                                                                                                                                                                                     | Seeded-based picker assertions                                                                                |
| Modify: `docs/ARCHITECTURE.md`, `docs/QUESTIONS.md`, `README.md`                                                                                                                                                                                               | Drop "fixed 12" claims                                                                                        |

Task order: 1 → 2 → (3, 4) → (5, 6) → 7 → (8, 9) → 10 → 11.

---

### Task 1: Shipped-catalogue foundation + migration

**Files:**

- Modify: `packages/game-core/src/games/quiz/settings.ts`, `packages/game-core/src/index.ts` (exports)
- Modify: `packages/content/src/schema.ts:17`, `packages/content/src/index.ts:42,67`
- Create: `apps/server/migrations/0020_topics.sql`
- Test: `apps/server/src/topics.test.ts` (created here; Tasks 2–4 append to it)

**Interfaces:**

- Produces: `QUIZ_CATEGORIES` entries gain `tagline: string`, `colors: readonly [string, string]`, `art: string`; `type ShippedTopicId` (12-member union); `type QuizCategory = string`; `topicIdSchema` (zod: `min(1).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, "Pick a topic.")`); `DEFAULT_TOPIC_COLORS = ["#6d5bff", "#1a1747"]` (readonly tuple). All exported from `@whizard/game-core`.
- Consumed by: every later task (`topicIdSchema` replaces every `z.enum` of 12).

- [ ] **Step 1: Write the failing seed-consistency test**

```ts
// apps/server/src/topics.test.ts
import { readFileSync } from "node:fs";
import { QUIZ_CATEGORIES } from "@whizard/game-core";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../migrations/0020_topics.sql", import.meta.url), "utf8");

describe("the topics migration", () => {
  it("seeds exactly the shipped twelve, in order, with taglines and colours", () => {
    const rows = [
      ...sql.matchAll(/\('([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(\[[^\]]*\])', (\d+)\)/g),
    ].map((m) => ({ id: m[1]!, name: m[2]!, tagline: m[3]!, colors: m[4]!, sort: Number(m[5]) }));
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.id)).toEqual(QUIZ_CATEGORIES.map((c) => c.id));
    rows.forEach((row, i) => {
      const shipped = QUIZ_CATEGORIES[i]!;
      expect(row.name).toBe(shipped.name);
      expect(row.tagline).toBe(shipped.tagline);
      expect(row.tagline.length).toBeGreaterThan(0);
      expect(JSON.parse(row.colors)).toEqual([...shipped.colors]);
      expect(row.sort).toBe(i + 1);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test apps/server/src/topics.test.ts`
Expected: FAIL — migration file does not exist / `tagline` missing on `QUIZ_CATEGORIES`.

- [ ] **Step 3: Create the migration and widen the constant**

`0020_topics.sql`: the spec §4 table DDL verbatim, then rows in exactly the shape the test parses (first row shown; all 12 values from the spec §4 table):

```sql
INSERT INTO topics (id, name, tagline, colors, sort_order) VALUES
  ('bible', 'Bible', 'Stories, verses and wisdom', '["#ffb52c","#5a2014"]', 1),
  ...;
```

`settings.ts`: add `tagline`, `colors`, `art` to each of the 12 entries (values = spec §4 table; `art` = the existing `TOPIC_STYLES` path); add `topicIdSchema`, `DEFAULT_TOPIC_COLORS`, `ShippedTopicId`; change `export type QuizCategory = string` (one-line doc: a live topic id, which D1 owns); `quizSettingsSchema.category = topicIdSchema`.
`content/src/schema.ts`: `category: topicIdSchema` (drop the enum cast — without this, `bank.ts fromRow` silently drops every custom question for a new topic). `content/src/index.ts`: `QUESTION_FILES: Record<ShippedTopicId, unknown>`. Export the new names from `packages/game-core/src/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test apps/server/src/topics.test.ts` → PASS.

- [ ] **Step 5: Full unit + typecheck**

Run: `pnpm typecheck && pnpm test` → PASS (fix ripple: `Record<QuizCategory, …>` loosens to `Record<string, …>` and compiles; if a test asserts the old enum error message, update it to `"Pick a topic."`).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Seed the topics table and widen the shipped topic catalogue"
```

---

### Task 2: Server catalogue module

**Files:**

- Create: `apps/server/src/topics.ts`
- Modify: `apps/server/src/topics.test.ts`

**Interfaces:**

- Produces:
  - `interface TopicRow { id: string; name: string; tagline: string; colors: readonly [string, string]; sortOrder: number; hasArt: boolean; artVersion: number }`
  - `async getTopics(env: Env): Promise<TopicRow[]>` — D1 only, or complete fallback; never merged
  - `forgetTopics(): void`
  - `slugify(name: string): string`, `async nextSlug(env: Env, name: string): Promise<string>`
  - `isKnown(topics: readonly { id: string }[], id: string): boolean`
  - `async hasQuestions(env: Env, bank: Bank, id: string): Promise<boolean>`
  - `playableCounts(bank: Bank, out: ReadonlySet<string>): QuestionCounts` (content type)
  - `async customCounts(env: Env): Promise<Map<string, number>>` — `SELECT category, COUNT(*) … GROUP BY` for the admin list
- Consumed by: Tasks 3–6.

- [ ] **Step 1: Write the failing tests** (append to `topics.test.ts`)

Use the fake-Env pattern from `apps/server/src/bank.test.ts` (`envWith(rows)` wrapping `DB.prepare`; add a `first()` variant for `EXISTS`/slug probes). Cases, by name:

1. `"returns only D1 rows when the table loads"` — one valid row → length 1, colours parsed to a tuple.
2. `"falls back to the whole shipped twelve when the database fails"` — `prepare().all` throws → length 12, ids equal `QUIZ_CATEGORIES` ids, each with tagline/colours.
3. `"falls back when the table is empty or every row is malformed"` — `[]`, and rows with unparseable `colors` → fallback both times.
4. `"never merges D1 rows with the fallback"` — one valid custom row only → length 1 (not 13).
5. `"forgetTopics makes the next read query again"` — spy on `prepare` call count: second `getTopics` re-queries only after `forgetTopics()`.
6. `"slugify lowercases, hyphenates and caps at 40"` — `"Biology 101!"` → `"biology-101"`; `"!!!"` → `"topic"`; 60-char name → length 40, no trailing `-`.
7. `"nextSlug resolves collisions deterministically"` — DB has `biology` → `"biology-2"`; both taken → `"biology-3"`. Fake `first()` returning `{ exists: 1 }` for taken slugs.
8. `"hasQuestions is true from either source"` — (a) bank has a `category: "bible"` question → true with empty DB; (b) no bank match but the `EXISTS` `first()` returns a row → true; (c) neither → false.
9. `"playableCounts skips out-of-play questions"` — bank of 2 questions in one category, `out` holding one id → count reduced accordingly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test apps/server/src/topics.test.ts` → FAIL (`./topics` not found).

- [ ] **Step 3: Implement `apps/server/src/topics.ts`**

Query `SELECT id, name, tagline, colors, sort_order, art IS NOT NULL AS has_art, art_version FROM topics ORDER BY sort_order`. Parse `colors` with `JSON.parse` + shape check (array of two `/^#[0-9a-fA-F]{6}$/`); drop invalid rows; if zero rows survive (or the query throws) `console.error` and return `fallbackTopics()` built from `QUIZ_CATEGORIES` (`hasArt: false`, `artVersion: 0`, `sortOrder` = index + 1). Cache `{ at, rows }` with `CACHE_MS = 15_000`. `nextSlug` = `slugify`, then probe `first()` with `-2`, `-3`, … truncating the base so base + suffix stays ≤ 40. `hasQuestions` = `bank.questions.some(q => q.category === id)` OR one `EXISTS` on `custom_questions`. `playableCounts` = content's `questionCounts(bank.questions.filter(q => !out.has(q.id)))`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test apps/server/src/topics.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Read the topic catalogue from D1 with an all-or-nothing fallback"
```

---

### Task 3: Public catalogue + artwork endpoints

**Files:**

- Modify: `apps/server/src/index.ts` (routes `GET /api/quiz/categories`, `GET /api/topics/:id/art`)
- Modify: `apps/server/src/topics.ts` (art helpers)
- Test: `apps/server/src/topics.test.ts` (append)

**Interfaces:**

- Produces:
  - `GET /api/quiz/categories` → `{ categories: { id, name, tagline, colors, art, questions }[] }`, `Cache-Control: no-store`, ordered by `sort_order`, off topics excluded, `questions` from `playableCounts` only
  - `GET /api/topics/:id/art?v=N` → 200 WebP (`Cache-Control: public, max-age=31536000, immutable`) | 302 to shipped/static fallback | 404 **only** when the id itself is unknown
- Consumed by: Task 7 (`fetchQuizCategories` client path), Task 9 (art `<img>`).

- [ ] **Step 1: Write failing route tests** (append to `topics.test.ts`; follow the fake-Env + `buildRequest` pattern already used for `index` route tests — grep `apps/server/src/*.test.ts` for `app.request`/`handle` style and copy it)

1. `"GET /api/quiz/categories is no-store and ordered"` — insert two seeded rows with swapped `sort_order` + one `topics_off` id → assert header, order, and the off id absent.
2. `"counts only playable shipped questions"` — bank has 5 bible questions, one in `outOfPlay` → bible `questions` = 4; custom rows count from `custom_questions`.
3. `"GET /api/topics/:id/art serves the blob with immutable caching"` — `art` bytes present → 200, `content-type: image/webp`, immutable header, `?v=0` vs `?v=3` both 200 (version is cache-busting only).
4. `"art falls back to the shipped path"` — no art, id is shipped → 302 `Location` = spec §8 static path.
5. `"art falls back to the generic image"` — custom id with no art → 302 to `/art/games/quiz.webp`.
6. `"art 404s only for unknown ids"` — `does-not-exist` → 404.

- [ ] **Step 2: Run to verify red**

Run: `pnpm test apps/server/src/topics.test.ts` → FAIL (routes missing).

- [ ] **Step 3: Implement**

In `topics.ts` add `topicArt(env, id)` returning `{ kind: "bytes", bytes } | { kind: "redirect", location } | { kind: "unknown" }`, plus `categoriesPayload(env, bank)` (single query path shared by both routes). In `index.ts` register both handlers; the categories handler sets `Cache-Control: no-store`; the art handler serves WebP bytes or the 302/404 per the rules above (order: unknown id → 404; bytes → 200; shipped → 302 static; else → 302 generic).

- [ ] **Step 4: Green + commit**

Run: `pnpm typecheck && pnpm test` → PASS.

```bash
git add -A && git commit -m "Serve the live topic catalogue and topic artwork"
```

---

### Task 4: Admin topics CRUD handlers

**Files:**

- Create: `apps/server/src/adminTopics.ts`
- Modify: `apps/server/src/index.ts` (mount under `/api/admin/topics`)
- Modify: `apps/server/src/topics.ts` (upload validation helpers)
- Test: `apps/server/src/topics.test.ts` (append)

**Interfaces:**

- Produces (all admin-authed, all `Cache-Control: no-store`, all `requireSameOrigin` for mutations, all calling `forgetTopics()` before responding):
  - `GET /api/admin/topics` → full list incl. `topics_off` flag, `custom_count`, `bank_count`, `hasArt`, `artVersion`
  - `POST /api/admin/topics` `{ name }` → `{ id: slug, … }` (201); 409 `A topic with that name already exists.`; validation error `"Pick a topic."` for empty/oversized
  - `PATCH /api/admin/topics/:id` `{ name?, tagline?, colors? }` → 200; rename = name only, id immutable; 409 `A topic with that name already exists.` on dupe; colors must be exactly two `/^#[0-9a-fA-F]{6}$/`
  - `DELETE /api/admin/topics/:id` → 204; 409 `That topic has questions — delete them first.`; on success strips `topics_off` + resets `quiz_defaults.category` if it matched (then `forgetSettings()`)
  - `PUT /api/admin/topics/:id/art` (raw WebP body) → 200 `{ version }` (increments `art_version`); 415 non-WebP; 413 > 400 KB
  - `webpDimensions(bytes: Uint8Array): { width, height } | null` (VP8 / VP8L / VP8X header parse)
- Consumed by: Tasks 9, 10.

- [ ] **Step 1: Write failing tests** (append to `topics.test.ts`; DB fakes via the `envWith` pattern)

1. `"webpDimensions reads VP8, VP8L and VP8X"` — craft 3 minimal headers by hand (VP8X: `RIFF….WEBPVP8X` + flags + 24-bit LE canvas size; VP8L: `VP8L` + `\x2f` + 14-bit-packed size; VP8: `VP8 ` + 3-byte frame tag + 16-bit LE size in `bits & 0x3fff`) — assert returned width/height; garbage/JPEG/PNG/truncated → `null`. Also parse the real `public/art/games/bible.webp` (read from disk) → width/height > 0.
2. `"create slugs and rejects duplicates"` — POST `Biology` → id `biology`; POST `biology` again → 409 with the spec message.
3. `"rename keeps the id"` — PATCH `biology` name → `life sciences` → row id still `biology`, name updated; second topic named `Life Sciences` → 409.
4. `"delete refuses non-empty and strips availability on success"` — (a) `custom_questions` row exists → 409 + spec message + row still there; (b) empty → 204, row gone, `topics_off` entry for it gone, `quiz_defaults.category` reset to a live id, `forgetSettings` observable via next settings read.
5. `"upload validates signature, size and dimensions"` — valid tiny WebP fixture → 200 version bump; JPEG magic → 415; 400 KB+ buffer → 413; 3000×3000 / 16×16 headers → 413.
6. `"every admin route sets no-store"` — GET list header assertion.

- [ ] **Step 2: Run to verify red**

Run: `pnpm test apps/server/src/topics.test.ts` → FAIL.

- [ ] **Step 3: Implement `adminTopics.ts`**

Follow the existing admin-router pattern (see how `adminQuestions.ts` builds handlers: auth check → `requireSameOrigin` on mutations → JSON → error mapping to status codes). Uploads: read `arrayBuffer`, check `webpDimensions` first (it also proves the `RIFF`/`WEBP` signature), then byte cap 400 000, then dimension range 32–2048 — map to 415/413/413 respectively (spec §8). Emptiness per spec §6: `hasQuestions` (bank OR custom). Every mutating path: `forgetTopics()` first; delete also `forgetSettings()`.

- [ ] **Step 4: Green + commit**

Run: `pnpm typecheck && pnpm test` → PASS.

```bash
git add -A && git commit -m "Add admin topic create, edit, delete and artwork endpoints"
```

---

### Task 5: Runtime settings validation

**Files:**

- Modify: `apps/server/src/gameRules.ts`, `apps/server/src/room.ts`, `apps/server/src/index.ts` (room settings upsert), `apps/server/src/adminGames.ts`
- Create: `apps/server/src/adminSettings.test.ts` (settings-validation tests)

**Interfaces:**

- Produces: every settings write/accept path validates `quiz_settings.category` + `elimination_settings.topics` against `getTopics()` and rejects unknown ids with `That topic isn't available. Pick another.`
- Consumed by: ensures no code path can inject a dead id once Task 6 loosens the zod enum.

- [ ] **Step 1: Write failing tests** (`adminSettings.test.ts`)

1. `"rejects unknown category in quiz settings"` — `newRoomSettings`-equivalent / settings upsert with `category: "nope"` → error message spec §17.7.
2. `"rejects unknown ids in elimination topics"` — `topics: ["bible", "nope"]` → same error.
3. `"accepts every live id including a freshly created one"` — seed custom row `mars` → `category: "mars"` passes.
4. `"adminGames game-config write validates too"` — the admin custom-game path (grep `adminGames.ts` for its settings parse) rejects `nope`.

- [ ] **Step 2: Red** → Run: `pnpm test apps/server/src/adminSettings.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Add a shared `settingsTopicProblems(env, settings)` helper (in `adminSettings.ts` or `topics.ts`) returning unknown ids; call it from: `room.ts` where `contentNeeded` is derived (before any content resolution), the index.ts room-settings upsert handler, `gameRules.ts` preset application, and `adminGames.ts` custom-game write. Each returns 400 with the spec message. Because `topicIdSchema` no longer enforces membership (Task 1), this is now the only gate — audit with `grep -rn "category" apps/server/src/*.ts` to confirm no write path skips it.

- [ ] **Step 4: Green + commit**

Run: `pnpm typecheck && pnpm test` → PASS.

```bash
git add -A && git commit -m "Validate topic ids on every settings write path"
```

---

### Task 6: Admin write paths — questions, import, defaults

**Files:**

- Modify: `apps/server/src/adminQuestions.ts` (create/update topic membership)
- Modify: `apps/server/src/adminImport.ts` (`categoryOf` match messages + id validation)
- Modify: `apps/server/src/adminSettings.ts` (`quiz_defaults.category` + `settingsTopicProblems` export if not placed in Task 5)
- Test: extend `adminSettings.test.ts` or a colocated `adminImport.test.ts`

**Interfaces:**

- Produces: admin question create/update accepts any **live** id (400 with the spec message otherwise); import maps category by **name or id** against the live list; `quiz_defaults.category` validated on save.
- Consumed by: admin UI (Task 9) and e2e (Task 10) create questions under custom topics.

- [ ] **Step 1: Failing tests**

1. `"question create accepts a custom topic and rejects a dead one"` — POST question `category: "mars"` (live) → 201; `category: "nope"` → 400 spec message.
2. Rename cases (Review Focus 5): after PATCH rename of `biology` → `life sciences` — import matching by new name works, by id works, old name fails with an error listing live names.
3. `"quiz defaults validated"` — `quiz_defaults.category: "nope"` → 400.

- [ ] **Step 2: Red** → `pnpm test` on those files → FAIL.

- [ ] **Step 3: Implement** — swap any remaining `z.enum`/`QUIZ_CATEGORIES` membership checks for `settingsTopicProblems`/`isKnown(getTopics())`; rewrite `categoryOf` to compare against live rows case-insensitively (name or id).

- [ ] **Step 4: Green + commit**

Run: `pnpm typecheck && pnpm test` → PASS.

```bash
git add -A && git commit -m "Validate topic ids on admin question and import writes"
```

---

### Task 7: Client live-catalogue module

**Files:**

- Create: `apps/web/src/topics.ts`, `apps/web/src/topics.test.ts`
- Modify: `apps/web/src/api.ts` (`QuizCategoryInfo` gains `tagline`; add `fetchQuizCategories`, `fetchAdminTopics` + admin mutations)

**Interfaces:**

- Produces (apps/web/src/topics.ts):
  - `useTopics(): { topics: TopicInfo[]; loading: boolean; error: string | null; reload: () => void }` — fetches `/api/quiz/categories` once per store (shared module state, `no-store` so always revalidates on reload), merges onto `QUIZ_CATEGORIES` **only when the fetch fails** (mirrors server rule: fallback, never merge)
  - `topicName(id): string` — live row → shipped row → the raw id (last-resort never-throw)
  - `topicStyle(id): { colors: readonly [string, string]; art: string }` — same chain, defaults `DEFAULT_TOPIC_COLORS` + `/art/games/quiz.webp`
  - `artSrc(info): string` — `art` field is already a resolved URL from Task 3
- Consumed by: Tasks 8–9.

- [ ] **Step 1: Failing tests** (`topics.test.ts`, React Testing Library pattern copied from an existing page test)

1. `"topicName prefers the live catalogue"` — store with live row `mars / Mars Colony` → `topicName("mars")` = `"Mars Colony"`; unknown → raw id; shipped id absent from live (fallback mode) → shipped name.
2. `"topicStyle falls back without merging"` — fetch fails → style for `bible` = shipped colours/art; fetch succeeds with custom-only row → only live rows returned (12 shipped not appended).
3. `"useTopics surfaces loading and error"`.

- [ ] **Step 2: Red** → `pnpm test apps/web/src/topics.test.ts` → FAIL.

- [ ] **Step 3: Implement** — module-level cache `{ topics, at }` + subscribers so multiple components share one fetch; `api.ts` additions typed per spec §7 field list. **Label migration sweep** (mechanical, same commit): replace `QUIZ_CATEGORIES.find(...)?.name` / `TOPIC_STYLES[id]` uses with `topicName(id)` / `topicStyle(id)` at every call site found in the audit: `Analytics:192`, `Dashboard:97`, `Rooms:95`, `questionParts:12`, `EliminationScreen:59,60,111`, `QuizScreen:258,444`, `StatsPage:47`, `matchInfo.ts:20`, `FriendsScreen:533`, `RoomScreen:594,652`.

- [ ] **Step 4: Green + commit**

Run: `pnpm typecheck && pnpm test` → PASS.

```bash
git add -A && git commit -m "Look topic labels up in the live catalogue"
```

---

### Task 8: Browse grid + picker rewrite; delete TOPIC_STYLES

**Files:**

- Modify: `apps/web/src/pages/TopicsPage.tsx`, `apps/web/src/games/quiz/TopicPicker.tsx`, `apps/web/src/catalog.ts`
- Modify: `apps/web/src/pages/TopicsPage` styles for `tagline` + art thumbnails
- Delete: `TOPIC_STYLES` (and `chip` field) from wherever it survives after Task 7

**Interfaces:**

- Produces: browse grid renders live rows (art `<img>` → tagline → name → `N questions` / `Coming soon`), ordered by `sort_order`; TopicPicker renders live list (off topics excluded server-side already); "Coming soon" when `questions === 0`.
- Consumed by: humans + e2e Task 10.

- [ ] **Step 1: Failing tests**

1. TopicsPage (existing test file — grep `TopicsPage` tests): renders taglines, shows `Coming soon` for `questions: 0`, `N questions` otherwise, preserves search + grid filters against live rows.
2. TopicPicker: disabled/future topic logic now driven by `questions === 0` rather than a hardcoded future list (check current logic first; keep any real scheduling semantics — grep for `future` in `TopicPicker`).

- [ ] **Step 2: Red** → `pnpm test` → FAIL.

- [ ] **Step 3: Implement** — swap the component's `QUIZ_CATEGORIES`/`TOPIC_STYLES` reads for `useTopics()`; each card: thumbnail (`topicStyle(id).art`), `name`, `tagline`, count badge. Remove `TOPIC_STYLES` + `chip` entirely; ensure `grep -rn "TOPIC_STYLES" apps/` returns nothing.

- [ ] **Step 4: Green + commit**

```bash
git add -A && git commit -m "Render the browse grid and picker from the live catalogue"
```

---

### Task 9: Admin Topics section + artwork pipeline

**Files:**

- Create: `apps/web/src/admin/Topics.tsx`, `apps/web/src/admin/artwork.ts`, `apps/web/src/admin/artwork.test.ts`
- Modify: `apps/web/src/admin/AdminApp.tsx` (nav entry "Topics"), `Content.tsx` (topic select from live list + free-text id via datalist), `Games.tsx` (custom-game topic checkboxes from live list)

**Interfaces:**

- Produces:
  - `squareWebP(file: File): Promise<Blob>` — client downscale to ≤ 1024 square, export `image/webp` quality 0.85 (browser nicety only; server still validates)
  - `dominantColors(img: HTMLImageElement): readonly [string, string]` — quantize r/g/b >> 4, alpha ≥ 128, top-2 bins (lexicographic tie-break), return `#rrggbb` pair; falls back to `DEFAULT_TOPIC_COLORS` when < 2 bins
  - Admin UI: create (name input → POST), rename (name), edit tagline, edit colours (two pickers seeded from `dominantColors` after art upload), upload artwork (`<input type="file" accept="image/webp,image/*">` → `squareWebP` → `PUT …/art`), delete (confirm; disabled with the 409 message inline when non-empty), `topics_off` toggle wiring if a toggle endpoint exists (check spec §7; if none, note it as out of scope in the PR)
- Consumed by: Task 10 e2e.

- [ ] **Step 1: Failing tests** — `artwork.test.ts`: `dominantColors` on a 2×2 canvas (3 red / 1 blue → `["#ff0000", "#0000ff"]`); all-transparent → defaults; single colour → `[c, DEFAULT]`. Admin Topics component test: renders list with counts, POST from form, delete disabled + 409 message shown when `custom_count + bank_count > 0`.

- [ ] **Step 2: Red** → `pnpm test apps/web/src/admin` → FAIL.

- [ ] **Step 3: Implement** — mirror the structure of an existing admin section (copy `Content.tsx` layout: header + form + list table). `fetchAdminTopics` mutations from Task 7 api additions; on success call `reload()` of both admin list and the public store (import `invalidateTopics()` if added in Task 7 — else call `useTopics().reload`).

- [ ] **Step 4: Green + commit**

Run: `pnpm typecheck && pnpm test` → PASS.

```bash
git add -A && git commit -m "Add the admin Topics section with artwork upload"
```

---

### Task 10: End-to-end tests

**Files:**

- Create: `e2e/topics.spec.ts`
- Modify: `e2e/quiz.spec.ts:100-101` (Review Focus 1)

**Interfaces:**

- Consumes: everything. Uses `grantAdmin(page)` (`scripts/set-admin.mjs` helper imported per existing e2e pattern), unique topic names per run (`Topic ${Date.now()}`), UI-driven mutations only (Origin header rule).

- [ ] **Step 1: Write `e2e/topics.spec.ts`** — five specs from spec §16:

1. **Seed**: admin → Topics shows all 12 with taglines; counts ≥ shipped playable.
2. **CRUD + full loop**: create `mars-${runId}` → appears in public browse (`/quiz` picker or Topics page) → Content form can file a question under it (labels "Topic", "Level", "Sub-question"… per audit) → question shows in play → rename to `red-${runId}` (id unchanged — assert URL/data attribute) → delete cleanup: delete the question first (via Content UI), then the topic (enabled now), then assert it vanished from browse.
3. **Emptiness guard**: create second topic → try delete while empty-but-wait: create topic, file no questions → delete succeeds; then create third, file a question, attempt delete → 409 inline message `That topic has questions — delete them first.`, topic still listed (cleanup: delete the question, then the topic).
4. **Coming soon**: custom topic with zero questions shows `Coming soon` in browse; shipped topic with questions shows `N questions`.
5. **Artwork**: upload a crafted small WebP (generate fixture in the test: minimal VP8L header bytes → Blob) → art appears (or the response 200 + `<img>` src now points at `/api/topics/:id/art?v=1`) → then upload `photo.jpg` → inline error, no change. Cleanup topic.

Also relax `quiz.spec.ts:100-101` to seeded-based assertions: total radios `≥ 11`, "Nigerian culture" radio present and enabled.

- [ ] **Step 2: Run the whole e2e suite**

Run: `pnpm exec playwright test` → PASS (all 3 shards conceptually; locally one run).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Cover the topic catalogue end to end"
```

---

### Task 11: Docs + full verification

**Files:**

- Modify: `docs/ARCHITECTURE.md`, `docs/QUESTIONS.md`, `README.md` — replace "fixed 12" claims with "seeded 12, admin-editable, D1-authoritative"; document `/api/topics/:id/art` and the Topics admin section.

- [ ] **Step 1: Sweep** — `grep -rn "fixed 12\|twelve topics\|hardcoded topic" docs/ README.md` and update each hit; add a short "Topics" subsection to ARCHITECTURE (table + cache + fallback rule).
- [ ] **Step 2: Full local gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright test
```

All PASS. Fix anything red before proceeding (per Review Focus list, re-check items 1–5).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Document the editable topic catalogue"
```

---

## Self-Review Notes (resolved during drafting)

- `TOPIC_IDS.length` in settings upsert (room/index) must use a **live count** from `getTopics()`, not the constant — covered by Task 5's audit step.
- e2e uploads: browsers can't send raw bytes easily → Task 10 uses `page.request`/`APIRequestContext`? **No** — mutations require Origin; use in-page `fetch(file.arrayBuffer())` inside `page.evaluate` (same-origin so Origin header is set automatically).
- `forgetTopics` is module-global: tests must call it in `beforeEach` to avoid cache bleed between cases (add to Task 2 setup).

## Execution

Ready to implement. **Review this plan first**, then choose:

1. **subagent-driven-development** (recommended) — a fresh subagent per task, spec + plan + diff each time.
2. **executing-plans** — I execute all tasks inline in this session.

Say which you'd like.
