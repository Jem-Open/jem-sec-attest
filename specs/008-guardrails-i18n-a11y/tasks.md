# Tasks: Platform Guardrails, Internationalization & Accessibility

**Input**: Design documents from `/specs/008-guardrails-i18n-a11y/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the specification. Test tasks are omitted. Tests should be added as part of each implementation task where appropriate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new module directories and shared types needed by multiple user stories.

- [x] T001 Create `src/guardrails/` directory and add Apache 2.0 license headers to all new files in this feature
- [x] T002 [P] Create `src/audit/audit-types.ts` — define unified `AuditEventType` union type covering all existing events (`sign-in`, `sign-out`, `auth-failure`, `auth-config-error`, `session-started`, `module-completed`, `quiz-submitted`, `evaluation-completed`, `remediation-initiated`, `session-abandoned`, `session-exhausted`) plus new events (`evidence-exported`, `integration-push-success`, `integration-push-failure`). Define `AuditEventInput` interface and typed metadata schemas per event type using Zod v4.
- [x] T003 [P] Create `src/guardrails/secret-patterns.ts` — define regex patterns for each secret category (`API_KEY`, `PASSWORD`, `TOKEN`, `BEARER`, `CONNECTION_STRING`) with their typed marker strings. Export as an array of `{ name: string; pattern: RegExp; marker: string }`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core services that MUST be complete before user story implementation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Create `src/audit/audit-logger.ts` — implement `AuditLogger` class that wraps `StorageAdapter.create()` for the `audit_events` collection. Constructor takes a `StorageAdapter` instance. Expose only `log(tenantId, event: AuditEventInput): Promise<void>`. Do NOT expose update or delete methods. Validate event input against Zod schemas from `src/audit/audit-types.ts`.
- [x] T005 Create `src/guardrails/secret-redactor.ts` — implement `SecretRedactor` class with `redact(text: string): RedactionResult` method. Apply all patterns from `secret-patterns.ts` sequentially. Return `{ text, redactionCount, redactionTypes }`. Handle multiline input. Use `.js` extension in relative imports per project conventions.
- [x] T006 Extend `src/config/schema.ts` — add `TranscriptRetentionSchema` to `RetentionSchema` with fields `enabled: z.boolean().default(true)` and `retentionDays: z.number().int().positive().nullable().default(null)`. Add under `retention.transcripts`. Ensure the schema remains `.strict()`.
- [x] T007 Update `config/defaults.yaml` — add default retention transcript settings: `retention.transcripts.enabled: true`, `retention.transcripts.retentionDays: null`.

**Checkpoint**: Foundation ready — AuditLogger, SecretRedactor, and config schema are available for user story implementation.

---

## Phase 3: User Story 1 — Secret Redaction in AI Transcripts (Priority: P1) 🎯 MVP

**Goal**: All secrets in training transcripts (user responses and AI rationale) are redacted with typed markers before storage.

**Independent Test**: Submit training responses containing known secret patterns. Verify stored module records contain `[REDACTED:TYPE]` markers instead of original values.

### Implementation for User Story 1

- [x] T008 [US1] Identify all transcript write paths — read `app/api/training/[tenant]/` route files that call `storage.update()` on `training_modules` with `freeTextResponse` or `llmRationale` fields. Document each hook point. Key files: scenario submission route, quiz submission route, and any route that stores LLM rationale.
- [x] T009 [US1] Integrate `SecretRedactor` into scenario response storage — in the route that handles scenario submissions under `app/api/training/[tenant]/`, import `SecretRedactor` and call `redactor.redact()` on `freeTextResponse` before passing to `storage.update()`. Also redact `llmRationale` if stored.
- [x] T010 [US1] Integrate `SecretRedactor` into quiz answer storage — in the route that handles quiz submissions under `app/api/training/[tenant]/`, import `SecretRedactor` and call `redactor.redact()` on `freeTextResponse` before passing to `storage.update()`. Also redact `llmRationale` if stored.
- [x] T011 [US1] Add unit tests in `tests/unit/guardrails/secret-redactor.spec.ts` — test each pattern category (API keys: `sk-`, `pk-`, `AKIA`; passwords: `password=`, `secret=`; tokens: `token=`; bearer: `Bearer eyJ...`; connection strings: `mongodb://`, `postgres://`). Test no-match passthrough. Test multiline input. Test partial/truncated patterns. Test typed marker output format.

**Checkpoint**: Secret redaction is active on all transcript write paths. Submitting secrets in training yields `[REDACTED:TYPE]` in stored records.

---

## Phase 4: User Story 2 — Immutable Audit Trail (Priority: P1)

**Goal**: Every authentication, training completion, evidence export, and integration push produces an immutable audit event.

**Independent Test**: Perform each auditable action and verify a corresponding audit event exists in `audit_events` with correct metadata.

### Implementation for User Story 2

- [x] T012 [US2] Refactor `src/auth/audit.ts` — replace direct `storage.create()` calls with `AuditLogger.log()`. Preserve existing event factory functions (`createSignInEvent`, `createSignOutEvent`, `createAuthFailureEvent`, `createAuthConfigErrorEvent`). Update their return types to match `AuditEventInput` from `src/audit/audit-types.ts`.
- [x] T013 [US2] Refactor `src/training/audit.ts` — replace direct `storage.create()` calls with `AuditLogger.log()`. Preserve existing event factory functions (`logSessionStarted`, `logModuleCompleted`, `logQuizSubmitted`, `logEvaluationCompleted`, `logRemediationInitiated`, `logSessionAbandoned`, `logSessionExhausted`). Update signatures to accept `AuditLogger` instead of raw `StorageAdapter`.
- [x] T014 [US2] Update all auth route files that call functions from `src/auth/audit.ts` — ensure they instantiate `AuditLogger` and pass it instead of raw storage. Files: `app/api/auth/[tenant]/signin/route.ts`, `app/api/auth/[tenant]/callback/route.ts`, `app/api/auth/[tenant]/signout/route.ts`.
- [x] T015 [US2] Update all training route files that call functions from `src/training/audit.ts` — ensure they use `AuditLogger`. Files: `app/api/training/[tenant]/session/route.ts`, `app/api/training/[tenant]/evaluate/route.ts`, `app/api/training/[tenant]/abandon/route.ts`, and any module content/quiz/scenario routes that log events.
- [x] T016 [US2] Add `evidence-exported` audit event to PDF export route — in `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts`, after the PDF is generated and before returning the response, call `auditLogger.log()` with event type `evidence-exported` and metadata `{ sessionId, format: "pdf", evidenceId }`.
- [x] T017 [US2] Add `integration-push-success` and `integration-push-failure` audit events to `src/compliance/orchestrator.ts` — after a successful Sprinto upload, log `integration-push-success` with metadata `{ sessionId, provider, uploadId, evidenceId }`. After all retries exhausted on failure, log `integration-push-failure` with metadata `{ sessionId, provider, error, evidenceId }`. Pass `AuditLogger` to the orchestrator constructor or upload method.
- [x] T018 [US2] Add contract tests in `tests/contract/audit/audit-event-schema.test.ts` — validate that each `AuditEventType` produces a record matching the expected schema. Test all 14 event types. Verify immutability: confirm that calling `storage.update()` or `storage.delete()` on `audit_events` is not possible through the `AuditLogger` interface.
- [x] T019 [US2] Add unit tests in `tests/unit/audit/audit-logger.test.ts` — test that `AuditLogger.log()` writes to `audit_events` collection with correct fields. Test that `AuditLogger` does not expose update or delete methods. Test event validation rejects malformed input.

**Checkpoint**: All key platform actions produce audit events. Events are immutable through the application layer.

---

## Phase 5: User Story 3 — Per-Tenant Retention Controls (Priority: P2)

**Goal**: Tenants can disable transcript storage or set retention periods. Expired transcripts are automatically purged.

**Independent Test**: Configure two tenants with different retention settings. Verify transcripts are handled according to each tenant's policy.

### Implementation for User Story 3

- [x] T020 [US3] Integrate `enabled: false` check into transcript write paths — in the same routes modified in T009 and T010, before storing `freeTextResponse` and `llmRationale`, check `tenantConfig.settings.retention.transcripts.enabled`. If `false`, set these fields to `null` before storage. Scores and `selectedOption` are always preserved.
- [x] T021 [US3] Create `src/retention/transcript-purger.ts` — implement `TranscriptPurger` class with `purge(tenantId: string): Promise<PurgeResult>` and `purgeAll(): Promise<PurgeResult[]>`. Query `training_modules` by tenant where `updatedAt` is older than `retentionDays`. Skip modules whose parent session (looked up via `sessionId` in module data) has a status NOT in `TERMINAL_STATUSES`. For eligible modules, null out `freeTextResponse` and `llmRationale` in all `scenarioResponses[]` and `quizAnswers[]` entries via `storage.update()`.
- [x] T022 [US3] Create `app/api/admin/purge-transcripts/route.ts` — `POST` endpoint that accepts an internal/cron authorization secret (from env var `PURGE_SECRET`), calls `TranscriptPurger.purgeAll()`, and returns `{ results: PurgeResult[] }`. Return 401 if secret is missing or invalid.
- [x] T023 [US3] Update example tenant config files to demonstrate retention settings — add `retention.transcripts` block to `config/tenants/acme-corp.yaml` (with `enabled: true`, `retentionDays: 90`) and `config/tenants/globex-inc.yaml` (with `enabled: false`).
- [x] T024 [US3] Add integration tests in `tests/integration/retention/transcript-purger.test.ts` — use real SQLite via `SQLiteAdapter`. Create test modules with old timestamps for completed sessions and active sessions. Run purge. Verify: old completed session modules have nulled transcript fields; active session modules are untouched; scores and metadata preserved. Verify `PurgeResult` counts are accurate.
- [x] T025 [US3] Add unit tests in `tests/unit/retention/transcript-purger.test.ts` — mock `StorageAdapter`. Test: tenant with `retentionDays: null` is skipped; tenant with `enabled: false` doesn't affect purge (purge only applies to stored transcripts); active session modules are skipped; correct fields are nulled.

**Checkpoint**: Transcript retention is configurable per tenant. Purge correctly handles active sessions and respects tenant policies.

---

## Phase 6: User Story 4 — Externalized UI Text for Translation (Priority: P2)

**Goal**: All UI text externalized to locale files. English is complete. French sample demonstrates contributor workflow. No business logic changes needed to add locales.

**Independent Test**: Add a French locale file. Set `locale=fr` cookie. Navigate training flow. Verify French text renders where translations exist, English for missing keys.

### Implementation for User Story 4

- [x] T026 [P] [US4] Create `src/i18n/locales/en.json` — extract ALL user-facing strings from `app/[tenant]/training/page.tsx` (the `STRINGS` constant), `app/[tenant]/auth/signin/page.tsx`, and `app/[tenant]/dashboard/page.tsx`. Use dot-notation keys organized by namespace: `auth.*`, `dashboard.*`, `training.*` (with sub-namespaces `training.module.*`, `training.quiz.*`, `training.scenario.*`, `training.evaluation.*`), `common.*`. Use `{variableName}` syntax for interpolation placeholders.
- [x] T027 [P] [US4] Create `src/i18n/index.ts` — implement `useTranslation()` client hook and `getTranslation()` server function. `useTranslation()` returns `{ t, locale, setLocale }`. `t(key, params?)` looks up key in current locale, falls back to English if missing, interpolates `{var}` placeholders. `setLocale(locale)` writes to `document.cookie`. Locale resolution: (1) cookie `locale`, (2) `navigator.language` match, (3) `"en"` default. Export supported locale list.
- [x] T028 [US4] Create `src/i18n/locales/fr.json` — translate a representative subset of keys (~30-40 strings covering auth, dashboard, and core training flow labels/buttons). Leave remaining keys absent (English fallback will apply).
- [x] T029 [US4] Refactor `app/[tenant]/training/page.tsx` — replace the `STRINGS` constant with `useTranslation()` hook calls. Replace all `STRINGS.xxx` references with `t("training.xxx")`. Ensure interpolation params are passed where needed (e.g., module numbers, scores). Remove the `STRINGS` constant.
- [x] T030 [US4] Refactor `app/[tenant]/auth/signin/page.tsx` — replace all hardcoded English strings with `t("auth.xxx")` calls using `useTranslation()`. If this is a Server Component, use `getTranslation()` instead and read locale from cookies.
- [x] T031 [US4] Refactor `app/[tenant]/dashboard/page.tsx` — replace all hardcoded English strings with `t("dashboard.xxx")` calls. Same server/client consideration as T030.
- [x] T032 [US4] Update `app/layout.tsx` — set `<html lang={locale}>` dynamically. Read locale from cookies on the server side. If no cookie, default to `"en"`.
- [x] T033 [US4] Add unit tests in `tests/unit/i18n/translation.test.ts` — test key lookup returns correct string. Test missing key falls back to English. Test interpolation replaces `{var}` placeholders. Test unknown locale falls back to English. Test `setLocale` writes cookie.

**Checkpoint**: All UI text comes from locale files. French sample renders correctly. Adding a new locale requires only a JSON file.

---

## Phase 7: User Story 5 — Keyboard Navigation and Screen Reader Support (Priority: P2)

**Goal**: Full training flow completable via keyboard only. Screen readers announce content and state changes correctly.

**Independent Test**: Navigate the complete training flow using only Tab/Enter/arrow keys. Enable VoiceOver and verify announcements at each step.

### Implementation for User Story 5

- [x] T034 [P] [US5] Audit and fix `app/[tenant]/auth/signin/page.tsx` — add `<main>` landmark, ensure the SSO link has descriptive `aria-label`, add heading hierarchy (`<h1>` for page title), ensure form elements have associated `<label>` elements, add skip-nav target anchor.
- [x] T035 [P] [US5] Audit and fix `app/[tenant]/dashboard/page.tsx` — add `<main>` landmark, ensure heading hierarchy (`<h1>` for welcome, `<h2>` for sections), add `aria-label` to navigation elements, ensure all interactive elements have visible focus indicators, add skip-nav target anchor.
- [x] T036 [US5] Audit `app/[tenant]/training/page.tsx` — verify existing ARIA attributes (`aria-live`, `aria-label`, `aria-labelledby`, `role="progressbar"`, `role="alert"`) are correctly applied. Verify focus management via `firstFocusRef` works on all state transitions. Check that quiz radio buttons are in a `<fieldset>` with `<legend>`. Ensure scenario response textareas have labels. Fix any gaps found.
- [x] T037 [US5] Add skip-navigation link to `app/layout.tsx` — add a visually hidden "Skip to main content" link as the first focusable element in `<body>`. Style it to become visible on focus. Link targets `#main-content` id on each page's `<main>` element.
- [x] T038 [US5] Verify non-color indicators — check all pass/fail displays in the training flow (evaluation results, quiz feedback) use text labels or icons alongside color. If any rely solely on color, add text indicators (e.g., "Passed" / "Failed" labels, checkmark/cross icons).
- [x] T039 [US5] Add accessibility tests in `tests/unit/a11y/` — for each page component, render with a test renderer and assert: `<main>` landmark exists, heading hierarchy is valid (no skipped levels), all `<input>` elements have associated labels or `aria-label`, all `<button>` elements have accessible names, `aria-live` regions exist for dynamic content areas.

**Checkpoint**: All pages have proper landmarks, headings, labels. Training flow is keyboard-navigable with screen reader announcements.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, config examples, final validation.

- [x] T040 [P] Add example configuration documentation — create or update `docs/` or inline comments in `config/defaults.yaml` and example tenant files showing the new `retention.transcripts` settings with explanations.
- [x] T041 [P] Add security guidance for deployers — document in quickstart.md or a new `docs/security.md`: how to verify redaction is active, how to configure retention, how to secure the purge endpoint, audit event retention considerations.
- [x] T042 Run `pnpm lint` and `pnpm type-check` — fix any Biome or TypeScript errors across all new and modified files. Run `npx biome check --write` on new files to fix formatting.
- [x] T043 Run `pnpm test` — ensure all existing tests still pass alongside new tests. Fix any regressions.
- [x] T044 Run quickstart.md validation — manually walk through each testing scenario in `specs/008-guardrails-i18n-a11y/quickstart.md` to verify end-to-end behavior.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) — BLOCKS all user stories
- **US1 Secret Redaction (Phase 3)**: Depends on T005 (SecretRedactor)
- **US2 Audit Trail (Phase 4)**: Depends on T004 (AuditLogger)
- **US3 Retention (Phase 5)**: Depends on T006-T007 (config schema) and T009-T010 (transcript write paths from US1)
- **US4 i18n (Phase 6)**: Depends on Phase 2 only — independent of guardrails work
- **US5 Accessibility (Phase 7)**: Depends on Phase 2 only — independent of guardrails work. If US4 is done first, a11y work benefits from already-refactored pages.
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent after foundational — no cross-story dependencies
- **US2 (P1)**: Independent after foundational — no cross-story dependencies
- **US3 (P2)**: Soft dependency on US1 (reuses same transcript write paths modified in T009-T010)
- **US4 (P2)**: Independent — can run in parallel with US1/US2/US3
- **US5 (P2)**: Independent — can run in parallel. Benefits from US4 being done first (pages already refactored)

### Within Each User Story

- Models/types before services
- Services before route integration
- Route integration before tests
- Story complete before moving to next priority

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- US1 and US2 can run in parallel after foundational phase (different domains)
- US4 and US5 can run in parallel (different concerns)
- T026 and T027 can run in parallel (data file vs code)
- T034 and T035 can run in parallel (different page files)

---

## Parallel Example: User Story 1

```bash
# After foundational phase (T004-T007), launch US1 tasks:
# T008 (audit write paths) must complete first
# Then T009 and T010 can run in parallel (different route files)
Task: "T009 - Integrate SecretRedactor into scenario response storage"
Task: "T010 - Integrate SecretRedactor into quiz answer storage"
# T011 (tests) after T009+T010 complete
```

## Parallel Example: User Story 4

```bash
# T026 and T027 can run in parallel (locale data vs i18n module):
Task: "T026 - Create src/i18n/locales/en.json"
Task: "T027 - Create src/i18n/index.ts"
# Then T028 (fr.json) after T026 (needs en.json key structure)
# Then T029-T032 sequentially (each page refactor)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T007)
3. Complete Phase 3: US1 Secret Redaction (T008-T011)
4. Complete Phase 4: US2 Audit Trail (T012-T019)
5. **STOP and VALIDATE**: Secrets are redacted, audit events are recorded
6. Deploy/demo — core guardrails are active

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Secrets redacted in transcripts (MVP guardrail)
3. Add US2 → Immutable audit trail active (full P1 scope)
4. Add US3 → Tenant retention controls live
5. Add US4 → UI text externalized, French sample available
6. Add US5 → Full accessibility compliance
7. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All new source files must include Apache 2.0 license headers
- Run `npx biome check --write` on new files to fix formatting
- Use `vi.hoisted()` pattern for mocks in test files (project convention)
