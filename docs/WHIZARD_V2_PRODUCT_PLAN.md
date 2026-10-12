# Whizard V2 — Product Plan (Draft)

**Status:** Discovery/planning only. Not approved for implementation.
**Purpose:** Define a coherent V2 direction for Pro study tools, personal dashboards, user-owned question banks, document-to-quiz conversion, solo practice, and multiplayer study rooms.
**Revision note:** Revised after a repository review (documentation-only). Claims about the existing system are verified against this codebase and cited in §13; nothing in this document authorizes code, schema, configuration, pricing-page, or deployment changes.

## How to read this document

Every substantive statement is tagged so product and engineering readers can separate what is from what should be and what is still undecided:

- **[Existing]** — verified in this repository at review time. Cited by path (and symbol) in §13. Not a proposal.
- **[Recommendation]** — a proposed change to the plan or a proposed future implementation direction. Requires product-owner approval; not authorized work.
- **[Open decision]** — unresolved on purpose. Options and trade-offs are documented; no vendor, product, queue mechanism, storage tier, or solo-practice architecture has been selected.

## 1. Product thesis

Whizard should remain a fun, accessible multiplayer game platform while adding a serious study workflow for people who want to practise from their own material.

**Positioning hypothesis:** Play for free. Build and manage your own study system with Pro.

The product should let a student or tutor turn existing past-question material into a reviewed, reusable question bank, then practise alone or invite others to play it through Whizard's familiar game experience.

Whizard should not become a generic document editor or attempt to author every exam's content itself in the first release. The initial value is turning user-owned material into structured practice with a good review workflow and engaging play modes.

## 2. Existing decisions to preserve

- Whizard's ordinary multiplayer experience stays free.
- The established room size is up to 20 players; do not silently change this limit. **[Existing]** The cap is enforced in three places — `MAX_PLAYERS` in `packages/game-core/src/room.ts` (validated in `configureRoom` and on join), the protocol settings schema in `packages/protocol/src/index.ts` (`.max(20)`), and the host capacity picker in `apps/web/src/RoomScreen.tsx`. Any future change is a cross-cutting change, not a settings tweak.
- Monetize serious creation and management of custom questions rather than charging every participant.
- Previously discussed free/paid positioning: “Free to play. Free to start creating. Pay when you need serious creator tools.”
- Manual question entry and CSV import/export have already been discussed as custom-content workflows. **[Existing]** Admin-only CSV/JSON import already ships (`apps/server/src/adminImport.ts`, mounted at `POST /api/admin/questions/import`, capped at 1,000 rows / 1 MB, two accepted header shapes documented in `docs/QUESTIONS.md`). No export exists anywhere in the product.
- A prior Pro price of about ₦5,000/month was only a hypothesis, not a decision. Validate willingness to pay before fixing price or limits. **[Existing]** The same figure and a full feature list are already published on the live pricing page (`apps/web/src/pages/PricingPage.tsx`); see the reconciliation workstream in §6 and risk R11.
- Friends should be able to join an invited quiz without needing to subscribe to Pro; investigate whether an account should be required to join, but do not introduce unnecessary account friction. **[Existing]** The product already answers this: room join is nickname-only for guests, guest identity is first-class (`guest_id` on `match_players`, guest match history kept ~1 week so it can attach to a later account), and the pricing FAQ states that friends need no account. Treat "no account required to join" as a shipped decision, not an open question. What remains open is the account requirement to _create and own banks_ — see §4F and G2.
- Keep the current catalogue, existing games, multiplayer rooms, room lifecycle, reconnection and game mechanics stable. V2 should extend them rather than replace them.
- V2 is a proposal, not permission to implement features or change the production app yet.
- **[Existing]** Additional shipped behaviour to preserve: passkey-only authentication with no passwords and no email field; a DB-backed global site-switch mechanism (`site_settings`, exposed via `GET /api/site`, enforced at room creation, game start and signup) as the only feature-flag mechanism; admin-recorded NGN payments with a reserved provider slot and no payment processor; the `custom_questions` D1 overlay that layers admin edits/additions over the question bank compiled into the Worker; per-viewer repeat avoidance via `seen_questions`; and the moderation surface (`blocked_words`, `recent_names`, question reports and retirement, admin-only routes under `/api/admin/*`).

## 3. Target users and jobs to be done

### Students preparing for exams

Examples include GMAT candidates and ICAN candidates, plus students preparing for other professional, university or certification exams.

- Import their own past questions and study documents.
- Correct the extracted questions before using them.
- Organize questions by exam, subject, topic, year or difficulty.
- Practise alone, repeat mistakes and see progress.
- Run a room with friends or classmates using the same approved question set.

### Tutors and study-group organizers

- Build and maintain reusable question banks.
- Create a room from a chosen set without rebuilding the quiz every time.
- Invite learners and review group performance.
- Share or reuse a question set under clear permissions.

### Existing Whizard creators

- Create custom quizzes with less manual effort.
- Save, duplicate, edit and organize their own quizzes.
- Upgrade when their creation, import or analysis needs exceed the free tier.

## 4. Proposed V2 feature areas

### A. Personal dashboard

A signed-in user's study home, distinct from the public community Stats page.

Potential sections:

- Continue practising / recently used banks.
- My question banks and quizzes.
- Recent sessions, scores and attempt history.
- Topic-level performance and areas to revisit.
- Saved or starred questions.
- Study activity over time.
- Entry points to import material, create a quiz or start a solo/multiplayer session.

Avoid vanity metrics that don't help a learner act. Every dashboard metric should support a useful next step.

**[Existing]** Grounding: the public community Stats page ships at `/stats` (`apps/web/src/pages/StatsPage.tsx`, fed by `GET /api/community` and cached); an account area already exists at `/account` (profile, match history, passkeys, data export) alongside `/friends` and `/groups`. **[Recommendation]** The dashboard must be a distinct study home that composes with — not duplicates — the account area, and must reuse the existing analytics collection pattern (`daily_counts`) rather than introduce a new analytics stack.

### B. Custom Quiz Studio

A workflow for creating a structured, editable question bank from several inputs:

- Manual entry.
- CSV import/export. **[Existing]** Import parsing already exists in admin tooling (`apps/server/src/adminImport.ts`); export does not exist anywhere.
- Document upload, with the exact formats selected after a technical spike. Candidate formats for evaluation: text-based PDF, DOCX, XLSX/CSV and pasted text. Scanned PDFs/images may require OCR and should not be promised until tested.
- Later: images or diagrams attached to questions, where useful and technically supportable.

Suggested workflow:

1. Choose “Create question bank” and give it a name, exam/course and optional subject/topic metadata.
2. Upload or paste source material, or use manual/CSV entry.
3. Show extraction/import progress and clearly report any unsupported or failed content.
4. Parse into editable question records.
5. Let the user review every question and answer, correct formatting, choose the question type, and confirm correct answers/explanations. Do not publish unreviewed extraction as authoritative.
6. Validate missing answers, duplicate questions, broken options and unsupported layouts.
7. Save a draft bank; the user can return later.
8. Publish/activate the approved bank and choose a practice mode.
9. Preserve the source and allow the user to edit, duplicate, export or delete the bank.

Question schema to evaluate: prompt, question type, options, correct answer(s), explanation, topic, difficulty, source page/reference, optional image/media, tags, provenance and review status. Keep it extensible without overengineering.

**Trust requirement:** Extraction can be wrong. The UI must show source context where possible and make review/correction an explicit part of the workflow. Never imply the model has verified the academic correctness of extracted answers.

**[Existing]** Grounding — three constraints the schema work must confront (all verified, see §13):

1. The shipped question schema is rigid: `PROMPT_MAX = 120`, `CHOICE_MAX = 40`, `EXPLANATION_MAX = 160` characters, **exactly four choices with the first correct**, single answer (`packages/content/src/schema.ts`, `storedQuestionSchema`). Real GMAT/ICAN items routinely exceed a 120-character prompt; four options/one answer excludes true-false, multi-select and fill-in types.
2. `custom_questions` (D1) is an **admin overlay with global replacement semantics** — a row whose id matches a shipped bank question replaces it; it has no owner column (`apps/server/migrations/0013_question_bank.sql`). It is the wrong home for user-owned banks. **[Recommendation]** User banks get new owner-scoped tables (see G2), not an extension of this overlay.
3. Admin import caps (1,000 rows / 1 MB) and its two CSV header shapes are a starting point for user import, not a finished user-facing contract.

Extending the schema fans out into game-core quiz scoring, the protocol game view, admin import, content quality tests and e2e. Gate G1 prices this before any build.

### C. Practice modes

Minimum proposed modes:

- **Solo practice:** user answers at their own pace or under a timer, sees feedback according to the chosen mode, and can resume or retry.
- **Multiplayer room:** host selects a bank and settings, creates a room, and invites others; existing free room/player rules continue to apply.
- **Review mistakes:** retry missed questions and optionally build a practice session from them.
- **Timed set:** optional timed attempt with a clear start/end and result summary.

Do not promise advanced adaptive testing or official exam simulation in the first release. First validate that importing, reviewing, saving and playing a question bank is reliable.

**[Existing]** Grounding: there are no `/api` solo-practice or attempts routes today. End-to-end "solo play" is a one-player room driven through the per-room Durable Object (`e2e/quiz.spec.ts` "plays a solo quiz…"). Rooms select content by topic id and draw questions server-side; each connected client receives only the current stage of the game view (server holds and validates answers). WebSocket budgets are 4 KB client→server and 1 MB server→client (`packages/protocol/src/index.ts`, `MAX_MESSAGE_BYTES` / `MAX_SERVER_MESSAGE_BYTES`) — adequate for per-question views, not a channel for bank review or bulk import.

**[Open decision] Solo-practice architecture (blocks Phase 1).** No selection has been made. Options with trade-offs:

| Option                                                     | Pros                                                                                                                                        | Cons                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Via a one-player room DO                               | Reuses server-authoritative scoring, fairness allowances, reconnection and the existing game engine; one code path for solo and multiplayer | Consumes Durable Object time for solo study; resume semantics are room-lifecycle-shaped, not attempt-shaped; couples practice to multiplayer limits       |
| (b) HTTP attempts API with client-side scoring             | Cheap and simple; natural fit for "at your own pace", resume and offline-tolerant flows; independent of room caps                           | Results are self-reported (fine for personal practice, weak if tutors or Pro analytics depend on integrity); new persistence and API surface from scratch |
| (c) Hybrid (client-paced play, server-verified submission) | Integrity where it matters with most of (b)'s cost profile                                                                                  | Two scoring paths to keep consistent; more design work up front                                                                                           |

Decision criteria: cost per practice session, blast radius on the free multiplayer path, resume/retry fidelity, whether results feed tutor/Pro analytics (integrity requirement), and how much new API surface Phase 1 can absorb. Choose at the Phase 0 gate (G9), not during implementation.

### D. Question-bank management

- List/search/sort personal banks.
- Organize by exam, subject, topic, tags or folders if justified.
- Edit, duplicate, archive and delete.
- Save drafts separately from published/usable banks.
- Export to CSV or another supported format to reduce lock-in.
- Explicit ownership and permissions: private by default; sharing/inviting is an intentional action.
- Consider shared banks or tutor/student libraries as a later phase.

**[Existing]** Grounding: account-level data export (`exportMe` in `apps/server/src/account.ts` — matches and social data as JSON) and account deletion (`deleteAccount` — anonymizes match/payment/report rows, deletes per-user rows, cascades via FKs) already exist and define the pattern. **[Recommendation]** Banks, attempts and uploaded source files must be added to both paths; bank deletion should cascade `ON DELETE CASCADE` in the same style as existing user-owned tables (`0001`, `0003`, `0004`).

### E. Results and learning analytics

Start with understandable, trustworthy metrics:

- Score and accuracy per attempt.
- Correct/incorrect/unanswered counts.
- Time spent, where measured reliably.
- Performance by topic/difficulty when those fields exist.
- Missed-question review.
- Progress across attempts on the same bank.
- Multiplayer room results separated from personal solo history.

Avoid claiming that a learner has mastered a topic from a small sample. Explain the basis for any insight and allow users to see the underlying attempts.

**[Existing]** Grounding: finished multiplayer games are recorded in `matches` / `match_players` (with `user_id` or `guest_id`, category, mode, scores) — there is no per-attempt table for bank practice, and `matches` has no bank reference. Product-wide counting uses the `daily_counts` table with a metric-prefix convention (`page:`, `topic:`, `game:`, `mode:` — see `0006_analytics.sql`), surfaced through admin analytics. **[Recommendation]** Solo/bank attempt history is new persistence shaped by the G9 decision; new operational counters (e.g. `import:ok`, `import:fail`) extend `daily_counts` rather than adding an analytics vendor.

### F. Pro and free access model

Preserve free access to the core social game. Evaluate limits only after estimating infrastructure and support costs.

Potential free:

- Play existing Whizard games.
- Create/join ordinary rooms within existing rules.
- Basic manual custom quiz creation, or a small starter allowance of custom content.
- Join a Pro creator's room without paying for Pro.

Potential Pro value:

- Larger or more numerous personal question banks.
- Document/bulk import and export.
- Reusable libraries, duplication and organization.
- Saved solo practice history and richer study dashboard.
- Mistake review and topic analytics.
- Advanced practice settings.
- Potentially image-rich questions and sharing controls, subject to technical validation.

These are hypotheses, not locked entitlements. Define exact limits, abuse controls, storage limits, and conversion points only after estimating cost and testing user demand. Do not make room participants pay to join.

Potential later organization/tutor tier:

- Shared team libraries, class/group management, tutor controls, cohort analytics and larger events.
- Keep this separate from the first student-focused Pro release unless validation shows a clear launch customer.

**[Existing]** Grounding — three monetization gaps that shape scope (all verified, see §13):

1. **Entitlements are data, not enforcement.** `pro_memberships` exists and is read only by the admin payments list and the user's own `/api/me` payload. No route gates any feature on Pro today.
2. **No payment processor.** Payments are admin-recorded rows with hard-coded NGN currency and a reserved `provider: null` slot. Phase 2's "payment lifecycle" therefore includes provider evaluation, webhooks, a single server-side entitlement helper, receipts, cancellation and refund handling — not just wiring a button. **[Open decision]** No provider is selected; see G-open items in §7.
3. **No email and passkey-only auth.** The `users` table has no email column. A paid product must decide how paying users receive receipts, how they recover access (currently: a second passkey), and how support reaches them. **[Open decision]** Adding a contact channel is a privacy/policy change, not a schema-only change.

## 5. Core user journeys to map

1. New student creates an account (passkey) → creates a bank → imports a past-question file → reviews extracted questions → saves the bank → starts solo practice → reviews mistakes → returns to dashboard.
2. Student creates a bank → chooses multiplayer practice → configures quiz → shares room code/link → friends join as ordinary players (nickname only, no Pro, no account required) → host runs the game → everyone sees appropriate results.
3. User with an existing bank edits/duplicates it → chooses a new topic subset → starts another attempt without re-uploading.
4. Tutor creates a bank → shares a session with a group → participants join → tutor sees only the analytics/identities permitted by the product's privacy rules.
5. User encounters import limitations → receives actionable feedback and can fall back to pasted text, CSV or manual entry.

For each journey, define loading, empty, error, cancel/retry, duplicate, permissions, and mobile states. **[Existing]** Note the existing e2e suite is mobile-only (single Pixel 7 project) — desktop states need explicit coverage in the test strategy.

## 6. Phased plan to evaluate

### Phase 0 — Discovery and technical spike

- Interview students/tutors, especially GMAT and ICAN candidates, to validate the highest-value workflows.
- Collect representative, permissioned sample files with varied layouts.
- Test extraction quality, answer association, tables, formulas, multi-column pages and page references.
- Decide which input formats are supportable at launch.
- Estimate cost per import, storage, processing latency, abuse risk and expected usage.
- Write acceptance criteria and a cost-aware plan before building.

### Phase 0 gate — architecture decisions required before any schema or feature build

The repository questions in §7 have been inspected; the results below are **exit criteria** for Phase 0. No implementation task in Phase 1 may start until each gate item is resolved and recorded. None of these gates selects a vendor, product, queue mechanism, storage tier or solo architecture — they define what must be decided, the options, and the criteria.

**G1 — Question schema extension.** Current state **[Existing]**: four fixed choices, first-correct, tight length caps (§4B). Decision: extend the stored/game schema (new question types, variable option counts, longer prompts) versus constraining V2 banks to the current shape and documenting the limitation. Trade-offs: extension touches game-core scoring, protocol views, admin import, quality tests and e2e; constraint is cheap but excludes much real exam material. Exit criteria: chosen schema with explicit field limits; a written list of supported question types for MVP; estimated fan-out (files/modules) and test impact; decision on whether shipped-bank schema and user-bank schema may diverge.

**G2 — Bank ownership model.** Current state **[Existing]**: no owner-scoped content tables exist; `custom_questions` is a global admin overlay without an owner column. Decision: new owner-scoped tables (recommended direction: `question_banks`, `bank_questions`, `import_jobs`, plus attempt tables shaped by G9) with `owner_user_id` FK and `ON DELETE CASCADE`, versus overloading the overlay. Exit criteria: proposed table/column list with ownership, status (draft/published), timestamps and provenance fields; explicit confirmation that user banks never write to `custom_questions`; cascade behaviour added to `deleteAccount` and `exportMe` paths.

**G3 — ID namespacing.** Current state **[Existing]**: question ids are a single global namespace; `seen_questions` (per-viewer repeat avoidance) and `question_stats` / `question_wrong_picks` are keyed by raw question id; a `custom_questions` row may replace a shipped question by id. Decision: how user-bank question ids are namespaced or partitioned so they can never collide with shipped ids or admin overlay ids. Exit criteria: id scheme (e.g. prefixed or partitioned keys) applied consistently to `seen_questions`, stats tables and any future sharing; documented behaviour when a bank is deleted and its ids disappear from dedupe history.

**G4 — Room content-source routing.** Current state **[Existing]**: quiz rooms select content by `category` (topic id validated against the live D1 catalogue) and draw from the shipped bank plus the admin overlay, server-side, per game start. Decision: how a room declares a user bank as its source (e.g. a bank reference plus snapshot/version in room settings) without moving large question payloads into shared room state or breaking existing topic-based rooms. Exit criteria: settings/protocol delta and version-bump plan (`PROTOCOL_VERSION` is currently 10); snapshot semantics (a room plays the bank as it was when the room was created); compatibility story for topic-based rooms and old clients; confirmation that clients still receive only the current game stage.

**G5 — Storage for uploads and generated assets.** Current state **[Existing]**: no object-storage binding exists (R2 is mentioned in the README as "later" only); current precedents are D1 BLOB columns (topic artwork) and Durable Object storage (host photos in the room DO). Decision: where uploaded source documents, extracted artifacts and optional question images live, with retention and deletion rules. Trade-offs: D1 BLOBs are simple but bloat the database and hit row/size limits; DO storage is room-scoped and ephemeral by design; a dedicated object store adds a binding, access-control surface and cost model. Exit criteria: chosen tier with size limits, retention/cleanup job, access-control story (only owner reads), and deletion wired into account/bank deletion. No vendor selection required to pass the gate — tier and constraints are sufficient.

**G6 — Background jobs for import.** Current state **[Existing]**: no queue or workflow binding exists; the only scheduled work is a daily cleanup cron. Asynchronous import (upload → parse → extract → review queue) needs a durable job model. Decision: job mechanism (queue product, workflow product, Durable Object with alarms, or cron-driven D1 job table), retry/backoff policy, failure visibility to the user, and cost metering per job. Trade-offs: platform-managed queues/workflows add resilience with new bindings and cost; DO-driven jobs reuse existing patterns but couple job lifetime to room-style instances; cron polling is simplest but worst for latency. Exit criteria: chosen mechanism, state machine for a job (queued/running/needs-review/failed/done), retry and poison-file policy, and per-user rate/size limits reusing the existing per-IP rate-limit pattern.

**G7 — Feature flags and staged rollout.** Current state **[Existing]**: the only flag mechanism is global admin-controlled site switches (`site_settings`, 15-second cache, enforced server-side, exposed via `/api/site`) — no per-user or percentage rollout exists. Decision: how V2 features reach users before general availability (extend site settings with an allowlist; a new feature table; or ship globally behind Phase ordering). Trade-offs: allowlists are simple and auditable but manual; percentage rollout needs identity plumbing and is overkill for an early cohort. Exit criteria: mechanism chosen; V2's flags enumerated (studio import, solo practice, bank multiplayer, dashboard); who can flip them and how changes are logged (admin log pattern exists).

**G8 — Migration discipline.** Current state **[Existing]**: there is no staging environment; CI deploys `main` straight to production and applies D1 migrations to the production database before the deploy. Decision: the safety rules for V2 schema changes (expand/contract pattern, backward-compatible migrations deployable ahead of code, rollback story, and whether a preview/branch environment is required before Phase 1). Exit criteria: a written migration policy for V2 PRs; agreement on how a failed migration is handled given automatic application on merge; list of Phase 1 migrations in expand-only form.

**G9 — Solo-practice architecture (blocks Phase 1).** See options and criteria in §4C. Exit criteria: one option selected with the reasoning recorded; resulting attempt-history data model sketched; cost model for a typical solo session; confirmation that free multiplayer behaviour is unchanged.

### Parallel workstream — pricing-page capability reconciliation

**[Existing]** The live pricing page (`apps/web/src/pages/PricingPage.tsx`) currently advertises: Free — "Create custom quizzes manually (Limited)"; Pro — "Unlimited custom quizzes", "CSV question import", "Bulk question import and export", "Unlimited question bank", "Add images to questions", plus a comparison table and an FAQ answer stating spreadsheet upload works "with Pro". The Pro button itself already says "Coming soon". None of these creator features exist for end users today; the only custom-question tooling is admin-only.

**[Recommendation]** Reconcile published claims with shipped capability in a separate, UI-allowed workstream. This documentation phase does not change the pricing page (see §12). Options for the product owner:

| Option                                                                                   | Pros                                                                | Cons                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| (a) Soften/label live claims now (e.g. "Coming soon" tags on unshipped rows)             | Removes the gap between promise and product immediately; low effort | Touches live marketing copy; needs a decision on tone and timing                                      |
| (b) Sequence a minimal manual-creation + CSV import release ahead of the study-bank work | Makes existing claims true for the cheapest possible slice          | Duplicates effort if built outside the eventual bank model (G1/G2)                                    |
| (c) Leave copy as-is until V2 Phase 1 ships                                              | No near-term churn                                                  | Trust and consumer-protection risk while claims are live; support burden if users expect the features |

Decision criteria: trust risk of unbacked claims (noted as risk R11), cost of (b) overlapping G1/G2 decisions, and whether any paid Pro is being sold against those claims today (current Pro button is non-purchasing). Owner decision required; recommended default is (a) plus delaying (b) until G1/G2 settle.

### Phase 1 — Useful question-bank MVP

- Manual entry and CSV import/export.
- Document import for only the formats proven reliable by the spike.
- Editable review queue with source references and explicit confirmation.
- Save/edit/delete a personal bank.
- Solo practice, score summary and retry missed questions.
- Launch behind feature flags/limited access if extraction quality or cost remains uncertain (mechanism per G7).
- **Entry criteria:** G1–G9 resolved and recorded.

### Phase 2 — Shared practice and Pro dashboard

- Create a multiplayer room from an approved bank using existing room infrastructure (routing per G4).
- Invites and room join should not require participants to subscribe (already the shipped guest-join model).
- Personal dashboard, saved banks, attempt history and topic performance.
- Pro entitlements, usage limits, payment lifecycle, cancellations and account access behaviour — including the contact-channel/receipt decision from §4F.
- Operational monitoring for failed imports, processing costs and room/session reliability (counters via the `daily_counts` pattern).

### Phase 3 — Study-system improvements

Only after usage validates the need:

- Better review scheduling and mistake-based sessions.
- Shared/tutor libraries and group analytics.
- More question types/media.
- More sophisticated practice modes.
- Organization plans and additional exams/markets.

## 7. Architecture: verified answers and open questions

### 7a. Answers from repository inspection (were open questions in the previous draft)

- **How are user-owned resources and auth represented today?** Accounts are passkey-only (WebAuthn) with DB-backed sessions; guests join rooms with a nickname and a browser-held guest id. User-owned _content_ does not exist — every `user_id` foreign key in the schema belongs to accounts, social graph, matches or payments.
- **Which question/game models can be reused, and where is the source of truth?** Game logic is pure TypeScript in `packages/game-core` with per-game settings schemas; questions ship as JSON compiled into the Worker (`packages/content`) with a D1 `custom_questions` overlay for admin edits/additions (15-second bank cache); topics are D1-owned with the shipped twelve as fallback. The quiz engine, drawing (`drawContent`), seen-question avoidance, reporting and retirement machinery are all reusable _patterns_ for user banks, but the storage layer is not.
- **How are Pro entitlements checked server-side?** They are not. `pro_memberships` is written by admin payment routes and read only by the admin list and `/api/me`. A single server-side entitlement helper is required before any Pro-gated surface ships; client-only flags must never be trusted (the WebSocket identity header is already rebuilt server-side from the session cookie — that pattern extends).
- **How do we prevent unauthorized access to private banks and uploaded files?** No mechanism exists yet for content (no owner column anywhere in content tables). The account/session model and the `requireUser`/`requireAdmin` request helpers are the enforcement primitives to build on; every bank read/update/export/delete must check ownership server-side, and uploaded files need an access-controlled tier per G5.
- **How are duplicate submissions, malformed documents, oversized files and malicious files handled?** Partially answered: admin import already enforces row/byte caps and per-row validation messages; per-IP rate-limit helpers exist on room/join/presence/report routes and should be reused on upload/import endpoints. Malicious-file and deep-nesting defences for document parsing do not exist and must be designed in the spike (parse in a constrained context, never execute embedded content).
- **How can import processing be provider-independent where practical?** The admin import parser is already plain TypeScript with no AI dependency. Extraction (the document spike) should keep the same shape: a provider-agnostic interface with a default implementation, so the AI vendor (if any) is swappable and the manual/CSV paths never depend on it.

### 7b. Genuinely open questions (decision criteria, no answers assumed)

- **Should a bank be stored in D1, object storage, or a combination?** G5. Criteria: file sizes, retention, access control, deletion, cost per GB and per read, and operational simplicity on Cloudflare.
- **How are asynchronous import jobs run and retried?** G6. Criteria: durability across deploys, retry/backoff, user-visible failure states, cost metering.
- **Where should parsers run, and under what memory/CPU/duration constraints?** G6/G1. Criteria: Worker limits versus dedicated parse paths; behaviour on 50-page PDFs; no unbounded memory.
- **How are room settings/state mapped to a selected bank without huge question payloads in room state?** G4. Criteria: snapshot semantics, protocol compatibility, client message budgets (current server→client cap is 1 MB; clients only ever receive the current game stage today).
- **How are question-bank versions handled when a creator edits a bank after a room is created?** Snapshot-at-room-creation is the recommended direction (precedent: the room DO already holds per-room state and even binary host photos), but this is an **[Open decision]** tied to G4. Criteria: what a late joiner sees; what happens to an in-progress game if the bank is edited; whether stats key on bank version.
- **How are duplicate bank submissions, sharing permissions and cross-user access controlled?** Private-by-default is the plan's position; the permission model (owner-only in MVP; share links or explicit grants later) is an **[Open decision]** for Phase 2 design.
- **How does solo practice persist and resume attempts?** G9.
- **Which payment provider and currency strategy?** Not selected. Criteria: Nigerian payment reality (current pricing is NGN), webhook reliability, refund handling, payout/reconciliation for admin-recorded legacy payments, and fee structure against a ₦5,000/month price point.
- **What contact/recovery channel exists for paying users?** Not decided (§4F gap 3). Criteria: privacy posture, support load, passkey-loss incidence.

## 8. Privacy, copyright and academic reliability

- Treat uploads as private user data by default.
- Enforce ownership/authorization on every read, update, export and delete operation.
- Define file-size/type limits, retention, deletion and import-job cleanup.
- Do not train on uploaded content or share it across users without explicit consent and a clear policy.
- Ask users to upload material they are entitled to use; do not position Whizard as a way to distribute copyrighted exam books.
- Keep source references where possible and distinguish extracted content from verified answers.
- Make generated/extracted content editable and require review before it becomes a trusted question bank.
- Consider privacy implications of tutor dashboards and group performance data.

**[Existing]** Mechanisms to extend rather than reinvent:

- **Account export:** `GET` account export (`exportMe`, `apps/server/src/account.ts`) already returns matches and social data as JSON. Banks, attempts and import metadata must be added.
- **Account deletion:** `deleteAccount` already anonymizes or removes user rows in a defined order (matches keep scores but drop the player; payments keep amounts but drop identity; reports are de-attributed). Banks, attempts and uploaded files must be added to this cascade; payment records retain the existing anonymization behaviour.
- **Analytics privacy stance:** no raw IPs are stored; network-derived data is one-way coded; guest data is cleaned by the daily cron. V2 counters must follow the same conventions.
- **Moderation:** `blocked_words` and `recent_names` gate nicknames; question reports (`/api/questions/:id/report`) feed an admin queue with keep/retire decisions; retired questions are excluded from draws. **[Recommendation]** User banks are shareable user-generated content: extend the report/retire/takedown path to bank questions and define who reviews them (open operational decision — see R15), before any cross-user sharing ships.

## 9. Product success metrics

Activation:

- Percentage of new users who successfully import/create and approve a first bank.
- Time from starting import to a usable approved bank.
- Percentage who finish a first solo practice session.

Quality:

- Import failure rate and user correction rate.
- Question/answer association errors reported.
- Duplicate or unusable question rate.
- Processing cost and duration per successful import.

Engagement:

- Repeat practice sessions per active learner.
- Return rate to the same bank.
- Missed-question retries.
- Banks reused in multiple sessions.
- Multiplayer invites sent, join rate and session completion.

Business:

- Free-to-Pro conversion among users who create/manage question banks.
- Paid retention and cancellation reasons.
- Revenue and gross margin after processing/storage/payment costs.
- Support burden per paying creator.

Trust:

- Unauthorized access incidents.
- Successful export and deletion.
- User satisfaction with extraction accuracy and ability to correct it.

**[Existing]** Instrumentation vehicle: the `daily_counts` table with metric prefixes (`0006_analytics.sql`) plus the existing admin analytics views. New counters should follow the prefix convention (e.g. `import:ok`, `import:fail`, `bank:created`, `practice:solo_completed`). No third-party analytics SDK is in use; adding one is out of scope unless the product owner proposes it.

## 10. Risks and mitigations

- **Bad extraction damages trust:** review-first workflow, source references, supported-format limits, representative tests and transparent error handling.
- **Upload processing is expensive:** file/usage limits, metering, asynchronous processing, cost monitoring and no unlimited promise before cost estimates.
- **Feature scope explodes:** prioritize the complete loop of import → review → save → solo practice → repeat.
- **Pro blocks social growth:** invited players can join without Pro.
- **Question banks become stale or change during a session:** define bank versioning/snapshot semantics before implementation (G4).
- **Exam branding or copyrighted content risk:** user-owned material, clear terms, no false affiliation with exam bodies.
- **Analytics mislead learners:** show sample size/context and avoid unsupported mastery claims.
- **Concurrent agents collide:** planning work remains docs-only on its own branch; do not edit application code or the active UI branch. **[Existing]** Note for coordinators: this checkout's `.git` is a gitfile pointing at a WSL-side worktree path; `git status`/`git diff` fail from a Windows shell and must be run inside WSL (e.g. `wsl git -C '/mnt/c/Users/Omotayo/AI Websites/whizard-v2-planning' status`, adding a one-off `-c safe.directory=…` for the worktree path if Git reports dubious ownership). Verify before relying on Git output for coordination.
- **R11 — Published pricing promises exceed shipped capability:** the live pricing page advertises creator features (manual custom quizzes, CSV import, bulk import/export, image questions) that do not exist for end users, while the Pro button correctly says "Coming soon". Mitigation: the §6 reconciliation workstream; do not sell Pro against unshipped claims.
- **R12 — Paying users have no contact or recovery channel:** passkey-only auth with no email means no receipts, no win-back, and lockout if a user loses all passkeys. Mitigation: resolve the §4F gap-3 decision before charging for Pro; interim support burden acknowledged in metrics.
- **R13 — Schema rigidity blocks the core promise:** if G1 chooses not to extend the shipped question schema, document the format limits prominently in the Studio so users do not lose work to validation errors after long imports.
- **R14 — No staging environment + automatic migrations:** every merged migration applies to production automatically. Mitigation: G8 expand/contract policy; treat migrations as the highest-risk artifact in every V2 PR.
- **R15 — User-bank UGC abuse:** shareable banks can carry abusive or infringing content. Mitigation: private-by-default; extend report/retire/takedown (§8) before any sharing surface; rate-limit creation per G6.
- **R16 — ID collisions across content domains:** without G3 namespacing, bank question ids can collide with shipped or admin-overlay ids, corrupting dedupe and stats. Mitigation: G3 exit criteria are a Phase 1 hard gate.

## 11. Deliverables expected from the planning agent

Produce a reviewable plan, not application changes:

1. Product requirements document with personas, jobs, user stories and acceptance criteria.
2. MVP boundary and phased roadmap, clearly separating launch requirements from later ideas.
3. Text-described screen/interaction flows for dashboard, import/review, bank management, solo practice and multiplayer launch.
4. Data model proposal with ownership, versions, import-job state and entitlements; label unknowns that require repository inspection. _(Ownership, versions and import-job state are now scoped by gates G2/G3/G6; the proposal must satisfy their exit criteria.)_
5. Architecture proposal grounded in the current Whizard stack, with alternatives and trade-offs. _(§7a is the grounded baseline; §7b and gates G1–G9 carry the remaining alternatives.)_
6. Threat/privacy/copyright considerations and abuse controls. _(§8, extended with the existing export/deletion and moderation mechanisms to build on.)_
7. Test strategy including extraction fixtures, import edge cases, authorization, solo practice and multiplayer compatibility. _(Note the existing suite is strong on multiplayer/mobile and thin on desktop; add bank-authorization tests and reuse the e2e passkey helper.)_
8. Cost model assumptions and the metrics needed to validate them. _(Grounded in the metrics vehicle of §9.)_
9. Open decisions for the product owner, prioritized by what blocks implementation. _(Currently: G1–G9, then §7b payment/contact decisions, then the §6 pricing-reconciliation choice.)_
10. A sequenced implementation plan broken into small PR-sized tasks. _(Cannot be written until G1–G9 are resolved; migration tasks must follow G8.)_

## 12. Explicit non-goals for the planning phase

- Do not change application code, schema, migrations, deployments, billing or feature flags.
- Do not merge or deploy anything.
- Do not finalize pricing or free-tier quotas without evidence.
- Do not promise support for every document type before testing.
- Do not add unimplemented exam games to the current public catalogue.
- Do not assume the existing UI agent's local changes are available. Inspect Git status/branches only if coordinating with that agent, and preserve all local work. (Remember the WSL gitfile note in §10.)
- Do not edit the pricing page, marketing copy, or any other UI in this phase; the reconciliation workstream in §6 is a decision item, not authorized work.
- Do not select a payment provider, storage product, queue/workflow mechanism, AI extraction vendor or solo-practice architecture in this document; record options, criteria and the decision owner instead.
- Do not weaken the verified invariants of the current product: 20-player cap, nickname-only guest join, free multiplayer, server-authoritative multiplayer scoring, and passkey-only auth — unless the product owner explicitly reopens them.

## 13. Appendix — verified repository baseline

All **[Existing]** claims above were checked against this repository at review time. Key citations (paths relative to repo root):

| Area              | Verified fact                                                                                                                                                  | Where                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack             | pnpm monorepo: React 19 + Vite SPA (`apps/web`), Cloudflare Worker (`apps/server`), shared protocol/game-core/content packages, Playwright e2e                 | root `package.json`, `pnpm-workspace.yaml`, `apps/*/package.json`                                                                                            |
| Runtime           | Worker with Durable Objects (`ROOMS`, `PRESENCE`), one D1 database, daily cron, no object storage, no queues/workflows bindings                                | `apps/server/wrangler.jsonc`                                                                                                                                 |
| Auth              | Passkey-only WebAuthn; DB-backed sessions; no email column anywhere                                                                                            | `0001_accounts.sql`, `apps/server/src/passkeys.ts`, `apps/server/src/sessions.ts`                                                                            |
| Guests            | Nickname-only room join; `guest_id` on match players; guest history ~1 week then attachable to an account                                                      | `0002_matches.sql`, `packages/game-core/src/room.ts`, `e2e/account.spec.ts`                                                                                  |
| Room cap          | 20 players enforced in game-core, protocol schema and UI picker                                                                                                | `packages/game-core/src/room.ts` (`MAX_PLAYERS`), `packages/protocol/src/index.ts` (`.max(20)`), `apps/web/src/RoomScreen.tsx`                               |
| Content           | ~2,490 shipped questions compiled into the Worker; D1 overlay `custom_questions` (no owner column; id-matched rows replace shipped questions); 15 s bank cache | `packages/content/src/questions/*`, `0013_question_bank.sql`, `apps/server/src/bank.ts`                                                                      |
| Question schema   | Exactly 4 choices, first correct; prompt ≤ 120, choice ≤ 40, explanation ≤ 160 chars                                                                           | `packages/content/src/schema.ts` (`storedQuestionSchema`)                                                                                                    |
| Admin import      | CSV/JSON import, 1,000 rows / 1 MB cap, two header shapes; admin-only routes; no export exists                                                                 | `apps/server/src/adminImport.ts`, `apps/server/src/index.ts` (`/api/admin/questions/*`), `docs/QUESTIONS.md`                                                 |
| Rooms/realtime    | One WebSocket per player into a per-room DO; clients receive only the current game stage; server validates answers; 4 KB client / 1 MB server message caps     | `apps/server/src/room.ts`, `packages/game-core/src/games/quiz/quiz.ts`, `packages/protocol/src/index.ts`                                                     |
| Content selection | Rooms select by topic id (`category`); draw = shipped bank + overlay + retired exclusion + seen avoidance                                                      | `packages/game-core/src/games/quiz/settings.ts` (`category: topicIdSchema`), `apps/server/src/room.ts` (`loadBank`/`drawContent`), `0008_seen_questions.sql` |
| Solo today        | No practice/attempts API; e2e "solo" is a one-player room                                                                                                      | `e2e/quiz.spec.ts`, route table in `apps/server/src/index.ts`                                                                                                |
| Payments          | Admin-recorded NGN payments; `pro_memberships` unread by feature code; `provider: null`; no processor                                                          | `0015_payments.sql`, `apps/server/src/adminPayments.ts`, `apps/server/src/account.ts`                                                                        |
| Entitlements      | `pro_memberships` read only by admin list and `/api/me`                                                                                                        | `apps/server/src/account.ts`                                                                                                                                 |
| Flags             | Global `site_settings` switches only (announcement, rooms/signups paused, topics/games off, quiz defaults); 15 s cache; admin-logged                           | `0014_moderation_settings.sql`, `apps/server/src/settings.ts`, `apps/server/src/adminSettings.ts`                                                            |
| Stats             | Public `/stats` + `GET /api/community` (120 s cache); `daily_counts` metric prefixes; no third-party analytics                                                 | `apps/web/src/pages/StatsPage.tsx`, `apps/server/src/community.ts`, `0006_analytics.sql`                                                                     |
| Account data      | `exportMe` (matches + social JSON) and `deleteAccount` (anonymize/delete cascade) exist                                                                        | `apps/server/src/account.ts`                                                                                                                                 |
| Moderation        | Blocked words, recent names, question reports, keep/retire, admin queue routes                                                                                 | `0014_moderation_settings.sql`, `0009_question_reports.sql`, `0011_admin.sql`, `apps/server/src/index.ts`                                                    |
| Pricing page      | Publishes ₦5,000/month and creator features that do not exist for end users; Pro button "Coming soon"; FAQ claims Pro spreadsheet upload                       | `apps/web/src/pages/PricingPage.tsx`                                                                                                                         |
| Testing/CI        | Vitest colocated tests; Playwright single mobile project (Pixel 7), 3 shards; CI checks → e2e → deploy `main` to production with automatic remote migrations   | `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`                                                                                       |
| Git               | `.git` is a gitfile pointing at a WSL worktree path; Windows-shell git fails                                                                                   | repo root `.git`                                                                                                                                             |

**Suggested next steps (documentation only):** product owner resolves G1–G9 and the §6 reconciliation choice; then produce the §11 deliverables (PRD, data-model proposal satisfying the gates, PR-sized implementation plan).
