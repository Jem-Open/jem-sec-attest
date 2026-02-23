# Implementation Plan: PostgreSQL Database Support

**Branch**: `009-postgres-support` | **Date**: 2026-02-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-postgres-support/spec.md`

## Summary

Add PostgreSQL as an alternative storage backend alongside the existing SQLite adapter. The PostgreSQL adapter implements the same `StorageAdapter` interface using the `postgres` (postgres.js) library with a `jsonb`-based document-store pattern. An adapter factory provides singleton lifecycle management and automatic selection based on the `DATABASE_URL` environment variable. Compatible with cloud PostgreSQL (AWS RDS, GCP Cloud SQL, Azure, Railway, Neon, Supabase) and self-hosted instances. All 16 route files are refactored to use the factory instead of direct `SQLiteAdapter` instantiation. Tests use Testcontainers for PostgreSQL instances.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20.9+
**Primary Dependencies**: Next.js 16.x, React 19.x, `postgres` (postgres.js — Unlicense, zero deps)
**Storage**: PostgreSQL 14+ via `postgres` library; SQLite via `better-sqlite3` (existing)
**Testing**: Vitest with projects (unit, integration, contract); `@testcontainers/postgresql` for PostgreSQL test instances
**Target Platform**: Node.js server (Next.js App Router, standard runtime — not Edge)
**Project Type**: Web application (Next.js)
**Performance Goals**: 50 concurrent requests without errors; first request within 5 seconds of startup
**Constraints**: Full behavioral parity with SQLite adapter; backward compatible (SQLite default); cloud-agnostic (no cloud-specific SDKs)
**Scale/Scope**: 16 route files to refactor; 1 new adapter; 1 new factory; contract tests extended

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Configuration-as-Code Only | PASS | Adapter selection via `DATABASE_URL` env var. Credentials in env vars, never in config files. |
| II. Deterministic, Audit-Friendly Behavior | PASS | No AI or workflow changes. Storage layer is deterministic. |
| III. Security-First and Multi-Tenant Isolation | PASS | Every query filters by `tenant_id`. PostgreSQL adapter mirrors SQLite's isolation enforcement. Connection strings may contain credentials — handled via env vars per Principle I. |
| IV. Minimal Data Collection | PASS | No change to data collection. Same collections, same data shapes. |
| V. Pluggable Architecture | PASS | Core deliverable — PostgreSQL is a new adapter behind the existing `StorageAdapter` interface. Factory enables configuration-based selection. No cloud-specific hosting assumptions. |
| VI. Accessibility and Localization | N/A | Backend-only change. No UI modifications. |
| VII. Quality Gates | PASS | Contract tests extended for PostgreSQL. Testcontainers provides real PostgreSQL for testing. Existing test suite runs against both adapters. |
| VIII. Documentation Required | PASS | quickstart.md, updated .env.example, contract documentation provided. |
| IX. Technology Stack | PASS | Next.js App Router routes. `postgres` library is Unlicense (Apache 2.0 compatible). |
| Licensing | PASS | `postgres` (Unlicense), `@testcontainers/postgresql` (MIT). Both Apache 2.0 compatible. |

**Post-Phase 1 Re-check**: All gates still pass. Design uses standard adapter pattern per Constitution Principle V. No cloud-specific assumptions.

## Project Structure

### Documentation (this feature)

```text
specs/009-postgres-support/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: library comparison, decisions
├── data-model.md        # Phase 1: schema mapping SQLite → PostgreSQL
├── quickstart.md        # Phase 1: setup guide for dev/cloud/test
├── contracts/
│   └── storage-adapter-contract.md  # Behavioral parity requirements
├── checklists/
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── storage/
│   ├── adapter.ts              # StorageAdapter interface (unchanged)
│   ├── types.ts                # QueryFilter, TransactionContext, StorageMetadata (unchanged)
│   ├── sqlite-adapter.ts       # SQLite implementation (unchanged)
│   ├── postgres-adapter.ts     # NEW — PostgreSQL implementation
│   └── factory.ts              # NEW — Adapter factory (singleton, env-based selection)

app/api/
├── auth/[tenant]/
│   ├── signin/route.ts         # MODIFIED — use factory instead of direct SQLiteAdapter
│   ├── callback/route.ts       # MODIFIED — use factory
│   └── signout/route.ts        # MODIFIED — use factory
├── intake/[tenant]/
│   ├── profile/route.ts        # MODIFIED — use factory
│   └── confirm/route.ts        # MODIFIED — use factory
├── training/[tenant]/
│   ├── session/route.ts        # MODIFIED — use factory, remove try/finally close()
│   ├── evaluate/route.ts       # MODIFIED — use factory
│   ├── abandon/route.ts        # MODIFIED — use factory
│   ├── module/[moduleIndex]/
│   │   ├── content/route.ts    # MODIFIED — use factory
│   │   ├── quiz/route.ts       # MODIFIED — use factory
│   │   └── scenario/route.ts   # MODIFIED — use factory
│   └── evidence/
│       ├── route.ts            # MODIFIED — use factory
│       ├── [sessionId]/route.ts           # MODIFIED — use factory
│       ├── [sessionId]/generate/route.ts  # MODIFIED — use factory
│       └── [sessionId]/pdf/route.ts       # MODIFIED — use factory
└── admin/
    └── purge-transcripts/route.ts  # MODIFIED — use factory

src/evidence/
└── evidence-generator.ts       # MODIFIED — use factory (currently instantiates SQLiteAdapter directly)

tests/
├── contract/
│   └── storage-adapter.spec.ts # EXTENDED — parameterized for both SQLite and PostgreSQL
├── integration/
│   └── (existing tests)        # May run against PostgreSQL via Testcontainers
└── unit/
    └── storage/
        └── postgres-adapter.spec.ts  # NEW — unit tests for PostgreSQL adapter
```

**Structure Decision**: Follows existing project layout. New files go in `src/storage/`. All route modifications are in-place edits replacing `new SQLiteAdapter(...)` with `getStorage()`. No new directories beyond what already exists.

## Implementation Phases

### Phase 1: PostgreSQL Adapter (Core)

**Goal**: Implement `PostgresAdapter` class that passes the existing contract tests.

1. Add `postgres` dependency: `pnpm add postgres`
2. Create `src/storage/postgres-adapter.ts`:
   - Implement all `StorageAdapter` methods
   - Use `postgres` tagged template literals for parameterized queries
   - `jsonb` column for data (auto-serialized/deserialized by postgres.js)
   - `TIMESTAMPTZ` for timestamps
   - `initialize()`: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
   - `transaction()`: use `sql.begin()` for proper PostgreSQL transaction support
   - `getMetadata()`: return `{ adapterName: "postgres", adapterVersion: "1.0.0" }`
   - `close()`: call `sql.end()` to drain the connection pool
   - Constructor accepts `connectionString` option
   - Connection pool configuration: `max` (default 10), SSL parsed from connection string

### Phase 2: Adapter Factory

**Goal**: Centralize adapter creation as a shared singleton.

1. Create `src/storage/factory.ts`:
   - Export `getStorage(): StorageAdapter`
   - Lazy initialization: first call creates and initializes the adapter
   - Selection logic: `DATABASE_URL` starts with `postgres://` or `postgresql://` → PostgresAdapter; else → SQLiteAdapter
   - Module-level singleton — same instance returned on every call
   - Export `closeStorage(): Promise<void>` for graceful shutdown
2. Update `src/storage/index.ts` (barrel export if needed) or ensure factory is importable

### Phase 3: Route Refactoring

**Goal**: Replace all 16 route files + `evidence-generator.ts` to use factory.

For each file:
- Replace `import { SQLiteAdapter } from "@/storage/sqlite-adapter"` with `import { getStorage } from "@/storage/factory"`
- Replace `new SQLiteAdapter({ dbPath: ... })` with `getStorage()`
- Remove `await storage.initialize()` calls (factory handles initialization)
- Remove `await storage.close()` in `finally` blocks (singleton lifecycle)
- Remove `try/finally` wrappers that only existed for `close()`

Special cases:
- `evidence-generator.ts`: Replace both `new SQLiteAdapter(...)` instantiations with `getStorage()`
- Module-scope routes (auth/intake): Remove module-scope `const storage = new SQLiteAdapter(...)` — call `getStorage()` inline or at module scope

### Phase 4: Testing

**Goal**: Verify behavioral parity and add PostgreSQL-specific tests.

1. Add dev dependencies: `pnpm add -D @testcontainers/postgresql testcontainers`
2. Extend `tests/contract/storage-adapter.spec.ts`:
   - Parameterize the existing contract test suite to run against both SQLite and PostgreSQL
   - PostgreSQL variant uses Testcontainers to spin up a disposable instance
   - All existing contract assertions must pass for both adapters
3. Create `tests/unit/storage/postgres-adapter.spec.ts`:
   - Unit tests for PostgreSQL-specific behavior (connection string parsing, pool configuration, SSL)
   - Mock the `postgres` library for unit tests
4. Update Vitest config if needed for Testcontainers timeout (container startup can take 10-30 seconds)

### Phase 5: Configuration and Documentation

**Goal**: Update environment configuration and project documentation.

1. Update `.env.example`:
   - Add `DATABASE_URL` with commented examples for each cloud provider
   - Add `DB_PATH` (currently undocumented but used by all routes)
2. Add Apache 2.0 license headers to all new files
3. Run `npx biome check --write` on all new/modified files
4. Verify `pnpm lint` and `pnpm type-check` pass

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| postgres.js API differences from expected patterns | Contract tests enforce behavioral parity — any divergence caught immediately |
| Testcontainers Docker requirement | Tests gracefully skip PostgreSQL suite if Docker unavailable; SQLite tests always run |
| Connection string edge cases across cloud providers | Research covered all major providers; `sslmode=require` parsed natively by postgres.js |
| Route refactoring breaks existing functionality | Existing unit tests mock storage at the adapter level — factory is a thin wrapper |
| Singleton lifecycle complicates test isolation | Unit tests continue to mock storage; integration/contract tests create fresh adapters per suite |

## Complexity Tracking

No constitution violations to justify. The implementation uses the existing adapter pattern (Constitution Principle V) with a straightforward factory. No new abstractions beyond what is necessary.
