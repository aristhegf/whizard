# Topic Catalogue — admin-editable quiz topics

Status: **approved design, amendments incorporated — ready for implementation planning**
Base: `main` @ `9967ee6` (worktree `C:\Users\Omotayo\AI Websites\whizard-main`)
Date: 2026-10-08
All file/line references are against `origin/main` @ `9967ee6`.

---

## 1. Goal

Let an admin create quiz topics, rename them, edit taglines and colours, and upload/replace
tile artwork — with D1 as the authoritative topic catalogue — while players browse one simple
topic grid and can play any topic that has usable questions.

Core rule (verbatim from the amendments):

> IDs identify topics. Names describe topics.

`topics.id` is an immutable slug. Questions, stats, game settings, imports and every other
reference use the ID. Renaming changes only `name`.

## 2. Non-goals

- No reorder UI (`sort_order` exists; new topics append at `MAX(sort_order) + 1`).
- No Popular/Trending/New sections now — but nothing may hard-code the assumption that the
  grid can never grow them (§11).
- No R2 — artwork lives in D1 as a BLOB.
- No `status`/`is_active` column — availability is `topics_off` alone (§9).
- No new question lifecycle — "empty" is defined from existing rules (§10).
- No player-facing topic management; no bulk art tooling.

## 3. Principles

1. **D1 is authoritative during normal operation.** The shipped 12-topic constant is used
   **only** when the D1 catalogue cannot be loaded, **all-or-nothing**: D1 success → D1 only;
   D1 error *or* zero rows → the complete shipped fallback (with a logged warning). A partial
   or stale D1 result is never merged with the fallback.
2. **No duplication of "availability".** `topics_off` stays the sole switch for on/off.
3. **Every topic mutation invalidates the catalogue cache before its response completes**
   (`forgetTopics()`), so a created topic is visible to the question editor immediately —
   no waiting for the 15-second cache.
4. **Validation of topic IDs happens server-side against the live D1 catalogue** at every
   state-changing boundary. The old fixed `z.enum` of 12 IDs is removed everywhere and is
   never replaced by an unrestricted `z.string()` — shape is constrained in zod, membership
   is checked against the live catalogue (§9).

---

## 4. Data model — migration `0020_topics.sql`

```sql
CREATE TABLE topics (
  id          TEXT PRIMARY KEY,          -- immutable slug, a-z0-9 with hyphens
  name        TEXT NOT NULL,             -- display name; renameable
  tagline     TEXT NOT NULL DEFAULT '',
  colors      TEXT NOT NULL,             -- JSON array of two "#rrggbb" strings
  sort_order  INTEGER NOT NULL,
  art         BLOB,                      -- uploaded square WebP, null until uploaded
  art_type    TEXT,                      -- 'image/webp'
  art_version INTEGER NOT NULL DEFAULT 0 -- bumped on every replace; cache-buster for ?v=
);
```

- No `status`/`is_active`; no FK to questions (the guard is query-based, §10).
- `id` is immutable: renames never touch it; deletion is the only way a row disappears, and
  only while it has no questions (§10).

### Seed: the existing 12 topics

The migration inserts all 12 so the catalogue is complete immediately after migration.
`sort_order` = index in `QUIZ_CATEGORIES` (1–12). Colours and art paths come from
`TOPIC_STYLES` (`apps/web/src/catalog.ts:161`). Taglines are new, short, and never blank:

| # | id | name | tagline | colors | art (static until uploaded) |
|---|----|------|---------|--------|------------------------------|
| 1 | `bible` | Bible | Stories, verses and wisdom | `["#ffb52c","#5a2014"]` | `/art/topics/bible.webp` |
| 2 | `quran` | Quran | Surahs, verses and teachings | `["#25c08c","#053b33"]` | `/art/topics/quran.svg` |
| 3 | `geography` | Geography | Places, maps and landmarks | `["#26c15f","#023c3c"]` | `/art/topics/geography.webp` |
| 4 | `history` | History | Moments that shaped the world | `["#ff4b3e","#6a0b34"]` | `/art/topics/history.webp` |
| 5 | `science` | Science | How the world works | `["#1f9dff","#062585"]` | `/art/topics/science.webp` |
| 6 | `animals` | Animals | Wildlife from every habitat | `["#f2a93b","#3f2a0a"]` | `/art/topics/animals.svg` |
| 7 | `football` | Football | Clubs, players and the beautiful game | `["#ff8a1f","#6b1228"]` | `/art/topics/football.webp` |
| 8 | `movies` | Movies | Film, screen and cinema | `["#8f3cff","#2a0580"]` | `/art/topics/movies.webp` |
| 9 | `music` | Music | Artists, genres and songs | `["#de45ff","#5e0480"]` | `/art/topics/music.webp` |
| 10 | `nigerian-culture` | Nigerian culture | Language, food and tradition | `["#2fc44a","#012e2e"]` | `/art/topics/nigerian-culture.webp` |
| 11 | `general-knowledge` | General knowledge | A bit of everything | `["#1aa6ff","#1015a8"]` | `/art/topics/general-knowledge.webp` |
| 12 | `pop-culture` | Pop culture | TV, trends and celebrities | `["#22b4ff","#0232a3"]` | `/art/topics/pop-culture.webp` |

`art`/`art_type` stay `NULL` at seed — the built-in static file serves as artwork until an
admin uploads a replacement (§8). Grid order after the change = `sort_order` (this replaces
the removed `POPULAR` ordering; `quran`, previously missing from the browse page, now shows).

Migration is applied by CI with the deploy, same as every existing migration.

## 5. Shipped fallback catalogue — `packages/game-core/src/games/quiz/settings.ts`

`QUIZ_CATEGORIES` stays the shipped constant but each entry gains the fields needed to stand
alone as the emergency fallback:

```ts
export const QUIZ_CATEGORIES = [
  { id: "bible", name: "Bible", tagline: "Stories, verses and wisdom",
    colors: ["#ffb52c", "#5a2014"], art: "/art/topics/bible.webp" },
  … // exactly the 12 rows of §4, values identical to the migration seed
] as const;
```

Type changes:

- `ShippedTopicId = (typeof QUIZ_CATEGORIES)[number]["id"]` — the 12-member union, for maps
  that are genuinely shipped-only: `QUESTION_FILES` (`packages/content/src/index.ts:42`).
- `QuizCategory = string` — for anything that can name a live topic: `QuizSettings.category`,
  `QuizContentRequest.category`, `StoredQuestion["category"]`, `QuestionCounts`
  (`Partial<Record<string, …>>`).
- `TOPIC_STYLES` in `apps/web/src/catalog.ts` becomes **derived** from `QUIZ_CATEGORIES`
  (keeping the `chip` field for any remaining chip UI), so fallback colours/art live in
  exactly one code place. The migration seed duplicates them in SQL — guarded by a
  consistency test (§14).
- `quizSettingsSchema.category` (`settings.ts:46`): `z.string().min(1).max(40)` with the
  slug pattern `/^[a-z0-9][a-z0-9-]*$/` and the message `"Pick a topic."`. **Shape only** —
  membership is a server-side catalogue check (§9). This is not an unrestricted
  `z.string()`: bounded, patterned, and every state-changing path validates against D1.

The fallback in code is therefore: complete 12-topic rows (id, name, tagline, colours, art),
used only per §3.1.

## 6. Server catalogue module — `apps/server/src/topics.ts` (new)

Mirrors `settings.ts`/`bank.ts`:

```ts
const CACHE_MS = 15_000;
export async function getTopics(env): Promise<TopicRow[]>   // ORDER BY sort_order
export function forgetTopics(): void                        // clears the cache
export function isKnown(topics, id): boolean
export function slugify(name): string                       // §4 slug rules
export function nextSlug(env, name): Promise<string>        // collision → biology-2, -3, …
export function hasQuestions(env, id): Promise<boolean>      // §10
export async function playableCounts(env, bank, topics): Promise<Record<string, Levels>>
```

- `getTopics`: `SELECT * FROM topics ORDER BY sort_order`. Success with ≥1 row → D1 only.
  On query error **or** zero rows → return the complete shipped fallback
  (`QUIZ_CATEGORIES` rows) and `console.error` a warning. Never a merge.
- `forgetTopics()` is called by every topic mutation **before the mutation response is
  returned**, and by anything else that changes availability/emptiness of a topic.
- Artwork replacement bumps `art_version`; the catalogue's `art` URL carries `?v=`, so
  `forgetTopics()` also refreshes art URLs (immutable client caching stays correct).

## 7. API surface

### Public

**`GET /api/quiz/categories`** — `apps/server/src/index.ts:93` extended:

```jsonc
{ "categories": [ {
    "id": "bible", "name": "Bible",
    "tagline": "Stories, verses and wisdom",
    "colors": ["#ffb52c", "#5a2014"],
    "art": "/art/topics/bible.webp",          // or "/api/topics/bible/art?v=3", or generic
    "questions": { "easy": 170, "medium": 170, "hard": 170 }   // PLAYABLE counts (§10)
} ] }
```

- Rows from `getTopics()` (fallback applies per §3.1), `ORDER BY sort_order`, filtered to
  `!topics_off` (unchanged contract — `e2e/admin.spec.ts` asserts off topics are absent).
- Counts switch from raw bank totals to **playable** (bank ∪ custom, minus out-of-play,
  §10), so `Coming soon` means genuinely unplayable. `outOfPlay` runs once per request
  (two small queries; `loadBank` is cached 15 s).
- **Headers change: `Cache-Control: no-store`** (was `public, max-age=60`). A public 60-second
  HTTP cache would defeat `forgetTopics()` for every client other than the admin — directly
  against amendment §3 ("…whether a topic should be considered available/empty").

**`GET /api/topics/:id/art`** (new route in the `index.ts` route table):

- Row has `art` → `200`, `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000,
  immutable` (URL changes via `?v=` on replace), `X-Content-Type-Options: nosniff`.
- No blob → `302` to the built-in static file (`/art/topics/<id>.webp|svg`) if the shipped
  constant has one, else to the generic `/art/games/quiz.webp`. Never 404s.

### Admin (all `requireAdmin`; mutations also `requireSameOrigin`, matching `adminQuestions`)

| Route | Behaviour |
|---|---|
| `GET /api/admin/topics` | Full catalogue **including off topics**: `{ topics: [{ id, name, tagline, colors, sortOrder, art, artVersion, off, questionCount }] }`, `Cache-Control: no-store`. `questionCount` = any question in bank ∪ `custom_questions` (§10) — drives the delete affordance. |
| `POST /api/admin/topics` | Body `{ name, tagline?, colors? }`. Server generates the slug from `name` (`slugify` + collision `…-2`, `-3`); `sort_order = MAX(sort_order)+1`; default colours `["#6d5bff","#1a1747"]` and generic art when not given. `201 { topic }`. `forgetTopics()` before responding. |
| `PATCH /api/admin/topics/:id` | Body any of `{ name?, tagline?, colors? }`. `name` ≤ 40 chars, non-empty after trim; `tagline` ≤ 80; `colors` = exactly two `/^#[0-9a-fA-F]{6}$/`. **`id` never changes.** `200 { topic }`. `forgetTopics()` first. |
| `PUT /api/admin/topics/:id/art` | Raw WebP body (validated server-side, §8). `art_version + 1`. `200 { topic }`. `forgetTopics()` first. |
| `DELETE /api/admin/topics/:id` | Empty (§10) → delete row; strip the id from `site_settings.topics_off`; if `quizDefaults.category === id` reset it to `DEFAULT_QUIZ_SETTINGS.category`; `forgetTopics()` + `forgetSettings()`; `logAdmin("topic:delete")`. Non-empty → **`409 topic_has_questions`**, message: *"That topic has questions — delete them first."* **No cascade of any kind.** |

`logAdmin` actions: `topic:create`, `topic:edit`, `topic:art`, `topic:delete` (target = id).

Renaming a topic that has questions/stats is safe by construction: every reference is the
unchanged id (`custom_questions.category`, `matches.category`, `daily_counts` metric
`topic:<id>`, `seen` history keyed by category string).

## 8. Artwork

**Browser (convenience, not a security boundary):** on file pick, resize to a square
≤ 1024 px WebP via canvas (same pattern as the jigsaw photo crop), extract two colours
(simple dominant-pair sampling of the downscaled canvas), prefill the colour fields.

**Server (authoritative) — `PUT …/art`:**

1. `Content-Length` and actual byte length ≤ **400 KB** (`413`).
2. Byte signature: `RIFF` at 0 and `WEBP` at 8 (`415`) — the check `photos.ts:14` already
   performs for photos.
3. Parse the WebP container header (`VP8X` / `VP8 ` / `VP8L`) for canvas dimensions;
   reject if unparsable, either dimension `< 32` or `> 2048` (`415`).
4. Store blob + `art_type = "image/webp"`, bump `art_version`.

**Fallback chain (kept as approved):**

1. uploaded D1 artwork → `art` field = `/api/topics/<id>/art?v=<art_version>`
2. existing built-in static artwork → `/art/topics/<id>.webp|svg`
3. generic fallback → `/art/games/quiz.webp` (new topics with no upload)

`?v=` makes replacement cache-immutable: a new upload changes the URL, so no stale tile art.

## 9. Server-side validation audit (amendment §5 — every site)

| Site | Today | Change |
|---|---|---|
| `game-core …/quiz/settings.ts:46` `quizSettingsSchema.category` | `z.enum(12)` | Bounded patterned string (§5). Shape only. |
| `content/src/schema.ts:17` `storedQuestionSchema.category` | `z.enum(12)` | Same shape constraint. **Critical:** `bank.ts:47 fromRow` drops rows that fail this schema — without widening, every custom question for a new topic would silently vanish from `loadBank`. Membership was already enforced at write time. |
| `adminQuestions.ts:257` `newSchema.category` | `z.enum(12)` | Shape in zod; handler checks `isKnown(getTopics(env), category)` → `400 invalid_question "Pick a topic."` |
| `adminQuestions.ts` PATCH/edit | keeps `existing.category` | Unchanged — renames can't orphan questions. |
| `adminImport.ts:269` `categoryOf` + `:241` error | static list | `categoryOf(value, topics)` takes the **live catalogue** (normalised id *or* name match); error lists live topic names. Callers (`rowToQuestion` etc.) receive `topics` explicitly; unit tests pass `QUIZ_CATEGORIES`. |
| `adminSettings.ts:20` `TOPIC_IDS` (`topicsOff`) | `z.array(z.enum(12))` | Shape (`z.array(z.string())` + bounds) then membership check against the live catalogue per element → `400`. Unknown/deleted ids are rejected on write; `DELETE topic` also cleans them out of stored `topics_off`. |
| `adminSettings.ts:83` `quizDefaults` (`quizSettingsSchema.partial()`) | enum inside | Shape via §5 + membership check on `quizDefaults.category` when present. |
| `gameRules.ts:39` `newRoomSettings` fallback | `[topicOf(admin), …12 ids].find(!off)` | Signature gains `topicIds: readonly string[]` (live catalogue). After the existing `safeParse` try-loop: if the resulting topic is **not in the catalogue or is off**, swap to the first id in `[topicOf(admin), …topicIds]` that is in the catalogue and on; else `DEFAULT_QUIZ_SETTINGS.category`. Presets with unknown topics (createRoom stores settings unvalidated) land here. |
| `room.ts:265` `configure` | checks `topicsOff` only | Also check catalogue membership → `bad_settings` with `"That topic isn't available. Pick another."` (preserves today's behaviour where the enum rejected unknown ids). |
| `room.ts:275` `handleStart` | `topicsOff` check | Also reject topics no longer in the catalogue (belt-and-braces; delete-when-non-empty makes this near-impossible). |
| `index.ts:158` activity-log topic | `QUIZ_CATEGORIES.some(…)` | `getTopics` membership; else default topic (unchanged behaviour). |
| `index.ts:97` `quizCategories` | maps `QUIZ_CATEGORIES` | Maps `getTopics()` (§7). |
| `adminGames.ts:48` topics list | `QUIZ_CATEGORIES.map` | `getTopics().map` (ids/counts stay; labels come from `GET /api/admin/topics`, §12). |
| Content draw path (`room.ts:504`) | derives category from room settings | **No new check needed**: `contentNeeded` builds the request from settings, which are catalogue-gated at configure/switch/start. An unknown category draws zero questions anyway — no bypass. |
| Stats / game results (server) | `community.ts`, `stats.ts`, `matches`, `daily_counts` `topic:<id>` | Audit result: all string-generic — no 12-assumption. `questionStats`/`question_reports` keyed by question id — unaffected. Content rules that special-case ids (`"bible"` verse, `"quran"` reference) stay id-based and untouched — rename-safe by rule. |
| Label/art/colour lookups (client) | scattered `QUIZ_CATEGORIES.find(…)` / `TOPIC_STYLES[…]` — complete list: `matchInfo.ts:20`, `StatsPage.tsx:43,46,332`, `RoomScreen.tsx:594,652`, `FriendsScreen.tsx:533`, `admin/{Analytics,Dashboard,Rooms,Reports,Games,questionParts,Content}`, `games/quiz/{QuizScreen,EliminationScreen,TopicPicker}` | Single client lookup with the chain: live catalogue → shipped constant → raw id (`?? id`, the pattern already used in `Reports.tsx:21`, `Rooms.tsx:21`, `questionParts.tsx:11`). `StatsPage.tsx:332`'s per-topic chart rows must map the live catalogue so new topics appear. |

`DEFAULT_QUIZ_SETTINGS.category = "bible"` stays valid (seeded).

## 10. Empty topic (explicit definition)

**Playable/empty (browse `Coming soon`, playable counts):** a topic is *empty* when it has
**zero in-play questions** across **both** sources — the shipped bank merged with
`custom_questions` (`loadBank`) — after removing questions out of play under the **existing**
lifecycle only (`outOfPlay`: admin-retired + reported-out; `adminQuestions.ts:103`
`play === "in_play"`). No new status/draft/disabled concepts are invented.

**Deletion guard:** a topic *has questions* when —
`EXISTS (SELECT 1 FROM custom_questions WHERE category = ?)` **OR** the shipped bank
contains any question with that category. Deliberately both tables/sources: a schema-rejected
custom row must not make a topic look deletable, and shipped questions are in code, not D1.
Any hit → `409`, no cascade. (Retired/out-of-play questions still count as *associated* —
they are content history, not deletable-when-empty.)

The browse UI shows `Coming soon` (disabled) **iff** playable count is 0. `TopicPicker`'s
existing "Soon" logic keeps working off the same playable counts.

## 11. Web — public pages

**`apps/web/src/pages/TopicsPage.tsx` — rewrite:**

- Delete `POPULAR` (`:12`), the chips row (`:83`), the per-tile question count (`:110`).
- One grid, rendered directly in the API's `sort_order`: artwork (`art`), name, tagline;
  tile wash from `colors` via `cardWash`.
- Disabled + `Coming soon` badge when playable total is 0 (and not currently starting).
- Search box stays (filters by name).
- Data source returns an **ordered array of section-agnostic items**; nothing in the page or
  API shape assumes the grid can never later be partitioned into sections.

**`apps/web/src/games/quiz/TopicPicker.tsx`:** map the **fetched** list (order and all) —
today it maps the static `QUIZ_CATEGORIES` (`:55`) and only borrows the fetch for the empty
check. New topics therefore appear in the lobby picker automatically.

**Client lookup module — `apps/web/src/topics.ts` (new):**

- `useTopics("public" | "admin")` hook (wraps the existing `useLoaded` pattern) → public
  pages call `/api/quiz/categories`, admin pages `/api/admin/topics` (both effectively
  fresh; admin is `no-store`).
- `invalidateTopics()` after any admin topic mutation → components refetch.
- `topicInfo(id)` / `topicName(id)` / `topicStyle(id)`: live catalogue → shipped constant →
  (`id` / generic style). Used by every scattered label site: `matchInfo.ts:20`,
  `StatsPage.tsx` (name lookup, `topicArt`, and its per-topic chart rows at `:332`), `RoomScreen.tsx:594,652`,
  `FriendsScreen.tsx:533`, `admin/{Rooms,Reports,Dashboard,Analytics,Games,questionParts}`.
- Game screens (`QuizScreen`, `EliminationScreen`, `TopicPicker` tile art) take
  `colors`/`art` from the catalogue, falling back to derived `TOPIC_STYLES`, then generic.

## 12. Web — admin

**Nav (`admin/AdminApp.tsx:46`):** new entry `{ id: "topics", label: "Topics", icon: … }`
directly after `games`, plus its render case and a new `admin/Topics.tsx` (reuses an icon
already in the `Icon` set).

**`admin/Topics.tsx` (new):**

- List from `useTopics("admin")`: art thumb, name, tagline, question count, actions.
- **Create**: name (+ optional tagline/colours) → `POST`. Slug is server-generated — the
  admin never types an ID.
- **Edit**: name, tagline, two colour fields (prefilled, editable) → `PATCH`. ID shown but
  read-only.
- **Replace artwork**: file input → browser resize/colour-extract (§8) → `PUT`.
- **Delete**: enabled only when `questionCount === 0` (otherwise disabled with "Has
  questions"); confirms; surfaces a `409` as an inline error. 
- Every mutation: `invalidateTopics()` + refetch → **the new topic is selectable in the
  question editor immediately, no deployment needed** (both screens read the same live
  catalogue; admin endpoints are `no-store`).

**`admin/Content.tsx` (`:224`, `:448` question editor/filter dropdowns):** options from
`useTopics("admin")` instead of `QUIZ_CATEGORIES`; default state uses the first live topic.

**`admin/Games.tsx` (topic switches, `:48`,`:240`):** switch list built from
`useTopics("admin")` (includes off topics); counts/last30 joined from the existing
`GET /api/admin/games` by id (whose server side now maps `getTopics()`).

## 13. End-to-end acceptance workflow (no deployment tricks)

Create topic in Admin → it appears in `GET /api/admin/topics` (cache invalidated) → it
appears in the question editor's dropdown and the import's name matcher → questions are
added/imported under its immutable id → playable count > 0 flips it from `Coming soon` →
player browse grid shows it (art, name, tagline, `no-store` fetch) → lobby picker lists it →
a game starts with it.

## 14. Testing

**Unit**

1. **Migration seed** — parse `0020_topics.sql` and assert it seeds exactly the 12 shipped
   ids, names, colours, taglines and `sort_order` 1–12, matching `QUIZ_CATEGORIES`
   (catches seed/fallback drift).
2. **Create** — `slugify` (case/punctuation/empty fallback to `topic`, ≤ 40 chars);
   collision resolution `biology` → `biology-2` → `biology-3`; `sort_order = MAX+1`.
3. **Rename** — `name` changes, `id` untouched; questions (attached by id), stats and
   `matches` rows remain valid; `categoryOf` matches the new name and the id.
4. **Delete** — empty topic deletes; topic with bank questions → 409; topic with only
   custom questions → 409; schema-invalid custom row still counts (no accidental emptiness);
   `topics_off`/`quiz_defaults` cleaned; **no question rows deleted**.
5. **Cache** — create/update/delete/art each call `forgetTopics()` before returning (spy);
   `getTopics` re-queries after a mutation (fake-Env harness as in `bank.test.ts`);
   newly created topic visible on the very next read.
6. **Fallback (all-or-nothing)** — D1 ok → D1 rows only; D1 throws → complete shipped 12;
   D1 returns 0 rows → complete shipped 12; never a mix (construct a D1 result containing a
   subset and assert the fallback is not concatenated).
7. **Validation** — live ids pass; unknown ids rejected on `addQuestion`, import,
   `topicsOff`, `quizDefaults`, `configure`; `storedQuestionSchema` accepts a new-topic
   category (regression for the `fromRow` drop); `quizSettingsSchema` rejects empty/
   overlong/non-pattern strings; old hardcoded ids are not *required* anywhere.
8. **Existing updates** — `gameRules.test.ts` (new `topicIds` argument + unknown-topic
   swap cases), `adminImport.test.ts` (explicit topics argument), `content` tests
   (`QUESTION_FILES` exhaustiveness over the shipped 12), any test asserting a static
   12-only enum found by `pnpm test`.

**E2E (Playwright)**

9. **Seed** — after migrations, `/api/quiz/categories` returns the 12 seeded topics.
10. **Full loop** — admin creates "Biology" (slug auto-generated, shown read-only) →
    question editor dropdown contains it → add a question (and a CSV import row naming it)
    → browse page shows the tile (art fallback, name, tagline) enabled → lobby picker lists
    it → a game starts on it.
11. **Browse states** — fresh topic with no questions appears disabled with `Coming soon`;
    after its first playable question the next load enables it (`no-store` makes this
    deterministic). Chips/Popular are gone; search works.
12. **Rename** — rename a seeded topic with questions → old questions still play under it;
    label updates in admin and player UIs; id unchanged.
13. **Delete** — 409 path via `page.request.delete` on a topic with questions; empty
    created topic deletes and disappears from browse/admin lists.
14. Existing tests stay green: `e2e/quiz.spec.ts:100` still sees exactly 12 radios in the
    picker (seed), `e2e/admin.spec.ts:289` topic-off flow unchanged (public endpoint still
    filters off).

## 15. Docs

Update `docs/ARCHITECTURE.md`, `docs/QUESTIONS.md`, `README.md` wherever they state the
topic list is a fixed 12 / enumerate categories as code-only.

## 16. Rollout

Same procedure as the Bible ship: implementation committed on `main` in this worktree;
full CI (typecheck, unit, e2e — migration runs in the CI environment); push; verify live:
`/api/quiz/categories` shows 12 seeded rows with taglines/colours, the admin loop works on
the deployment, then StackDiary `report_session`.

## 17. Decisions taken where the amendments were silent

1. Public catalogue is `no-store` (forced by §3/§3 amendment — see §7) rather than
   shortening the TTL.
2. Admin list endpoint is a separate `GET /api/admin/topics` because the public endpoint
   must keep filtering off topics (`e2e/admin.spec.ts` depends on it) while admin UIs need
   the full list.
3. Art upload is a dedicated `PUT` (raw body) instead of piggybacking on `PATCH` JSON —
   keeps byte-signature validation and limits clean, mirroring `POST /api/rooms/:code/photo`.
4. New-topic default colours `["#6d5bff","#1a1747"]`; generic art `/art/games/quiz.webp`.
5. Seed `sort_order` = current `QUIZ_CATEGORIES` order (the amendment's "current sort
   order"); browse grid order changes from the old `POPULAR` order as a consequence of
   removing it (`quran` becomes visible).
6. Delete guard counts retired/out-of-play questions as associated (history is not
   "empty"), while `Coming soon` uses only playable questions.
7. Message strings: 409 body *"That topic has questions — delete them first."*; configure
   unknown-topic *"That topic isn't available. Pick another."*
