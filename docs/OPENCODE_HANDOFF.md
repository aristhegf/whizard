# Whizard — OpenCode Handoff

**Purpose:** Shared source of truth for continuing Whizard work with OpenCode. Read this before changing UI code.

## Working agreement

- OpenCode is the primary implementer for UI/design work. ChatGPT is the planning/review partner; do not assume ChatGPT can see OpenCode's terminal session, unsaved buffers, local filesystem, or live reasoning.
- Avoid parallel edits to the same files. Before doing anything, inspect `git status --short --branch`, `git diff`, and `git diff --cached`. Preserve the user's local changes. Do not reset, stash, checkout over, or discard them without asking.
- Use a feature branch and PR. Do not merge/deploy until the user approves. Run the repository's checks and E2E tests.
- **Always format with Prettier** and make the repository's formatting CI pass. CI has failed on formatting before; run the project's format/check scripts instead of guessing.
- Make focused changes. Keep the real catalogue, game mechanics, routes, room/lobby/reconnection behaviour and accessibility intact unless explicitly asked to change them.
- Never say a UI change is complete solely because code was committed. Verify at desktop and phone viewports, preferably with screenshots and E2E tests.

## Stack and repository

- Repository: `aristhegf/whizard`
- Monorepo using pnpm.
- Web app: React + Vite + TypeScript.
- Server: Cloudflare Worker, Durable Objects, D1; multiplayer uses server-authoritative game state and WebSockets.
- Shared packages include `protocol`, `game-core`, and `content`.
- Production site: https://whizard.aristhegf.workers.dev
- GitHub Actions CI checks formatting, lint, typecheck, unit tests, build and three E2E shards. Main's prior deployment after the Games card redesign passed these checks and deployed successfully. Do not assume later PR changes have deployed.

## Decisions already made

### Game taxonomy

The seven agreed categories are, in this order:
1. All
2. Quiz
3. Brain Games
4. Puzzles
5. Word & Skill
6. Party & Social
7. Couples

Each game has exactly one primary category and at most one secondary category. Do not force a secondary category when it doesn't fit. Category overlap is for discovery; each game has one canonical ID/implementation. Couples is a first-class category. Do not add unimplemented concepts to the live catalogue. Aptitude Practice remains separate from casual Brain Games.

Current catalogue assignments:
- Quiz: Quiz primary, Party & Social secondary
- Jigsaw: Puzzles
- Word Rush: Word & Skill
- Memory: Word & Skill, Puzzles
- Logic (Sudoku game; retain the existing `logic` ID): Puzzles, Brain Games
- Connections: Puzzles, Brain Games
- Reaction: Word & Skill
- Spot It: Word & Skill, Puzzles
- Most Likely To: Party & Social
- How Well Do You Know Me?: Couples, Party & Social
- Impostor: Party & Social

Future ideas such as Mental Maths, Sequences, Riddles, Logic Grid, Brain Teasers, Letter Rush, ThinkAlike, ClueScale, Last Brain Standing, Decoded, Bingo, Predict Me, Who Knows Who Better, This or That and Couple Quiz are not to be added as live catalogue games until implemented.

### UI direction

- Premium, playful Whizard identity: dark purple, luminous violet, warm yellow/orange actions, glossy colourful game artwork, rounded cards.
- The approved reference for the Games page shows a desktop four-column, two-row grid of compact cards, with artwork, title, short description, player count and circular yellow play button.
- The mobile view is a distinct, single-screen experience; it must not simply inherit an oversized desktop feature/hero card.
- User explicitly said the gigantic Whiz mascot/featured Quiz card must be gone from the mobile Games page.
- Keep desktop and mobile layouts intentionally separate when necessary. Preserve the desktop four-column catalogue grid.

## Current mobile Games page requirement — high priority

The mobile Games page must remain **one screen tall**. The document/page must not vertically scroll to reveal games or controls. The fixed bottom tab bar must remain visible and must not cover important game content.

Expected behaviour:
1. Default category is All Games.
2. Show the page heading/subtitle and a compact game card/rail immediately; no oversized mascot/Quiz hero card.
3. Provide a dedicated **Categories** control on mobile.
4. Tapping Categories opens a bottom sheet titled **Game Categories**. It lists all seven agreed categories, with selected category highlighted and a checkmark.
5. The sheet must sit beneath the visible game card, not overlay/cover it. This is a deliberate layout constraint based on the user's reference image.
6. The category list must not scroll. Fit all seven rows by adapting the sheet and row heights to the viewport. On shorter screens, compact the layout rather than making the sheet scrollable or covering the game card.
7. Choosing a category filters the visible game rail and closes the sheet. Default remains All until the user chooses otherwise.
8. Close/dismiss leaves the selected category unchanged.
9. Horizontal swiping between game cards is fine; vertical scrolling of the mobile Games page and vertical scrolling inside the category sheet are not.
10. Test at realistic viewports, including 390x844 and a short viewport (e.g. 375x667), and check the bottom tab bar/safe-area insets. The requirement is not satisfied if only a tall mockup looks correct.

There is a genuine geometry trade-off on short screens: heading, category trigger, one card, tab bar and seven category rows must all fit without overlap. Prefer compact typography/spacing and a deliberately sized sheet; don't solve this by covering the card or enabling vertical scrolling. If a design truly cannot fit at a specific viewport, report the exact measurements and propose a concrete layout adjustment rather than silently violating the requirement.

## Current GitHub state / handoff warning

- Taxonomy PR #58 was merged into main. Main CI and deployment succeeded after that merge.
- The card redesign PR #59 was merged into main as commit `70c4f6a8fd633f0af0137db34d7083e0034a611a`; main CI, E2E and deployment succeeded.
- PR #60, titled **“Fix mobile Games page discovery layout”**, is open: https://github.com/aristhegf/whizard/pull/60
- Branch: `fix/mobile-games-discovery`
- The latest branch changes are **unmerged and not yet confirmed deployed**. They modify:
  - `apps/web/src/pages/HomePage.tsx`
  - `apps/web/src/styles/pages.css`
  - `e2e/settings.spec.ts`
- The latest intended direction on PR #60 is to remove the mobile featured card, add a compact filtered game rail, add a dedicated category sheet, and test single-screen behaviour. Treat it as a proposal to review, not a finished or approved implementation. Check the live PR diff and CI before reusing it.
- The user says UI work may already be underway in their local OpenCode session. **Inspect local state first. Do not overwrite the user's local UI work or merge PR #60 blindly.** Compare local changes with PR #60, explain conflicts/overlap, and recommend one coherent implementation path.

## First actions for OpenCode

1. Inspect local branch, status, staged/unstaged diff, recent commits, and any active work. Preserve everything.
2. Fetch/read this handoff and inspect PR #60's current diff/status.
3. Compare the local UI work with PR #60. Do not make edits until you understand whether local changes overlap.
4. Report a short plan to the user: which implementation will be the source of truth, which files need changes, and how the one-screen requirement will be verified.
5. Continue the user's local design direction where it does not conflict with the explicit product requirements above. OpenCode is preferred for visual design; use this document as constraints, not as a demand to reproduce a particular implementation.
6. Run Prettier, lint, typecheck, unit tests, build and relevant E2E tests. Capture screenshots for mobile and desktop if available.
7. Push a feature branch and open/update a PR. Wait for the user's approval before merging.

## Relevant paths

- Catalogue and taxonomy: `apps/web/src/catalog.ts`, `docs/GAMES.md`
- Games page: `apps/web/src/pages/HomePage.tsx`
- Main page styles: `apps/web/src/styles/pages.css`
- Shared layout/top navigation/tab bar: `apps/web/src/ui/Chrome.tsx`, `apps/web/src/styles/base.css`
- Existing E2E coverage: `e2e/settings.spec.ts`

## Design principle

Do not spend time arguing that a technically responsive page is equivalent to the approved design. Compare the actual rendered output against the user's references. Preserve the user's current local design exploration, but enforce the agreed functional constraints and single-screen behaviour.
