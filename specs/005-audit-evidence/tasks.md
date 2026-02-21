# Tasks: Audit-Ready Training Evidence

**Input**: Design documents from `/specs/005-audit-evidence/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — constitution (Principle VII) mandates comprehensive automated tests for evidence bundle generation and integrity.

**Organization**: Tasks are grouped by user story. US1 (generation) and US2 (integrity/versioning) are combined into one phase since integrity hashing is inherent to the generation process — you cannot generate evidence without computing its content hash.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create directory structure for new evidence module

- [x] T001 Create directory structure: `src/evidence/`, `app/api/training/[tenant]/evidence/[sessionId]/generate/`, `tests/unit/evidence/`, `tests/integration/evidence/`, `tests/contract/evidence/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schemas, hash utility, and repository that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create evidence Zod schemas (TrainingEvidence, EvidenceBody, SessionSummary, PolicyAttestation, ModuleEvidence, ScenarioEvidence, QuizQuestionEvidence, AnswerEvidence, OutcomeSummary, EvidenceSummary) in `src/evidence/schemas.ts` — follow data-model.md field definitions exactly; include Apache 2.0 license header; use `.js` extension in relative imports
- [x] T003 [P] Create SHA-256 canonical hash utility in `src/evidence/hash.ts` — export `computeContentHash(evidenceBody: EvidenceBody): string` that produces deterministic SHA-256 hex digest via `JSON.stringify` with sorted keys and `crypto.createHash("sha256")`; include Apache 2.0 license header
- [x] T004 [P] Create unit test for hash utility in `tests/unit/evidence/hash.spec.ts` — test deterministic output, key ordering independence, different inputs produce different hashes, empty/minimal inputs
- [x] T005 Create evidence repository in `src/evidence/evidence-repository.ts` — export `EvidenceRepository` class wrapping `StorageAdapter` with methods: `create(tenantId, data)`, `findBySessionId(tenantId, sessionId)`, `findById(tenantId, id)`, `listByTenant(tenantId, filters)` (with post-filtering for date range and outcome); NO update or delete methods (immutability); use `"evidence"` collection constant; include Apache 2.0 license header
- [x] T006 Create unit test for evidence repository in `tests/unit/evidence/evidence-repository.spec.ts` — use `vi.hoisted()` pattern to mock StorageAdapter; test create, findBySessionId, findById, listByTenant with filters (employeeId, date range, outcome); verify no update/delete methods exist on the class

**Checkpoint**: Foundation ready — schemas validated, hash utility tested, repository tested

---

## Phase 3: User Story 1+2 — Generate Evidence on Session Completion + Integrity (Priority: P1) MVP

**Goal**: Automatically generate a complete, hash-verified evidence record when any training session reaches a terminal state (passed, exhausted, abandoned). Evidence includes all questions, answers, scores, rationales, policy attestation, timestamps, schema version, and SHA-256 content hash.

**Independent Test**: Complete a training session via the evaluate or abandon route and verify an evidence record is created in storage with all required fields, correct content hash, and schema version 1.

### Implementation for User Story 1+2

- [x] T007 [US1] Implement evidence generator in `src/evidence/evidence-generator.ts` — export `generateEvidenceForSession(storage: StorageAdapter, tenantId: string, sessionId: string): Promise<TrainingEvidence>` that: (1) loads session via SessionRepository, (2) validates session is in terminal state, (3) checks idempotency (return existing evidence if found), (4) loads all modules via SessionRepository, (5) loads tenant config for passThreshold/maxAttempts, (6) assembles EvidenceBody (session summary, policy attestation from session.configHash/roleProfileId/roleProfileVersion/appVersion, module evidence with question text + scenario narratives + employee answers + scores + rationales stripped of `correct`/`rubric` fields, outcome summary), (7) computes content hash via `computeContentHash`, (8) creates TrainingEvidence record via EvidenceRepository with schemaVersion=1, (9) returns created record; include Apache 2.0 license header
- [x] T008 [US1] Create unit test for evidence generator in `tests/unit/evidence/evidence-generator.spec.ts` — use `vi.hoisted()` pattern to mock StorageAdapter, SessionRepository, EvidenceRepository, and config; test: passed session generates complete evidence, exhausted session generates evidence with weak areas, abandoned session generates evidence with partial data, idempotency returns existing record, non-terminal session throws error, content hash matches recomputation, schema version is 1, correct/rubric fields are excluded from evidence, all timestamps are present
- [x] T009 [US1] Wire fire-and-forget evidence generation into `app/api/training/[tenant]/evaluate/route.ts` — after successful session update to "passed" or "exhausted" status (after audit logging), call `generateEvidenceForSession(tenantId, sessionId).catch((err) => console.error("Evidence generation failed:", err))`; import from `@/evidence/evidence-generator`
- [x] T010 [US1] Wire fire-and-forget evidence generation into `app/api/training/[tenant]/abandon/route.ts` — after successful session update to "abandoned" status (after audit logging), call `generateEvidenceForSession(tenantId, sessionId).catch((err) => console.error("Evidence generation failed:", err))`; import from `@/evidence/evidence-generator`

**Checkpoint**: At this point, every session reaching a terminal state automatically generates a hash-verified evidence record. US1+US2 are fully functional. Evidence can be verified by querying the `"evidence"` collection directly.

---

## Phase 4: User Story 3 — Export Evidence as Shareable Artifact (Priority: P2)

**Goal**: Provide a GET endpoint to retrieve a complete evidence record by session ID as a self-contained JSON document, with role-based access control (employees see own evidence, compliance/admin see all).

**Independent Test**: Call GET `/api/training/{tenant}/evidence/{sessionId}` with a valid session ID and verify a complete JSON evidence record is returned. Test both employee self-access and admin cross-employee access.

### Implementation for User Story 3

- [x] T011 [US3] Implement GET route in `app/api/training/[tenant]/evidence/[sessionId]/route.ts` — auth check (x-tenant-id matches URL, x-employee-id required), extract x-employee-role header (default "employee"), create StorageAdapter + EvidenceRepository, find evidence by sessionId, if not found return 404 `{ error: "not_found", message: "No evidence found for this session" }`, if employee role and evidence.employeeId !== requesting employeeId return 403, return 200 with full TrainingEvidence JSON; finally close storage; include Apache 2.0 license header
- [x] T012 [US3] Create unit test for GET evidence route in `tests/unit/evidence/evidence-route.spec.ts` — use `vi.hoisted()` pattern; test: 200 with valid evidence for own session (employee), 200 for any session (compliance role), 200 for any session (admin role), 403 when employee accesses another employee's evidence, 404 when no evidence exists, 401 when headers missing/mismatched, proper storage cleanup in finally block

**Checkpoint**: Evidence can now be retrieved as a shareable JSON artifact via API. US1+US2+US3 all functional.

---

## Phase 5: User Story 4 — List Evidence + Manual Generation (Priority: P3)

**Goal**: Provide list and manual generation endpoints for compliance officers. List supports filtering by employee, date range, and outcome. Manual generate allows retry of failed evidence generation.

**Independent Test**: Generate evidence for multiple sessions, then call GET `/api/training/{tenant}/evidence` with various filters and verify correct results. Call POST `/api/training/{tenant}/evidence/{sessionId}/generate` for a session missing evidence and verify it gets created.

### Implementation for User Story 4

- [x] T013 [US4] Implement GET list route in `app/api/training/[tenant]/evidence/route.ts` — auth check, require compliance/admin role (return 403 for employee role), parse query params (employeeId, outcome, from, to, limit default 20 max 100, offset default 0), create StorageAdapter + EvidenceRepository, call `listByTenant(tenantId, filters)`, map results to EvidenceSummary (strip full evidence body, include outcome summary), return 200 `{ items, total, limit, offset }`; include Apache 2.0 license header
- [x] T014 [P] [US4] Implement POST generate route in `app/api/training/[tenant]/evidence/[sessionId]/generate/route.ts` — auth check, require compliance/admin role (return 403 for employee role), create StorageAdapter + SessionRepository + EvidenceRepository, find session by ID (404 if not found), validate session is in terminal state (409 if not), call `generateEvidenceForSession` (NOT fire-and-forget — await result), return 200 if evidence already existed (idempotent) or 201 if newly created; include Apache 2.0 license header
- [x] T015 [US4] Create unit test for list route in `tests/unit/evidence/evidence-list-route.spec.ts` — use `vi.hoisted()` pattern; test: 200 with paginated results for admin, 403 for employee role, filtering by employeeId/outcome/date range, default pagination (limit=20, offset=0), empty results return empty array with total=0
- [x] T016 [P] [US4] Create unit test for generate route in `tests/unit/evidence/evidence-generate-route.spec.ts` — use `vi.hoisted()` pattern; test: 201 for newly generated evidence, 200 for idempotent return of existing evidence, 403 for employee role, 404 for missing session, 409 for non-terminal session, 401 for missing auth headers

**Checkpoint**: All four user stories are complete. Full evidence lifecycle: auto-generation, integrity, retrieval, listing, and manual retry.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, contract validation, and code quality

- [x] T017 Create integration test in `tests/integration/evidence/evidence-workflow.spec.ts` — use real SQLite adapter; test full workflow: create session → complete modules → evaluate (trigger evidence generation) → retrieve evidence via repository → verify all fields populated, content hash valid, schema version correct; also test abandon flow produces evidence
- [x] T018 [P] Create contract test in `tests/contract/evidence/evidence-schema.spec.ts` — validate generated evidence JSON against Zod schemas; verify EvidenceSummary projection strips evidence body; verify content hash recomputation matches stored hash
- [x] T019 Run `npx biome check --write` on all new files in `src/evidence/` and `app/api/training/[tenant]/evidence/` to fix formatting
- [x] T020 Run full test suite (`pnpm test`) and verify all existing + new tests pass; run `pnpm type-check` and `pnpm lint` to verify no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1+US2 (Phase 3)**: Depends on Phase 2 — MVP delivery
- **US3 (Phase 4)**: Depends on Phase 2 (schemas + repository). Can start in parallel with Phase 3 if needed, but recommended after Phase 3 so evidence records exist to retrieve.
- **US4 (Phase 5)**: Depends on Phase 2 (schemas + repository). Can start in parallel with Phase 3/4 if needed.
- **Polish (Phase 6)**: Depends on all user story phases being complete

### User Story Dependencies

- **US1+US2 (P1)**: Core generation — no dependencies on other stories. MVP.
- **US3 (P2)**: Retrieval endpoint — functionally independent but benefits from US1+US2 being complete (evidence records to retrieve)
- **US4 (P3)**: List + manual generate — functionally independent but benefits from US1+US2 being complete

### Within Each Phase

- Schemas (T002) before repository (T005) and generator (T007)
- Hash utility (T003) before generator (T007)
- Repository (T005) before generator (T007)
- Generator (T007) before route wiring (T009, T010)
- Unit tests can run in parallel with their corresponding implementation where marked [P]

### Parallel Opportunities

- T003 (hash utility) and T004 (hash test) can run in parallel with T002 (schemas)
- T009 (evaluate route) and T010 (abandon route) can run in parallel after T007
- T011 (GET route) and T013/T014 (list/generate routes) target different files — can run in parallel
- T015 and T016 (US4 tests) can run in parallel
- T017 and T018 (integration + contract tests) can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```bash
# These target different files and can run simultaneously:
Task: "Create evidence Zod schemas in src/evidence/schemas.ts"          # T002
Task: "Create SHA-256 hash utility in src/evidence/hash.ts"             # T003
Task: "Create unit test for hash utility in tests/unit/evidence/hash.spec.ts"  # T004

# After T002 completes:
Task: "Create evidence repository in src/evidence/evidence-repository.ts"      # T005
Task: "Create unit test for repository in tests/unit/evidence/evidence-repository.spec.ts"  # T006
```

## Parallel Example: Phase 5 (US4)

```bash
# These target different files and can run simultaneously:
Task: "Implement GET list route in app/api/training/[tenant]/evidence/route.ts"          # T013
Task: "Implement POST generate route in app/api/.../generate/route.ts"                   # T014

# After both routes complete, tests can run in parallel:
Task: "Create unit test for list route in tests/unit/evidence/evidence-list-route.spec.ts"    # T015
Task: "Create unit test for generate route in tests/unit/evidence/evidence-generate-route.spec.ts"  # T016
```

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T006)
3. Complete Phase 3: US1+US2 (T007-T010)
4. **STOP and VALIDATE**: Run unit tests, verify evidence is generated on session completion, verify content hash integrity
5. This delivers the core value: audit-ready evidence is automatically created for every completed session

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1+US2 → Auto-generation with integrity → **MVP!**
3. Add US3 → Evidence retrieval via API → Auditors can export evidence
4. Add US4 → List + manual retry → Full audit workflow complete
5. Polish → Integration/contract tests, formatting, final validation

### Parallel Team Strategy

With multiple developers after Phase 2:
- Developer A: US1+US2 (Phase 3) — core generation
- Developer B: US3 (Phase 4) — retrieval route (can stub evidence data)
- Developer C: US4 (Phase 5) — list + generate routes (can stub evidence data)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1+US2 are combined because integrity (hashing, versioning) is inherent to generation — cannot generate without hashing
- Evidence excludes `correct` and `rubric` fields (server-only) — consistent with existing client-safe stripping
- Fire-and-forget pattern for auto-generation matches existing audit logging pattern
- Manual generate route (T014) is NOT fire-and-forget — it awaits the result to return 200/201
- All new files need Apache 2.0 license headers and Biome formatting
- Route files use `@/` alias imports without `.js` extension; src files use `.js` extension
