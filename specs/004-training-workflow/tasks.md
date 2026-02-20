# Tasks: Guided Training Workflow

**Input**: Design documents from `/specs/004-training-workflow/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/training-api.yaml, quickstart.md

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — training module structure, schemas, and config extension

- [x] T001 Create training module directory structure: `src/training/`, `src/training/index.ts`, `src/training/types.ts`
- [x] T002 [P] Define all Zod schemas for training entities (TrainingSession, TrainingModule, CurriculumOutline, ModuleContent, ScenarioResponse, QuizAnswer, TrainingResult, RemediationPlan) in `src/training/schemas.ts` — per data-model.md field definitions, with TypeScript type exports
- [x] T003 [P] Define Zod schemas for API request/response bodies (ScenarioSubmission, QuizSubmission, EvaluationResult, ModuleContentClient with correct answers stripped) in `src/training/schemas.ts`
- [x] T004 [P] Extend `TenantSettingsSchema` in `src/config/schema.ts` with optional `training` block: `passThreshold` (default 0.70), `maxAttempts` (default 3), `maxModules` (default 8), `enableRemediation` (default true) — per research.md R6

**Checkpoint**: Training module scaffolded, all schemas defined, tenant config extended

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**Warning**: No user story work can begin until this phase is complete

- [x] T005 Implement training session state machine as a pure function in `src/training/state-machine.ts` — session states: `curriculum-generating`, `in-progress`, `evaluating`, `passed`, `failed`, `in-remediation`, `exhausted`, `abandoned`; module states: `locked`, `content-generating`, `learning`, `scenario-active`, `quiz-active`, `scored`; transition guards per data-model.md state diagrams
- [x] T006 [P] Implement score calculator as a pure function in `src/training/score-calculator.ts` — MC scoring (1.0/0.0), per-module score aggregation (mean of scenario + quiz scores), session aggregate score (mean of module scores), pass/fail threshold check against tenant config `passThreshold`, weak area identification (modules below threshold)
- [x] T007 [P] Implement session repository in `src/training/session-repository.ts` — using `StorageAdapter` with collections `training_sessions` and `training_modules`; methods: `createSession`, `findActiveSession(tenantId, employeeId)`, `findSessionHistory(tenantId, employeeId)`, `updateSession`, `createModules` (batch), `findModulesBySession`, `findModule(sessionId, moduleIndex)`, `updateModule`; optimistic concurrency via version counter (`WHERE version = ?` equivalent in application logic); all methods tenant-scoped
- [x] T008 [P] Implement training audit logging in `src/training/audit.ts` — functions for each event type per data-model.md: `logSessionStarted`, `logModuleCompleted`, `logQuizSubmitted`, `logEvaluationCompleted`, `logRemediationInitiated`, `logSessionAbandoned`, `logSessionExhausted`; all write to `audit_events` collection; MUST NOT include raw content or employee responses — only scores, IDs, counts, topic names
- [x] T009 Wire public exports in `src/training/index.ts` — export all schemas, types, state machine, score calculator, repository, and audit functions

**Checkpoint**: Foundation ready — state machine, scoring, persistence, and audit infrastructure in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Complete Onboarding Training End-to-End (Priority: P1) — MVP

**Goal**: An employee with a confirmed role profile can start training, progress through LLM-generated modules (instruction, scenarios, quiz), receive a pass/fail decision, and see the result.

**Independent Test**: Log in as an employee with a confirmed role profile, navigate to training page, start a session, complete all generated modules (read content, respond to scenarios, answer quizzes), and verify a pass/fail result is displayed and persisted.

### Implementation for User Story 1

- [x] T010 [P] [US1] Implement curriculum generator in `src/training/curriculum-generator.ts` — `generateCurriculum(roleProfile, tenant, model): Promise<CurriculumOutline>` using AI SDK `generateObject()` with `CurriculumOutlineSchema`; system prompt defines role as training designer; user prompt wraps role profile jobExpectations + tenant config in XML boundaries; enforce max modules cap from tenant config `maxModules`; throw typed error on generation failure (mirror `ProfileGenerationError` pattern from `src/intake/profile-generator.ts`)
- [x] T011 [P] [US1] Implement module content generator in `src/training/module-generator.ts` — `generateModuleContent(moduleOutline, roleProfile, tenant, model): Promise<ModuleContent>` using `generateObject()` with `ModuleContentSchema`; generates instructional markdown, mixed scenario types (MC + free-text), and quiz questions (MC + free-text) with correct answers and rubrics; system prompt labels role profile as data; employee-facing content only (no internal evaluation criteria exposed)
- [x] T012 [P] [US1] Implement evaluator in `src/training/evaluator.ts` — `scoreMcAnswer(selectedOption, correctOption): number` (returns 1.0 or 0.0); `evaluateFreeText(question, rubric, response, model): Promise<{score: number, rationale: string}>` using `generateObject()` with `FreeTextEvaluationSchema`; system prompt treats employee response as untrusted data wrapped in `<employee_response>` XML boundary; response length-limited to 2000 chars
- [x] T013 [US1] Implement `POST /api/training/[tenant]/session` route in `app/api/training/[tenant]/session/route.ts` — auth via `x-tenant-id`/`x-employee-id` headers; validate no active session exists (409 if so); fetch employee's confirmed role profile via `ProfileRepository` (404 if none); resolve AI model via `resolveModel(tenant)`; call `generateCurriculum()`; create session record (status: `in-progress`, attemptNumber: 1) + module records (all `locked` except first which is `locked`) in a transaction; log `training-session-started` audit event; return `TrainingSessionResponse` (201)
- [x] T014 [US1] Implement `GET /api/training/[tenant]/session` route in `app/api/training/[tenant]/session/route.ts` — auth check; find active or most recent session for employee; if none, return 404; assemble `TrainingSessionResponse` with module summaries (strip correct answers from content); return 200
- [x] T015 [US1] Implement `POST /api/training/[tenant]/module/[moduleIndex]/content` route in `app/api/training/[tenant]/module/[moduleIndex]/content/route.ts` — auth check; find session + module; guard: module must be `locked` and previous module must be `scored` (or index 0); transition module to `content-generating`; call `generateModuleContent()`; store content in module record; transition to `learning`; return `ModuleResponse` with client-safe content (correct answers stripped); idempotent: if content already exists, return existing
- [x] T016 [US1] Implement `POST /api/training/[tenant]/module/[moduleIndex]/scenario` route in `app/api/training/[tenant]/module/[moduleIndex]/scenario/route.ts` — auth check; validate `ScenarioSubmission` body; find module; guard: module in `learning` or `scenario-active` state; score response: MC via `scoreMcAnswer`, free-text via `evaluateFreeText`; persist `ScenarioResponse` in module record; if all scenarios answered, transition to `quiz-active`; return `ScenarioResult`
- [x] T017 [US1] Implement `POST /api/training/[tenant]/module/[moduleIndex]/quiz` route in `app/api/training/[tenant]/module/[moduleIndex]/quiz/route.ts` — auth check; validate `QuizSubmission` body (all questions answered); find module; guard: module in `quiz-active` state; score each answer (MC numeric, free-text via LLM); compute module score via `scoreCalculator`; persist answers + module score; transition module to `scored`; log `training-module-completed` + `training-quiz-submitted` audit events; if last module, transition session to `evaluating`; return `QuizResult`
- [x] T018 [US1] Implement `POST /api/training/[tenant]/evaluate` route in `app/api/training/[tenant]/evaluate/route.ts` — auth check; find session; guard: session in `evaluating` state; compute aggregate score via `scoreCalculator.computeAggregateScore()`; if score >= passThreshold: transition to `passed`, set completedAt; if score < passThreshold and attempts < maxAttempts: transition to `failed`, identify weakAreas; if score < passThreshold and attempts = maxAttempts: transition to `exhausted`, set completedAt; log `training-evaluation-completed` audit event; return `EvaluationResult` with `nextAction`
- [x] T019 [US1] Implement training page UI in `app/[tenant]/training/page.tsx` — `"use client"` component; state machine approach mirroring intake page pattern; states: `loading-session`, `no-profile`, `start`, `curriculum`, `module-learning`, `module-scenario`, `module-quiz`, `evaluating`, `result`, `error`; fetch session on mount via `GET /api/training/[tenant]/session`; if 404 → check for profile → `no-profile` (redirect to intake) or `start`; if 200 → hydrate from session state; render functions per state: `renderStart()`, `renderCurriculum()`, `renderModuleLearning()`, `renderModuleScenario()`, `renderModuleQuiz()`, `renderResult()`; all strings in `STRINGS` const; inline CSSProperties styling; WCAG 2.1 AA: `aria-live` regions for loading/results, keyboard navigable forms, semantic HTML, no color-only indicators; progress bar showing curriculum completion
- [x] T020 [US1] Wire training page interactions in `app/[tenant]/training/page.tsx` — "Start Training" calls `POST .../session`; entering a module calls `POST .../module/{i}/content`; scenario submit calls `POST .../module/{i}/scenario`; quiz submit calls `POST .../module/{i}/quiz`; after last module scored, calls `POST .../evaluate`; error handling with retry from last stable state; loading states with `aria-busy`

**Checkpoint**: At this point, an employee can complete the full training workflow end-to-end: start session → generate curriculum → work through modules (instruction → scenarios → quiz) → receive pass/fail result. This is a fully functional MVP.

---

## Phase 4: User Story 2 — Remediation After Failure (Priority: P2)

**Goal**: An employee who fails can see their weak areas, start a remediation cycle with targeted modules, and be re-assessed.

**Independent Test**: Complete a training session with deliberately poor answers to fail, verify weak areas are displayed, start remediation, complete targeted modules, and verify a new pass/fail decision is rendered.

### Implementation for User Story 2

- [x] T021 [P] [US2] Implement remediation planner in `src/training/remediation-planner.ts` — `generateRemediationCurriculum(weakAreas, roleProfile, tenant, model): Promise<CurriculumOutline>` using `generateObject()` with same `CurriculumOutlineSchema`; generates modules only for weak topic areas; caps at tenant config `maxModules`; system prompt emphasizes remediation context and focuses on reinforcing weak areas
- [x] T022 [US2] Add remediation initiation logic to `POST /api/training/[tenant]/session` route in `app/api/training/[tenant]/session/route.ts` — extend POST handler: if employee has a `failed` session with attempts < maxAttempts and `enableRemediation` is true, allow starting remediation; increment attemptNumber; generate remediation curriculum via `remediationPlanner`; create new module records for remediation; transition session to `in-remediation` → `in-progress`; log `training-remediation-initiated` audit event; reuse all existing module content/scenario/quiz/evaluate routes for remediation modules
- [x] T023 [US2] Add remediation UI to `app/[tenant]/training/page.tsx` — new state `failed-review` showing: aggregate score, per-module scores, weak areas highlighted; "Start Remediation" button (or "Contact Administrator" if attempts exhausted); remediation cycle reuses existing module flow UI (curriculum → modules → evaluate); show attempt counter (e.g., "Attempt 2 of 3")
- [x] T024 [US2] Update `POST /api/training/[tenant]/evaluate` in `app/api/training/[tenant]/evaluate/route.ts` — on remediation evaluation: combine original passing module scores with remediation module scores for aggregate; if still failing and attempts < max, transition back to `failed`; if attempts = max, transition to `exhausted`; log `training-session-exhausted` audit event if exhausted

**Checkpoint**: At this point, the full pass/fail/remediation cycle works. Failed employees get targeted remediation content and re-assessment.

---

## Phase 5: User Story 3 — Resume Training After Interruption (Priority: P3)

**Goal**: An employee can refresh the browser, close the tab, or return hours later and resume training at exactly the point of interruption.

**Independent Test**: Progress partway through a module, refresh the browser, and verify the training resumes with all prior answers and progress intact.

### Implementation for User Story 3

- [x] T025 [US3] Implement full state hydration in `GET /api/training/[tenant]/session` route in `app/api/training/[tenant]/session/route.ts` — return complete session state including: all module records with their current status, generated content (if any), submitted scenario responses, submitted quiz answers, module scores; ensure client can reconstruct exact UI state from the response
- [x] T026 [US3] Implement client-side state reconstruction in `app/[tenant]/training/page.tsx` — on page load, map server session state to UI state: determine which render function to show based on session status + current module status; restore in-progress module to correct step (learning/scenario/quiz); restore previously submitted answers so quiz/scenario forms show completed items; handle `content-generating` state (content generation was interrupted — trigger retry)
- [x] T027 [US3] Implement optimistic concurrency conflict handling in `app/[tenant]/training/page.tsx` — when any API call returns 409 (version conflict), show a notification banner: "Your training was updated in another tab. Refreshing..."; auto-reload session state via `GET .../session`; re-render from refreshed state
- [x] T028 [US3] Add version checks to all write API routes (`session/route.ts`, `module/[moduleIndex]/content/route.ts`, `scenario/route.ts`, `quiz/route.ts`, `evaluate/route.ts`, `abandon/route.ts`) — accept optional `version` field in request body; if provided, compare against current record version; return 409 with `{ error: "version_conflict", message: "Session was modified by another request" }` if mismatch; increment version on every successful write

**Checkpoint**: Training is fully resilient to interruption. Refresh, close, return — all progress preserved.

---

## Phase 6: User Story 4 — View Training Progress and History (Priority: P4)

**Goal**: An employee can view their training progress (current session) and history (past sessions with scores and attempt details).

**Independent Test**: Partially complete training and verify the progress view shows correct module statuses and scores. Complete training and verify history shows all attempts.

### Implementation for User Story 4

- [x] T029 [P] [US4] Add `findSessionHistory` method to session repository in `src/training/session-repository.ts` — returns all sessions for an employee ordered by createdAt desc, including module summaries with scores; supports pagination via `limit`/`offset`
- [x] T030 [US4] Add history endpoint `GET /api/training/[tenant]/session` with `?history=true` query parameter in `app/api/training/[tenant]/session/route.ts` — when `history=true`, return array of all sessions (not just active); each session includes module summaries with scores, attempt number, aggregate score, status, timestamps
- [x] T031 [US4] Add progress and history views to `app/[tenant]/training/page.tsx` — progress sidebar/panel showing: curriculum modules with completion status indicators (locked/in-progress/scored), per-module scores for completed modules, overall progress percentage, current attempt number; history view accessible from result state showing: all past sessions with dates, attempt numbers, aggregate scores, per-module breakdowns, final status (passed/failed/abandoned/exhausted)

**Checkpoint**: Employees have full visibility into their training journey — current progress and historical attempts.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T032 [P] Implement `POST /api/training/[tenant]/abandon` route in `app/api/training/[tenant]/abandon/route.ts` — auth check; find active session; guard: session must be in `in-progress` or `in-remediation`; transition to `abandoned`; set completedAt; log `training-session-abandoned` audit event; return updated session
- [x] T033 [P] Add abandon UI to `app/[tenant]/training/page.tsx` — "Abandon Training" button visible during `curriculum`, `module-*` states; confirmation dialog warning that it counts toward the 3-attempt limit; on confirm, calls `POST .../abandon`; transitions to result state showing abandoned status
- [x] T034 [P] Add Apache 2.0 license headers to all new source files in `src/training/` and `app/[tenant]/training/` and `app/api/training/` per constitution Licensing requirements
- [x] T035 Verify all STRINGS constants are externalized for i18n readiness in `app/[tenant]/training/page.tsx` — ensure no hardcoded user-facing strings outside the STRINGS object
- [x] T036 Run quickstart.md validation — verify tenant config example from `specs/004-training-workflow/quickstart.md` works with the implemented config schema; verify all documented API endpoints match implemented routes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — MVP target
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Phase 3) — builds on evaluate route and UI
- **User Story 3 (Phase 5)**: Depends on User Story 1 (Phase 3) — adds resilience to existing routes and UI
- **User Story 4 (Phase 6)**: Depends on User Story 1 (Phase 3) — adds read-only views on existing data
- **Polish (Phase 7)**: Can start after User Story 1; abandon functionality is independent

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependency on other stories
- **User Story 2 (P2)**: Depends on US1 — extends evaluate route and adds remediation flow to existing UI
- **User Story 3 (P3)**: Depends on US1 — adds version checks to US1's routes and state hydration to US1's UI; can run in parallel with US2
- **User Story 4 (P4)**: Depends on US1 — adds read-only history views; can run in parallel with US2 and US3

### Within Each User Story

- Models/schemas before services
- Services before API routes
- API routes before UI
- Core implementation before integration

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 can all run in parallel (different files)
- **Phase 2**: T006, T007, T008 can all run in parallel (different files); T005 is independent
- **Phase 3 (US1)**: T010, T011, T012 can run in parallel (different files); routes T013–T018 are sequential (shared route files); UI T019–T020 are sequential
- **Phase 4 (US2)**: T021 can run in parallel with other phases
- **Phase 5 (US3)**: T025–T028 are sequential (modify existing files)
- **Phase 6 (US4)**: T029 can run in parallel; T030–T031 are sequential
- **Phase 7**: T032, T033, T034 can run in parallel
- **Cross-phase**: US3 and US4 can run in parallel after US1 completes; US2 can run in parallel with US3

---

## Parallel Example: User Story 1

```bash
# After Phase 2 completes, launch all LLM generators in parallel:
Task: "Implement curriculum generator in src/training/curriculum-generator.ts"       # T010
Task: "Implement module content generator in src/training/module-generator.ts"       # T011
Task: "Implement evaluator in src/training/evaluator.ts"                            # T012

# After generators complete, build API routes sequentially (shared patterns):
Task: "POST /api/training/[tenant]/session route"                                   # T013
Task: "GET /api/training/[tenant]/session route"                                    # T014
# ... then module routes T015-T018

# After routes, build UI:
Task: "Training page UI in app/[tenant]/training/page.tsx"                          # T019
Task: "Wire training page interactions"                                             # T020
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T009)
3. Complete Phase 3: User Story 1 (T010–T020)
4. **STOP and VALIDATE**: Test full training workflow end-to-end
5. Deploy/demo if ready — employee can complete training and get a pass/fail result

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Remediation works → Deploy/Demo
4. Add User Story 3 + 4 (parallel) → Resilience + visibility → Deploy/Demo
5. Polish → License headers, docs, validation → Final release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (critical path — MVP)
3. Once US1 is done:
   - Developer A: User Story 2 (extends US1)
   - Developer B: User Story 3 (adds resilience to US1)
   - Developer C: User Story 4 (adds views on US1 data)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All LLM interactions use `generateObject()` with Zod schemas (Constitution II)
- All storage operations tenant-scoped via `StorageAdapter` (Constitution III)
- Client-facing responses MUST strip `correct` field from MC options
- Employee free-text responses treated as untrusted input in LLM prompts
