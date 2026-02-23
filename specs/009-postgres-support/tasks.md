# Tasks: PostgreSQL Database Support

**Input**: Design documents from `/specs/009-postgres-support/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — contract tests are essential for verifying behavioral parity between adapters.

**Organization**: Tasks are grouped by user story. US1 (Deploy with PostgreSQL) and US3 (Tenant Isolation) are combined as they are both P1 and inseparable — tenant isolation is enforced by every query in the adapter.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure test infrastructure

- [x] T001 Install `postgres` runtime dependency via `pnpm add postgres`
- [x] T002 Install `testcontainers` and `@testcontainers/postgresql` dev dependencies via `pnpm add -D testcontainers @testcontainers/postgresql`

---

## Phase 2: User Story 1+3 — PostgreSQL Adapter with Tenant Isolation (Priority: P1) MVP

**Goal**: Implement a PostgreSQL-backed `StorageAdapter` that passes all existing contract tests with full tenant isolation, using `postgres` (postgres.js) with `jsonb` document-store pattern.

**Independent Test**: Configure a PostgreSQL connection string (Testcontainers), run the full contract test suite against the PostgreSQL adapter, and verify all assertions pass identically to SQLite — including tenant isolation scenarios.

### Implementation for User Story 1+3

- [x] T003 [US1] Create `PostgresAdapter` class implementing `StorageAdapter` interface in `src/storage/postgres-adapter.ts`. Must include:
  - Constructor accepting `{ connectionString: string; max?: number }` options
  - Connection pool via `postgres(connectionString, { max })` with SSL parsed from connection string
  - `initialize()`: CREATE TABLE IF NOT EXISTS `records` with `id TEXT PRIMARY KEY`, `tenant_id TEXT NOT NULL`, `collection TEXT NOT NULL`, `data JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL` + CREATE INDEX IF NOT EXISTS `idx_records_tenant_collection` on `(tenant_id, collection)` — idempotent
  - `create()`: INSERT using tagged template, UUID from `node:crypto`, auto-serialize data to jsonb
  - `findById()`: SELECT with `WHERE id = ${id} AND tenant_id = ${tenantId} AND collection = ${collection}`, return parsed jsonb or null
  - `findMany()`: SELECT with dynamic WHERE from `QueryFilter.where` using `data->>'field'` for json field access, support `orderBy` (with field name validation), `limit`, `offset`
  - `update()`: Read-then-write pattern matching SQLite adapter — fetch existing, merge, UPDATE. Throw Error with record ID if not found
  - `delete()`: DELETE with `WHERE id AND tenant_id AND collection`
  - `transaction()`: Use `sql.begin(async (sql) => { ... })` with TransactionContext delegating to instance methods
  - `getMetadata()`: Return `{ adapterName: "postgres", adapterVersion: "1.0.0" }`
  - `close()`: Call `sql.end()` to drain the connection pool
  - Apache 2.0 license header

- [x] T004 [US1] Extend contract tests in `tests/contract/storage-adapter.spec.ts` to run against both SQLite and PostgreSQL adapters. Use `describe.each` or equivalent to parameterize the existing test suite. PostgreSQL variant uses Testcontainers (`@testcontainers/postgresql`) to spin up a disposable PostgreSQL 16 container. All existing assertions must pass for both adapters without modification. Update Vitest config timeout if needed for container startup (30s+).

- [x] T005 [US1] Create unit tests for PostgreSQL-specific behavior in `tests/unit/storage/postgres-adapter.spec.ts`. Use `vi.hoisted()` + `vi.mock()` to mock the `postgres` library. Test: constructor stores connection string, `initialize()` executes CREATE TABLE/INDEX SQL, `getMetadata()` returns correct values, `close()` calls `sql.end()`, error handling wraps PostgreSQL errors without exposing connection details.

- [x] T006 [US1] Run `npx biome check --write src/storage/postgres-adapter.ts` and verify `pnpm lint` + `pnpm type-check` pass with the new adapter file.

**Checkpoint**: PostgresAdapter passes all contract tests including tenant isolation. Can be instantiated directly with a connection string and used identically to SQLiteAdapter.

---

## Phase 3: User Story 2 — Seamless Adapter Selection via Configuration (Priority: P2)

**Goal**: Create an adapter factory that automatically selects SQLite or PostgreSQL based on `DATABASE_URL` environment variable, returning a shared singleton. Refactor all 16 route files and `evidence-generator.ts` to use the factory.

**Independent Test**: Toggle `DATABASE_URL` between a PostgreSQL connection string and unset, verify the correct adapter is selected each time. Existing route tests pass without modification.

### Implementation for User Story 2

- [x] T007 [US2] Create adapter factory in `src/storage/factory.ts`. Must include:
  - `getStorage(): StorageAdapter` — lazy singleton; first call creates and `await`s `initialize()`, subsequent calls return same instance
  - Selection logic: if `process.env.DATABASE_URL` starts with `postgres://` or `postgresql://`, create `PostgresAdapter({ connectionString: DATABASE_URL })`; else create `SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" })`
  - `closeStorage(): Promise<void>` — calls `close()` on the singleton and resets it (for graceful shutdown and test cleanup)
  - `resetStorage(): void` — resets singleton for test isolation (allows tests to swap adapters)
  - Apache 2.0 license header

- [x] T008 [US2] Create unit tests for factory in `tests/unit/storage/factory.spec.ts`. Use `vi.hoisted()` + `vi.mock()` to mock both adapter constructors. Test: returns PostgresAdapter when `DATABASE_URL=postgres://...`, returns SQLiteAdapter when `DATABASE_URL` unset, returns SQLiteAdapter when `DATABASE_URL` is non-postgres value, singleton behavior (same instance on repeated calls), `closeStorage()` calls `close()` and resets, `resetStorage()` clears singleton.

- [x] T009 [P] [US2] Refactor auth route files to use factory — replace `import { SQLiteAdapter } from "@/storage/sqlite-adapter"` with `import { getStorage } from "@/storage/factory"` and replace `new SQLiteAdapter(...)` with `getStorage()`. Remove `await storage.initialize()` calls. Files:
  - `app/api/auth/[tenant]/signin/route.ts`
  - `app/api/auth/[tenant]/callback/route.ts`
  - `app/api/auth/[tenant]/signout/route.ts`

- [x] T010 [P] [US2] Refactor intake route files to use factory — same pattern as T009. Files:
  - `app/api/intake/[tenant]/profile/route.ts`
  - `app/api/intake/[tenant]/confirm/route.ts`

- [x] T011 [P] [US2] Refactor training session and evaluation route files to use factory — replace `new SQLiteAdapter(...)` with `getStorage()`, remove `await storage.initialize()`, remove `try/finally` blocks that only existed for `storage.close()`. Files:
  - `app/api/training/[tenant]/session/route.ts` (both POST and GET handlers)
  - `app/api/training/[tenant]/evaluate/route.ts`
  - `app/api/training/[tenant]/abandon/route.ts`

- [x] T012 [P] [US2] Refactor training module route files to use factory — same pattern as T011. Files:
  - `app/api/training/[tenant]/module/[moduleIndex]/content/route.ts` (note: uses `adapter` variable name)
  - `app/api/training/[tenant]/module/[moduleIndex]/quiz/route.ts`
  - `app/api/training/[tenant]/module/[moduleIndex]/scenario/route.ts`

- [x] T013 [P] [US2] Refactor evidence route files to use factory — same pattern as T011. Files:
  - `app/api/training/[tenant]/evidence/route.ts`
  - `app/api/training/[tenant]/evidence/[sessionId]/route.ts`
  - `app/api/training/[tenant]/evidence/[sessionId]/generate/route.ts`
  - `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts`

- [x] T014 [P] [US2] Refactor admin route and evidence generator to use factory. Files:
  - `app/api/admin/purge-transcripts/route.ts`
  - `src/evidence/evidence-generator.ts` (replace both `new SQLiteAdapter(...)` instantiations with `getStorage()`)

- [x] T015 [US2] Update existing unit tests that mock `SQLiteAdapter` to also mock the factory. Tests that import from `@/storage/sqlite-adapter` and mock `SQLiteAdapter` constructor may need to mock `@/storage/factory` instead (since routes no longer import `SQLiteAdapter` directly). Verify all existing unit tests pass after route refactoring.

- [x] T016 [US2] Run `npx biome check --write` on all modified route files, `src/storage/factory.ts`, and test files. Verify `pnpm lint` + `pnpm type-check` pass.

**Checkpoint**: All routes use factory. Existing tests pass. Setting/unsetting `DATABASE_URL` switches between PostgreSQL and SQLite with zero code changes.

---

## Phase 4: User Story 4 — Connection Resilience and Pooling (Priority: P2)

**Goal**: Verify PostgreSQL connection pool handles concurrent requests, recovers from transient failures, and shuts down cleanly.

**Independent Test**: Run contract tests with concurrent operations against Testcontainers PostgreSQL. Verify pool exhaustion does not occur under 50 concurrent requests.

### Implementation for User Story 4

- [x] T017 [US4] Add connection resilience tests in `tests/contract/storage-adapter.spec.ts` (PostgreSQL section only). Test: 50 concurrent `create()` operations complete without errors, `close()` drains pool cleanly, adapter throws clear error (without exposing connection details) when PostgreSQL is unreachable.

- [x] T018 [US4] Verify `PostgresAdapter` error handling in `src/storage/postgres-adapter.ts` — ensure all catch blocks wrap PostgreSQL-specific errors into generic `Error` messages that do not expose connection strings, hostnames, or credentials. Add error wrapping if not already present from T003.

**Checkpoint**: PostgreSQL adapter handles concurrent load, recovers from transient failures, and provides clean error messages.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Configuration, documentation, and final validation

- [x] T019 [P] Update `.env.example` — add `DATABASE_URL` with commented examples for cloud providers (AWS RDS, GCP Cloud SQL, Azure, Railway, Neon, Supabase, self-hosted). Add `DB_PATH` (currently undocumented but used by all routes).
- [x] T020 [P] Verify Apache 2.0 license headers are present on all new files: `src/storage/postgres-adapter.ts`, `src/storage/factory.ts`, `tests/unit/storage/postgres-adapter.spec.ts`, `tests/unit/storage/factory.spec.ts`.
- [x] T021 Run full test suite: `pnpm test` — all unit, integration, and contract tests must pass (SQLite and PostgreSQL).
- [x] T022 Run full lint and type-check: `pnpm lint` + `pnpm type-check` — zero errors.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1+US3 (Phase 2)**: Depends on Setup (T001, T002)
- **US2 (Phase 3)**: Depends on US1+US3 (T003 must be complete for factory to import PostgresAdapter)
- **US4 (Phase 4)**: Depends on US1+US3 (T003 must be complete for resilience testing)
- **Polish (Phase 5)**: Depends on all previous phases

### User Story Dependencies

- **US1+US3 (P1)**: Can start after Setup — no dependencies on other stories
- **US2 (P2)**: Depends on US1 (needs PostgresAdapter to exist for factory import). Can proceed in parallel with US4 after US1 is complete.
- **US4 (P2)**: Depends on US1 (needs PostgresAdapter for concurrency testing). Can proceed in parallel with US2 after US1 is complete.

### Within Each User Story

- Implementation before tests (for US1: adapter first, then contract tests verify it)
- Core files before dependent files (adapter → factory → routes)
- Route refactoring tasks (T009-T014) are independent and can all run in parallel

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel
- T009, T010, T011, T012, T013, T014 (route refactoring) can ALL run in parallel — different files, no dependencies
- T019 and T020 (Polish) can run in parallel
- US2 and US4 can proceed in parallel after US1 completes

---

## Parallel Example: Route Refactoring (Phase 3)

```bash
# Launch all route refactoring tasks together (after T007 factory is created):
Task: "Refactor auth routes to use factory" (T009)
Task: "Refactor intake routes to use factory" (T010)
Task: "Refactor training session/eval routes to use factory" (T011)
Task: "Refactor training module routes to use factory" (T012)
Task: "Refactor evidence routes to use factory" (T013)
Task: "Refactor admin route + evidence-generator to use factory" (T014)
```

---

## Implementation Strategy

### MVP First (User Story 1+3 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: US1+US3 — PostgresAdapter (T003-T006)
3. **STOP and VALIDATE**: Run contract tests against both SQLite and PostgreSQL
4. PostgreSQL adapter works — can be used directly with a connection string

### Incremental Delivery

1. Setup + US1+US3 → PostgresAdapter passes all contract tests (MVP!)
2. Add US2 → Factory + route refactoring → Zero-code switching via env var
3. Add US4 → Connection resilience verified under load
4. Polish → .env.example, license headers, final validation
5. Each phase adds value without breaking previous phases

### Parallel Team Strategy

With multiple developers after US1+US3 is complete:

- Developer A: US2 — Factory + route refactoring (T007-T016)
- Developer B: US4 — Connection resilience tests (T017-T018)
- Both merge independently, then Polish phase (T019-T022)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US3 are combined because tenant isolation is inherent in every adapter method — they cannot be separated
- Route refactoring (T009-T014) is the highest parallelism opportunity (6 independent tasks)
- Testcontainers requires Docker — tests should skip gracefully if Docker is unavailable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
