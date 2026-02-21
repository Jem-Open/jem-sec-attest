# Tasks: PDF Evidence Export

**Input**: Design documents from `/specs/006-pdf-evidence-export/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included — the spec requires quality gates and contract compliance per the constitution.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and prepare project structure for PDF export feature

- [x] T001 Install pdfkit and @types/pdfkit dependencies via `pnpm add pdfkit && pnpm add -D @types/pdfkit`
- [x] T002 Add optional `trainingType` field (`z.enum(["onboarding", "annual", "other"]).optional()`) to `EvidenceBodySchema` in `src/evidence/schemas.ts`
- [x] T003 Create directory structure for new route: `app/api/training/[tenant]/evidence/[sessionId]/pdf/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core PDF rendering module that all user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create `src/evidence/pdf-renderer.ts` with `renderEvidencePdf(evidence: TrainingEvidence, tenantDisplayName: string): Promise<Buffer>` function — implement header section (tenant display name, document title "Training Evidence Certificate", generation timestamp)
- [x] T005 Add employee & session info section to `src/evidence/pdf-renderer.ts` — employee ID, tenant ID, training type (from `evidence.trainingType` or "Not specified"), session dates, attempt number
- [x] T006 Add outcome summary section to `src/evidence/pdf-renderer.ts` — pass/fail indicator, aggregate score, pass threshold, weak areas list
- [x] T007 Add module summary table to `src/evidence/pdf-renderer.ts` — table with module title, topic area, score per module for all modules
- [x] T008 Add quiz detail per module section to `src/evidence/pdf-renderer.ts` — for each module: question text, selected answer or free-text response, score, LLM rationale (for free-text questions)
- [x] T009 Add policy attestation section to `src/evidence/pdf-renderer.ts` — config hash, role profile ID/version, app version, pass threshold, max attempts
- [x] T010 Add integrity footer section to `src/evidence/pdf-renderer.ts` — content hash (SHA-256), schema version, evidence generation timestamp, evidence ID

**Checkpoint**: PDF renderer can produce a complete PDF buffer from any TrainingEvidence record

---

## Phase 3: User Story 1 - Export Training Evidence as PDF (Priority: P1) MVP

**Goal**: Auditors can request and download a PDF for any completed training session containing all required audit fields.

**Independent Test**: Request a PDF for a completed training session and verify the document contains all required fields and is well-formatted.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T011 [P] [US1] Unit test for `renderEvidencePdf` in `tests/unit/evidence/pdf-renderer.spec.ts` — verify PDF buffer is returned for a passed session, exhausted session, and abandoned session; verify all 7 sections are present (use PDF text extraction or buffer size assertions)
- [x] T012 [P] [US1] Contract test for GET `/api/training/{tenant}/evidence/{sessionId}/pdf` in `tests/contract/evidence/pdf-export-api.spec.ts` — verify: 200 with `application/pdf` content-type for completed session, 401 for unauthenticated, 404 for missing evidence, Content-Disposition header with correct filename format

### Implementation for User Story 1

- [x] T013 [US1] Create `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts` with GET handler — implement auth check (x-tenant-id, x-employee-id headers), tenant slug validation, role-based access (admin unrestricted, employee own-only)
- [x] T014 [US1] Add evidence lookup to route handler in `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts` — fetch evidence via `EvidenceRepository.findBySessionId()`, return 404 if not found, resolve tenant display name from config
- [x] T015 [US1] Add PDF generation and response in `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts` — call `renderEvidencePdf()`, return binary response with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="evidence-{tenantId}-{employeeId}-{sessionId}.pdf"` headers
- [x] T016 [US1] Add Apache 2.0 license headers to all new source files: `src/evidence/pdf-renderer.ts`, `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts`
- [x] T017 [US1] Run `npx biome check --write` on all new files and verify `pnpm lint` passes
- [x] T018 [US1] Run `pnpm test` to verify all existing tests still pass and new US1 tests pass

**Checkpoint**: User Story 1 fully functional — admin can export PDF for any completed session. MVP delivered.

---

## Phase 4: User Story 2 - Verify Evidence Integrity from PDF (Priority: P2)

**Goal**: The content hash and schema version printed in the PDF match the stored evidence record, allowing auditors to verify tamper-free evidence.

**Independent Test**: Export a PDF and confirm the content hash and schema version printed on the PDF match the evidence record in the database.

### Tests for User Story 2

- [x] T019 [US2] Add integrity verification tests to `tests/unit/evidence/pdf-renderer.spec.ts` — verify the exact contentHash string from the evidence record appears in the PDF output; verify schemaVersion appears in the PDF output

### Implementation for User Story 2

- [x] T020 [US2] Verify integrity footer in `src/evidence/pdf-renderer.ts` renders the exact `contentHash` and `schemaVersion` values from the evidence record (no transformation or truncation) — fix if needed
- [x] T021 [US2] Run `pnpm test` to verify US2 tests pass

**Checkpoint**: Integrity verification confirmed — content hash and schema version in PDF match stored evidence exactly.

---

## Phase 5: User Story 3 - Retry After PDF Generation Failure (Priority: P2)

**Goal**: When PDF generation fails, the user receives a clear error message and can retry by simply re-requesting the same URL.

**Independent Test**: Simulate a generation failure and verify the error response includes a meaningful message and the retry produces the PDF if the issue is resolved.

### Tests for User Story 3

- [x] T022 [US3] Add error handling tests to `tests/contract/evidence/pdf-export-api.spec.ts` — verify: 500 response with `{ error: "pdf_generation_failed", message: "..." }` when renderer throws; verify retry (second request) succeeds after underlying issue resolves

### Implementation for User Story 3

- [x] T023 [US3] Add try-catch around `renderEvidencePdf()` call in `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts` — catch errors and return `NextResponse.json({ error: "pdf_generation_failed", message: error.message }, { status: 500 })`
- [x] T024 [US3] Run `pnpm test` to verify US3 tests pass

**Checkpoint**: Error handling confirmed — failures return clear messages, retries work as fresh requests.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T025 Run `pnpm type-check` to verify no TypeScript errors across the project
- [x] T026 Run `pnpm test` to verify all 1023 tests pass (50 files)
- [ ] T027 Validate quickstart.md by executing the curl command against a running dev server
- [x] T028 Verify OpenAPI contract in `specs/006-pdf-evidence-export/contracts/pdf-export.yaml` matches the implemented route behavior

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase — core MVP
- **User Story 2 (Phase 4)**: Depends on Foundational phase — can run in parallel with US1 (tests only touch renderer)
- **User Story 3 (Phase 5)**: Depends on US1 (route handler must exist for error handling)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — Tests verify renderer output, independent of route
- **User Story 3 (P2)**: Depends on US1 — adds error handling to the route created in US1

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Schema changes before renderer
- Renderer before route handler
- Route handler before error handling
- Lint and type-check after each story

### Parallel Opportunities

- T011 and T012 can run in parallel (different test files)
- US1 and US2 implementation can overlap (US2 only touches renderer tests, US1 creates the route)
- T025 and T026 can run in parallel (different commands)

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests in parallel (different files):
Task: "Unit test for renderEvidencePdf in tests/unit/evidence/pdf-renderer.spec.ts"
Task: "Contract test for GET endpoint in tests/contract/evidence/pdf-export-api.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T010)
3. Complete Phase 3: User Story 1 (T011-T018)
4. **STOP and VALIDATE**: Test PDF export for a completed session
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → PDF renderer ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Verify integrity hashes → Deploy/Demo
4. Add User Story 3 → Verify error handling → Deploy/Demo
5. Polish phase → Final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- pdfkit generates PDFs as Node.js streams — collect into Buffer for response
