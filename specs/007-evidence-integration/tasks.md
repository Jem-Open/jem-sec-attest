# Tasks: Compliance Evidence Integration

**Input**: Design documents from `/specs/007-evidence-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `src/compliance/` module structure and define the core types and interfaces that all user stories depend on.

- [x] T001 Create compliance module directory structure: `src/compliance/`, `src/compliance/providers/`, `tests/unit/compliance/`, `tests/integration/compliance/`, `tests/contract/compliance/`
- [x] T002 Create compliance types and interfaces in `src/compliance/types.ts` — define `ComplianceProvider` interface, `UploadResult` discriminated union (`UploadSuccess | UploadFailure`), `ProviderConfig` type, and `ComplianceUploadRecord` type per `contracts/compliance-provider.ts` and `data-model.md`. Include Apache 2.0 license header.
- [x] T003 Create compliance Zod schemas in `src/compliance/schemas.ts` — define `ComplianceUploadSchema` (all fields from data-model.md: id, tenantId, evidenceId, sessionId, provider, status enum, attemptCount, maxAttempts, providerReferenceId, lastError, lastErrorCode, retryable, createdAt, updatedAt, completedAt) and `ComplianceConfigSchema` (provider enum, apiKeyRef with `${VAR}` regex, workflowCheckId UUID, region enum, retry block with defaults). Include Apache 2.0 license header.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Extend tenant config schema in `src/config/schema.ts` — add optional `compliance` field to the `integrations` object inside `TenantSettingsSchema`. Import and use `ComplianceConfigSchema` from `src/compliance/schemas.ts`. The `.strict()` constraint on the integrations object requires adding the field to the Zod schema definition. Ensure `apiKeyRef` uses the same `${VAR}` env var reference regex pattern already used by OIDC `clientSecret`.
- [x] T005 [P] Create `ComplianceUploadRepository` in `src/compliance/upload-repository.ts` — implement CRUD operations against `StorageAdapter` using collection `"compliance_uploads"`. Methods: `create(tenantId, data)`, `findByEvidenceId(tenantId, evidenceId, provider)` (for idempotency check), `update(tenantId, id, data)` (for status transitions), `findById(tenantId, id)`, `listByTenant(tenantId, filters?)`. Follow the same pattern as `src/evidence/evidence-repository.ts`. Include Apache 2.0 license header.
- [x] T006 [P] Create Sprinto endpoint URL resolver in `src/compliance/providers/sprinto.ts` — implement `getSprintoEndpoint(region: "us" | "eu" | "india"): string` mapping to the three regional GraphQL URLs from `contracts/sprinto-graphql.md`. This is a prerequisite for the full Sprinto provider but can be implemented and tested independently. Include Apache 2.0 license header.

**Checkpoint**: Foundation ready — types, schemas, config extension, repository, and endpoint resolver are in place.

---

## Phase 3: User Story 1 — Automatic Evidence Push to Sprinto (Priority: P1) MVP

**Goal**: When evidence is generated for a completed training session on a Sprinto-enabled tenant, the PDF evidence is automatically uploaded to Sprinto via the `UploadWorkflowCheckEvidence` GraphQL mutation.

**Independent Test**: Complete a training session for a Sprinto-enabled tenant and verify the evidence PDF is uploaded to Sprinto and a `ComplianceUpload` record with status `"succeeded"` is persisted.

### Implementation for User Story 1

- [x] T007 [US1] Implement `SprintoProvider` in `src/compliance/providers/sprinto.ts` — implement the `ComplianceProvider` interface with a single `uploadEvidence(pdfBuffer, evidence, config)` method. Build the GraphQL multipart request per `contracts/sprinto-graphql.md`: construct `FormData` with three parts (operations JSON, map JSON, PDF file as `evidence-{sessionId}.pdf`). Set `api-key` header from `config.apiKey`. Map the `evidenceRecordDate` from `evidence.generatedAt` to `YYYY-MM-DD` format. Parse success response (`data.uploadWorkflowCheckEvidence.workflowCheck.evidenceStatus`) and error responses (HTTP 401/429/5xx and GraphQL application errors). Classify each error as retryable or non-retryable per the error table in `contracts/sprinto-graphql.md`. Use native `fetch` — no external HTTP library.
- [x] T008 [US1] Implement `ComplianceUploadOrchestrator` in `src/compliance/orchestrator.ts` — implement `dispatchUpload(tenantId, evidenceId, storage)`. Flow: (1) read tenant config from `getSnapshot()`, check if `settings.integrations?.compliance` exists, return early if not; (2) idempotency check via `uploadRepo.findByEvidenceId()`; (3) create `ComplianceUpload` record with status `"pending"`; (4) load evidence via `EvidenceRepository.findById()`; (5) render PDF via `renderEvidencePdf(evidence, tenantDisplayName)`; (6) resolve provider from config (only `"sprinto"` initially); (7) execute upload with retry loop — exponential backoff with jitter, `initialDelayMs * 2^attempt` capped at `maxDelayMs`, stop on success or non-retryable error or `maxAttempts` reached; (8) update `ComplianceUpload` record with final status, attemptCount, error details, completedAt; (9) log outcome. The orchestrator takes a `StorageAdapter` parameter (reuses the one from evidence generator).
- [x] T009 [US1] Modify `generateEvidenceForSession()` in `src/evidence/evidence-generator.ts` — after `evidenceRepo.create()` returns the persisted evidence, call `dispatchUpload(tenantId, evidence.id, storage)` from the orchestrator as a chained fire-and-forget (`.catch()` logs errors, same pattern as the existing fire-and-forget in the evaluate route). Import the orchestrator. Pass the existing `storage` adapter instance so the orchestrator does not open a separate DB connection.
- [x] T010 [US1] Create example tenant config with Sprinto compliance in `config/tenants/example-sprinto.yaml.example` — a complete, commented YAML file showing all compliance integration fields with placeholder values per `contracts/sprinto-graphql.md` tenant config example. Include comments explaining each field. Add corresponding env var example to `.env.example` (e.g., `EXAMPLE_SPRINTO_API_KEY=`).

**Checkpoint**: User Story 1 complete — evidence generated for Sprinto-enabled tenants triggers automatic PDF upload via GraphQL. Upload status is recorded in `compliance_uploads` collection.

---

## Phase 4: User Story 2 — Retry and Failure Handling (Priority: P2)

**Goal**: Transient upload failures (network errors, rate limits, server errors) are automatically retried with exponential backoff. Non-retryable errors fail immediately. All outcomes are logged with actionable detail.

**Independent Test**: Simulate a Sprinto endpoint that fails with 429/5xx on the first N attempts then succeeds, and verify the orchestrator retries correctly, records attempt count, and eventually succeeds. Simulate a 401 and verify no retry occurs.

**Note**: The retry loop is already built into the orchestrator in T008. This phase focuses on hardening, edge cases, and logging.

### Implementation for User Story 2

- [x] T011 [US2] Add structured logging to orchestrator in `src/compliance/orchestrator.ts` — enhance the retry loop to log each attempt with: tenantId, evidenceId, provider, attemptNumber, maxAttempts, errorCode (if failed), retryable flag, delay before next retry. Log final outcome (success or exhaustion) with total attempt count and total elapsed time. Use `console.error` for failures and `console.info` for successes (consistent with existing evidence generator logging).
- [x] T012 [US2] Handle edge cases in orchestrator `src/compliance/orchestrator.ts` — (1) if evidence record not found (deleted between generation and upload), log error and mark ComplianceUpload as failed with errorCode `"EVIDENCE_NOT_FOUND"`; (2) if PDF rendering fails, log error and mark failed with errorCode `"PDF_RENDER_FAILED"`; (3) if provider resolution fails (unknown provider name), log error and mark failed with errorCode `"UNKNOWN_PROVIDER"`; (4) ensure `completedAt` is always set when reaching terminal state.

**Checkpoint**: User Story 2 complete — retry logic handles all error categories, logs every attempt, and records detailed outcomes.

---

## Phase 5: User Story 3 — Per-Tenant Integration Configuration (Priority: P3)

**Goal**: Tenant administrators can configure compliance integration via YAML. Configuration is validated at startup with clear error messages for invalid settings.

**Independent Test**: Add compliance config to a tenant YAML file, restart the app, and verify the config is loaded and validated. Test with invalid config (missing fields, bad provider name) and verify rejection with clear error messages.

### Implementation for User Story 3

- [x] T013 [US3] Add config validation tests in `tests/unit/compliance/config-validation.spec.ts` — test that `ComplianceConfigSchema` accepts valid Sprinto config, rejects missing `provider`, rejects unknown provider values, rejects `apiKeyRef` without `${VAR}` pattern, rejects invalid `region`, applies retry defaults when `retry` block is omitted, validates retry field ranges. Use `vi.hoisted()` pattern per project conventions.
- [x] T014 [US3] Add config integration test in `tests/integration/compliance/config-loading.spec.ts` — test that `loadConfigFromFiles()` with a tenant YAML containing a valid compliance block produces a `ConfigSnapshot` where `tenant.settings.integrations.compliance` is correctly parsed. Test that a tenant YAML with no compliance block has `undefined` compliance config. Test that an invalid compliance block causes `loadConfigFromFiles()` to throw a validation error.

**Checkpoint**: User Story 3 complete — compliance config is validated at startup, invalid configs produce clear errors, and tenants without config are unaffected.

---

## Phase 6: User Story 4 — Upload Status Visibility (Priority: P4)

**Goal**: Administrators can see compliance upload status (pending, succeeded, failed) on evidence records through the existing evidence API.

**Independent Test**: Query the evidence list endpoint for a tenant with completed uploads and verify each evidence record includes its compliance upload status.

### Implementation for User Story 4

- [x] T015 [US4] Modify evidence list endpoint in `app/api/training/[tenant]/evidence/route.ts` — after fetching evidence items, look up `ComplianceUpload` records for each evidence ID via `ComplianceUploadRepository.findByEvidenceId()`. Attach a `complianceUpload` field to each evidence summary in the response: `{ provider, status, attemptCount, lastError, completedAt }` or `null` if no upload exists. Only perform lookups for tenants with compliance integration enabled (check config first).
- [x] T016 [US4] Modify evidence detail endpoint in `app/api/training/[tenant]/evidence/[sessionId]/route.ts` — after fetching the evidence record, look up the `ComplianceUpload` record for this evidence. Attach the full `ComplianceUpload` record (all fields from data-model.md) to the response under a `complianceUpload` key, or `null` if no upload exists.

**Checkpoint**: User Story 4 complete — admins can see upload status on evidence list and detail endpoints.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Testing, documentation, and cleanup across all stories.

- [x] T017 [P] Create unit tests for SprintoProvider in `tests/unit/compliance/sprinto-provider.test.ts` — test GraphQL multipart request construction (correct FormData parts, headers, variable mapping), success response parsing, HTTP error classification (401→non-retryable, 429→retryable, 5xx→retryable), GraphQL error classification ("Incorrect check ID"→non-retryable, etc.), network error handling (ECONNREFUSED→retryable). Mock `fetch` globally.
- [x] T018 [P] Create unit tests for orchestrator in `tests/unit/compliance/orchestrator.test.ts` — test: (1) skips upload when tenant has no compliance config; (2) idempotency — returns without uploading when ComplianceUpload already exists; (3) creates pending record then updates to succeeded on success; (4) retries on retryable failures up to maxAttempts; (5) does not retry non-retryable errors; (6) exponential backoff delay calculation; (7) marks failed after exhausting retries; (8) handles missing evidence gracefully. Use `vi.hoisted()` pattern to mock `EvidenceRepository`, `ComplianceUploadRepository`, provider, `getSnapshot()`, and `renderEvidencePdf`.
- [x] T019 [P] Create unit tests for upload repository in `tests/unit/compliance/upload-repository.test.ts` — test `create`, `findByEvidenceId`, `update`, `listByTenant` against mocked `StorageAdapter`. Use `vi.hoisted()` pattern.
- [x] T020 [P] Create contract test for ComplianceProvider interface in `tests/contract/compliance/provider-contract.test.ts` — verify `SprintoProvider` implements the `ComplianceProvider` interface: has `name` property, `uploadEvidence` method returns `UploadResult` discriminated union. This ensures future providers can be validated against the same contract.
- [x] T021 [P] Create integration test for full upload flow in `tests/integration/compliance/evidence-upload.test.ts` — test end-to-end: create a training session, generate evidence, verify compliance upload is dispatched. Mock the Sprinto endpoint (mock `fetch`). Verify `ComplianceUpload` record is created with status `"succeeded"`. Test with a tenant that has no compliance config and verify no upload is attempted. Use real `SQLiteAdapter`.
- [x] T022 Run `npx biome check --write src/compliance/ tests/unit/compliance/ tests/integration/compliance/ tests/contract/compliance/` to fix formatting across all new files.
- [x] T023 Run `pnpm type-check` and fix any TypeScript errors across the feature.
- [x] T024 Run `pnpm test` and verify all existing tests still pass (no regressions) and all new tests pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core MVP
- **US2 (Phase 4)**: Depends on T008 (orchestrator from US1)
- **US3 (Phase 5)**: Depends on T004 (config schema from Phase 2) — can run in parallel with US1/US2
- **US4 (Phase 6)**: Depends on T005 (upload repository from Phase 2) — can run in parallel with US1/US2/US3
- **Polish (Phase 7)**: Depends on all user story phases being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational phase. This is the MVP — implements the full upload path.
- **US2 (P2)**: Depends on T008 (orchestrator). Enhances retry behavior and logging.
- **US3 (P3)**: Depends on T004 (config schema). Can run in parallel with US1 if needed — only touches config validation tests.
- **US4 (P4)**: Depends on T005 (upload repository). Can run in parallel with US1 — only touches evidence API endpoints.

### Within Each User Story

- Types/schemas before repository
- Repository before orchestrator
- Orchestrator before evidence generator modification
- Provider before orchestrator (provider is a dependency)

### Parallel Opportunities

- T002 and T003 can run in parallel (different files, no dependencies)
- T005 and T006 can run in parallel (different files)
- US3 and US4 can start as soon as their Phase 2 dependencies are met, potentially in parallel with US1
- All Phase 7 test tasks (T017-T021) can run in parallel
- T022 and T023 can run in parallel

---

## Parallel Example: Phase 2

```bash
# Launch foundational tasks in parallel (different files):
Task: "Create ComplianceUploadRepository in src/compliance/upload-repository.ts"  # T005
Task: "Create Sprinto endpoint URL resolver in src/compliance/providers/sprinto.ts"  # T006
```

## Parallel Example: Phase 7

```bash
# Launch all test tasks in parallel (different test files):
Task: "Unit tests for SprintoProvider in tests/unit/compliance/sprinto-provider.test.ts"  # T017
Task: "Unit tests for orchestrator in tests/unit/compliance/orchestrator.test.ts"  # T018
Task: "Unit tests for upload repository in tests/unit/compliance/upload-repository.test.ts"  # T019
Task: "Contract test for ComplianceProvider in tests/contract/compliance/provider-contract.test.ts"  # T020
Task: "Integration test for full upload flow in tests/integration/compliance/evidence-upload.test.ts"  # T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T006)
3. Complete Phase 3: User Story 1 (T007-T010)
4. **STOP and VALIDATE**: Test with a Sprinto-enabled tenant config — verify PDF upload occurs
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Automatic upload works → Deploy (MVP!)
3. Add User Story 2 → Retry/failure handling hardened → Deploy
4. Add User Story 3 → Config validation verified → Deploy
5. Add User Story 4 → Admin visibility added → Deploy
6. Polish → Tests, formatting, type-check → Final PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The Sprinto API is GraphQL with multipart file upload — no REST fallback available
- Native `fetch` and `FormData` are used — no external HTTP library needed
- All new files require Apache 2.0 license headers
- Run `npx biome check --write` on new files to fix formatting
