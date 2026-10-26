# AGENTS.md — Whizard

Whizard is a live multiplayer party-games site: friends join a room by link, code or QR and play the same challenge together, with live scores. Free to play, no sign-up required; optional passkey accounts keep stats and friend lists. This file is the working context for AI agents (Antigravity CLI, OpenCode and others) — read it before changing code. Current as of 2026-10-14.

## Stack and layout

- pnpm monorepo, GitHub `aristhegf/whizard`, production: https://whizard.aristhegf.workers.dev
- `apps/web` — React + Vite + TypeScript + Phaser SPA; page styles in `apps/web/src/styles/`
- `apps/server` — Cloudflare Worker: WebSockets, server-authoritative game state, Durable Objects (one per game room), D1, cron and rate limits; migrations in `apps/server/migrations/`
- `packages/` — `protocol` (shared types), `game-core` (game logic), `content` (quiz content)
- `e2e/` — Playwright; unit tests are colocated `*.test.ts` (Vitest)
- CI (`.github/workflows/ci.yml`): format check, lint, typecheck, unit tests, build and three sharded E2E jobs; the `deploy` job runs only on `main`; the `preview` job deploys PR branches (see below).

## Commands

```sh
pnpm install
pnpm dev             # applies local D1 migrations, then serves the app
pnpm format          # prettier --write . — ALWAYS run before committing
pnpm format:check
pnpm lint            # eslint .
pnpm typecheck       # every workspace package + e2e tsconfig
pnpm test            # vitest run
pnpm e2e             # playwright test
pnpm build           # production build (vite + Cloudflare plugin)
```

## Deployment and PR previews

- Every green push to `main` auto-deploys to production. Never push to `main`, merge a PR, or run a deploy without the user's explicit approval.
- Each PR gets a **live preview**: CI builds the branch and deploys it to a separate disposable worker, then comments the URL on the PR (currently https://whizard-pr-preview.aristhegf.workers.dev). Cloudflare never issues version preview URLs for workers that use Durable Objects (this one does), which is why the preview is a separate worker. The preview shares the production D1 database, so data created in it is live; production traffic itself is untouched until merge.
- `apps/server/wrangler.jsonc` must keep the placeholder D1 `database_id` (`00000000-…`) in git — CI substitutes the real id via `apps/server/scripts/use-remote-db.sh`. Never commit the real id.
- CI secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` in Settings → Secrets and variables → Actions.

## Current state (2026-10-26)

- **PR #64 was merged** — "Redesign game cards with amber play button and responsive grid" (commit `4141585`): game cards now feature the amber pill button and compact 4x2 responsive desktop grid.
- **PR #65 was closed** — "Polish Whizard game cards" (branch `feat/game-card-visual-redesign`): closed as superseded by #64.
- **PR #70 is open** — "feat(payments): integrate bachs.io payment gateway and pro plan import gating" (branch `feat/bachs-payment-pro`): includes Bachs multi-currency payments, Pro bulk import gating, solo mistake review, study dashboard, and community question bank discovery & forking.
- Recently merged and deployed: #58 (game taxonomy), #59 (first card redesign round), #60 (mobile Games page discovery layout), #64 (game cards redesign), #66 (AGENTS.md handoff), #67 (compulsory leaderboard presence), #68 (custom bank practice & multiplayer rooms), #69 (Word docx/doc/txt bulk import).
- `docs/OPENCODE_HANDOFF.md` (branch `docs/opencode-whizard-handoff`) is an older handoff document; where it conflicts with this file, this file wins.

## Working agreement

- Inspect `git status` / `git diff` first. Never discard, reset, stash or checkout over the user's local changes.
- Use a feature branch and PR. No merges, no deploys, no pushes to `main` without approval.
- Always run `pnpm format` (then lint, typecheck, tests) before calling work done — CI fails on formatting.
- Never call a UI change complete because the code committed: verify the actual render at desktop (1440x900) and mobile (390x844, plus a short 375x667) viewports with screenshots, and run the relevant tests/E2E.
- Keep the catalogue, game mechanics, routes, room/lobby/reconnection behaviour and accessibility intact unless explicitly asked to change them.
- Make focused changes; leave unrelated files alone.

## Product constraints in force (do not relitigate)

**Taxonomy (category order fixed):** All, Quiz, Brain Games, Puzzles, Word & Skill, Party & Social, Couples. Each game has exactly one primary category and at most one secondary — never force a secondary. Do not add unimplemented concepts to the live catalogue (Mental Maths, Letter Rush, ThinkAlike and friends are ideas only). Aptitude Practice stays separate from casual Brain Games. Current assignments live in `apps/web/src/catalog.ts` and `docs/GAMES.md`.

**Mobile Games page:** must stay one screen tall — no vertical page scrolling, and no scrolling inside the Game Categories sheet; all seven categories must fit without scroll; the sheet sits beneath (never covers) the visible game card; no giant Whiz mascot / featured Quiz hero card; the fixed bottom tab bar stays visible and never covers game content. Verify at 390x844 and 375x667, not just a tall viewport. On short screens prefer compact typography/spacing over scrolling or covering; if something genuinely cannot fit, report the measurements and propose a layout change instead of silently violating this.

**Desktop:** keeps its own compact catalogue grid (four columns, two rows). Desktop and mobile layouts are intentionally separate — do not unify them blindly.

**Visual direction:** premium playful identity — dark purple, luminous violet, warm yellow/orange actions, glossy game artwork, rounded cards. Game cards now follow the crowned neon-poster style from PR #64; judge it by the rendered result against the approved reference, not by reading the code.

## Key paths

- Catalogue and taxonomy: `apps/web/src/catalog.ts`, `docs/GAMES.md`
- Games page: `apps/web/src/pages/HomePage.tsx`
- Page styles: `apps/web/src/styles/pages.css`; shared layout/tab bar: `apps/web/src/ui/Chrome.tsx`, `apps/web/src/styles/base.css`
- Worker/game rooms: `apps/server/src/`, config `apps/server/wrangler.jsonc`
- Architecture and product docs: `docs/ARCHITECTURE.md`, `docs/GAMES.md`, `docs/QUESTIONS.md`

## Local machine notes (Windows, this box)

- ~12 GB RAM total: a local `pnpm build` can die with a Rolldown OOM — if it does, let CI be the build authority rather than forcing it locally.
- For root-level eslint/tsc on a tight machine: set `NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=8"` and run package typechecks sequentially.
- PowerShell quirks: `gh --jq '…'` breaks (inner quotes get eaten) — fetch raw JSON and parse it instead; writes under `$env:TEMP` / `AppData` are blocked — keep scratch files inside the repo and delete them before committing.
- A dev/preview server is often already running on http://localhost:4173 (check before starting another).
