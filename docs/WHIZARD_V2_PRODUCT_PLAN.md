# Whizard V2 — Product Plan (Draft)

**Status:** Discovery/planning only. Not approved for implementation.
**Purpose:** Define a coherent V2 direction for Pro study tools, personal dashboards, user-owned question banks, document-to-quiz conversion, solo practice, and multiplayer study rooms.

## 1. Product thesis

Whizard should remain a fun, accessible multiplayer game platform while adding a serious study workflow for people who want to practise from their own material.

**Positioning hypothesis:** Play for free. Build and manage your own study system with Pro.

The product should let a student or tutor turn existing past-question material into a reviewed, reusable question bank, then practise alone or invite others to play it through Whizard's familiar game experience.

Whizard should not become a generic document editor or attempt to author every exam's content itself in the first release. The initial value is turning user-owned material into structured practice with a good review workflow and engaging play modes.

## 2. Existing decisions to preserve

- Whizard's ordinary multiplayer experience stays free.
- The established room size is up to 20 players; do not silently change this limit.
- Monetize serious creation and management of custom questions rather than charging every participant.
- Previously discussed free/paid positioning: “Free to play. Free to start creating. Pay when you need serious creator tools.”
- Manual question entry and CSV import/export have already been discussed as custom-content workflows.
- A prior Pro price of about ₦5,000/month was only a hypothesis, not a decision. Validate willingness to pay before fixing price or limits.
- Friends should be able to join an invited quiz without needing to subscribe to Pro; investigate whether an account should be required to join, but do not introduce unnecessary account friction.
- Keep the current catalogue, existing games, multiplayer rooms, room lifecycle, reconnection and game mechanics stable. V2 should extend them rather than replace them.
- V2 is a proposal, not permission to implement features or change the production app yet.

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

### B. Custom Quiz Studio

A workflow for creating a structured, editable question bank from several inputs:
- Manual entry.
- CSV import/export.
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

### C. Practice modes

Minimum proposed modes:
- **Solo practice:** user answers at their own pace or under a timer, sees feedback according to the chosen mode, and can resume or retry.
- **Multiplayer room:** host selects a bank and settings, creates a room, and invites others; existing free room/player rules continue to apply.
- **Review mistakes:** retry missed questions and optionally build a practice session from them.
- **Timed set:** optional timed attempt with a clear start/end and result summary.

Do not promise advanced adaptive testing or official exam simulation in the first release. First validate that importing, reviewing, saving and playing a question bank is reliable.

### D. Question-bank management

- List/search/sort personal banks.
- Organize by exam, subject, topic, tags or folders if justified.
- Edit, duplicate, archive and delete.
- Save drafts separately from published/usable banks.
- Export to CSV or another supported format to reduce lock-in.
- Explicit ownership and permissions: private by default; sharing/inviting is an intentional action.
- Consider shared banks or tutor/student libraries as a later phase.

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

## 5. Core user journeys to map

1. New student signs up → creates a bank → imports a past-question file → reviews extracted questions → saves the bank → starts solo practice → reviews mistakes → returns to dashboard.
2. Student creates a bank → chooses multiplayer practice → configures quiz → shares room code/link → friends join as ordinary players → host runs the game → everyone sees appropriate results.
3. User with an existing bank edits/duplicates it → chooses a new topic subset → starts another attempt without re-uploading.
4. Tutor creates a bank → shares a session with a group → participants join → tutor sees only the analytics/identities permitted by the product's privacy rules.
5. User encounters import limitations → receives actionable feedback and can fall back to pasted text, CSV or manual entry.

For each journey, define loading, empty, error, cancel/retry, duplicate, permissions, and mobile states.

## 6. Phased plan to evaluate

### Phase 0 — Discovery and technical spike
- Interview students/tutors, especially GMAT and ICAN candidates, to validate the highest-value workflows.
- Collect representative, permissioned sample files with varied layouts.
- Test extraction quality, answer association, tables, formulas, multi-column pages and page references.
- Decide which input formats are supportable at launch.
- Estimate cost per import, storage, processing latency, abuse risk and expected usage.
- Inspect the current Whizard data model, auth, Worker/Durable Objects/D1 boundaries and room API before proposing schema changes.
- Write acceptance criteria and a cost-aware plan before building.

### Phase 1 — Useful question-bank MVP
- Manual entry and CSV import/export.
- Document import for only the formats proven reliable by the spike.
- Editable review queue with source references and explicit confirmation.
- Save/edit/delete a personal bank.
- Solo practice, score summary and retry missed questions.
- Launch behind feature flags/limited access if extraction quality or cost remains uncertain.

### Phase 2 — Shared practice and Pro dashboard
- Create a multiplayer room from an approved bank using existing room infrastructure.
- Invites and room join should not require participants to subscribe.
- Personal dashboard, saved banks, attempt history and topic performance.
- Pro entitlements, usage limits, payment lifecycle, cancellations and account access behaviour.
- Operational monitoring for failed imports, processing costs and room/session reliability.

### Phase 3 — Study-system improvements
Only after usage validates the need:
- Better review scheduling and mistake-based sessions.
- Shared/tutor libraries and group analytics.
- More question types/media.
- More sophisticated practice modes.
- Organization plans and additional exams/markets.

## 7. Architecture questions for the plan (do not assume answers)

OpenCode/planning agent should inspect the actual repository before recommending implementation:
- How are user-owned resources and auth represented today?
- Which question/game models can be reused, and where is the current source of truth?
- Should a bank be stored in D1, object storage, or a combination? Consider file size, retention, access control and deletion.
- How are asynchronous import jobs run and retried in the Cloudflare environment?
- Where should parsers run? What are memory, CPU, duration and dependency constraints?
- How are room settings/state mapped to a selected bank without putting huge question payloads into room state?
- How are question-bank versions handled when a creator edits a bank after a room is created?
- How are Pro entitlements checked server-side? Never trust client-only flags.
- How do we prevent unauthorized access to private banks and uploaded files?
- How are duplicate submissions, malformed documents, oversized files, malicious files and rate abuse handled?
- What is the backup/export/deletion policy?
- How can import processing be provider-independent where practical, with predictable cost and graceful fallback?

Do not choose vendors, databases, queues, AI models or payment providers until the repository and constraints have been examined. Avoid building a second extraction platform inside Whizard without a clear reason.

## 8. Privacy, copyright and academic reliability

- Treat uploads as private user data by default.
- Enforce ownership/authorization on every read, update, export and delete operation.
- Define file-size/type limits, retention, deletion and import-job cleanup.
- Do not train on uploaded content or share it across users without explicit consent and a clear policy.
- Ask users to upload material they are entitled to use; do not position Whizard as a way to distribute copyrighted exam books.
- Keep source references where possible and distinguish extracted content from verified answers.
- Make generated/extracted content editable and require review before it becomes a trusted question bank.
- Consider privacy implications of tutor dashboards and group performance data.

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

## 10. Risks and mitigations

- **Bad extraction damages trust:** review-first workflow, source references, supported-format limits, representative tests and transparent error handling.
- **Upload processing is expensive:** file/usage limits, metering, asynchronous processing, cost monitoring and no unlimited promise before cost estimates.
- **Feature scope explodes:** prioritize the complete loop of import → review → save → solo practice → repeat.
- **Pro blocks social growth:** invited players can join without Pro.
- **Question banks become stale or change during a session:** define bank versioning/snapshot semantics before implementation.
- **Exam branding or copyrighted content risk:** user-owned material, clear terms, no false affiliation with exam bodies.
- **Analytics mislead learners:** show sample size/context and avoid unsupported mastery claims.
- **Concurrent agents collide:** planning work remains docs-only on its own branch; do not edit application code or the active UI branch.

## 11. Deliverables expected from the planning agent

Produce a reviewable plan, not application changes:
1. Product requirements document with personas, jobs, user stories and acceptance criteria.
2. MVP boundary and phased roadmap, clearly separating launch requirements from later ideas.
3. Text-described screen/interaction flows for dashboard, import/review, bank management, solo practice and multiplayer launch.
4. Data model proposal with ownership, versions, import-job state and entitlements; label unknowns that require repository inspection.
5. Architecture proposal grounded in the current Whizard stack, with alternatives and trade-offs.
6. Threat/privacy/copyright considerations and abuse controls.
7. Test strategy including extraction fixtures, import edge cases, authorization, solo practice and multiplayer compatibility.
8. Cost model assumptions and the metrics needed to validate them.
9. Open decisions for the product owner, prioritized by what blocks implementation.
10. A sequenced implementation plan broken into small PR-sized tasks.

## 12. Explicit non-goals for the planning phase

- Do not change application code, schema, migrations, deployments, billing or feature flags.
- Do not merge or deploy anything.
- Do not finalize pricing or free-tier quotas without evidence.
- Do not promise support for every document type before testing.
- Do not add unimplemented exam games to the current public catalogue.
- Do not assume the existing UI agent's local changes are available. Inspect Git status/branches only if coordinating with that agent, and preserve all local work.
