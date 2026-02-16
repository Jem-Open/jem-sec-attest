# Tasks: Multi-Tenant Configuration-as-Code

**Input**: Design documents from `/specs/001-multi-tenant-config/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/interfaces.ts

**Tests**: Included — the spec and plan explicitly require unit, integration, contract, and golden-fixture tests. Tests are written alongside implementation within each user story phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/`, `config/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and dependency installation

- [x] T001 Initialize pnpm project with package.json including all dependencies (yaml, zod, safe-stable-stringify, better-sqlite3, dotenv) and devDependencies (typescript, @biomejs/biome, vitest, @vitest/coverage-v8, @types/better-sqlite3, @types/node, zod-to-json-schema) in package.json
- [x] T002 Configure TypeScript strict mode with module NodeNext, target ES2022, noUncheckedIndexedAccess, verbatimModuleSyntax in tsconfig.json
- [x] T003 [P] Configure Biome linting and formatting with strict TypeScript rules in biome.json
- [x] T004 [P] Configure Vitest with workspace for unit and integration test separation in vitest.config.ts
- [x] T005 [P] Configure Lefthook pre-commit hooks for lint and type-check in lefthook.yml
- [x] T006 [P] Create GitHub Actions CI workflow with lint, type-check, test, build jobs in .github/workflows/ci.yml
- [x] T007 Create .env.example with placeholder values for ACME_WEBHOOK_SECRET and GLOBEX_API_KEY in .env.example

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, interfaces, and error infrastructure that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Define Tenant, TenantSettings, ConfigSnapshot, and TenantResolverContext types in src/tenant/types.ts
- [x] T009 [P] Define ConfigProvider interface, RawConfig, RawTenantConfig, and FileConfigProviderOptions types in src/config/provider.ts
- [x] T010 [P] Define ConfigError class with file, path, and message fields and ConfigValidationError (aggregates multiple ConfigErrors) in src/config/errors.ts
- [x] T011 [P] Define StorageAdapter, QueryFilter, TransactionContext, and StorageMetadata interfaces in src/storage/adapter.ts
- [x] T012 [P] Define StorageAdapter-related value types (query filter shapes, metadata) in src/storage/types.ts
- [x] T013 Create directory structure for test fixtures: tests/fixtures/golden/, tests/fixtures/invalid/, tests/fixtures/valid/ with .gitkeep files

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Define and Load Tenant Configuration (Priority: P1) MVP

**Goal**: Platform operators can define tenants via YAML/JSON files with env var substitution. The application loads, parses, merges with defaults, and validates all configs at startup.

**Independent Test**: Place two valid tenant YAML files in config dir, start app, confirm both tenants loaded without errors.

### Tests for User Story 1

- [x] T014 [P] [US1] Write unit tests for ${VAR} and ${VAR:-default} substitution, missing var errors, and special characters (values containing literal `$`, `{`, `}` after resolution) in tests/unit/config/env-substitute.spec.ts
- [x] T015 [P] [US1] Write unit tests for TenantConfig and BaseConfig Zod schemas including strict mode rejection of unknown fields in tests/unit/config/schema.spec.ts
- [x] T016 [P] [US1] Write unit tests for validator: per-file validation, deep merge with defaults, merged config validation in tests/unit/config/validator.spec.ts

### Implementation for User Story 1

- [x] T017 [P] [US1] Implement env var substitution with ${VAR} and ${VAR:-default} syntax, error on missing vars with file path context in src/config/env-substitute.ts
- [x] T018 [P] [US1] Define Zod schemas for TenantConfigSchema (name, hostnames, emailDomains, settings), BaseConfigSchema (defaults), and TenantSettingsSchema with .strict() in src/config/schema.ts
- [x] T019 [US1] Implement FileConfigProvider: read defaults.yaml, discover and read tenant YAML/JSON files from tenants/ subdirectory, derive tenantId from filename in src/config/file-provider.ts
- [x] T020 [US1] Implement config validator: substitute env vars in raw text, parse YAML, validate per-file against schema, deep-merge tenant settings with defaults, validate merged result, check at least one resolution rule per tenant in src/config/validator.ts
- [x] T021 [US1] Implement public config API: loadConfig(provider) orchestrates load → substitute → validate → build ConfigSnapshot, export getSnapshot() in src/config/index.ts
- [x] T022 [P] [US1] Create example config/defaults.yaml with all default TenantSettings fields populated (branding, features, integrations, retention)
- [x] T023 [P] [US1] Create example config/tenants/acme-corp.yaml with two hostnames, two email domains, settings overrides, and ${ACME_WEBHOOK_SECRET} env ref
- [x] T024 [P] [US1] Create example config/tenants/globex-inc.yaml with one hostname, one email domain, settings overrides, and ${GLOBEX_API_KEY} env ref
- [x] T025 [US1] Create valid test fixtures: tests/fixtures/valid/defaults.yaml and tests/fixtures/valid/tenants/tenant-a.yaml and tests/fixtures/valid/tenants/tenant-b.yaml
- [x] T026 [US1] Write integration test: full config loading pipeline with valid fixtures and env vars set in tests/integration/config-loading.spec.ts

**Checkpoint**: Config loading pipeline works end-to-end. Two example tenants load and validate successfully.

---

## Phase 4: User Story 2 — Resolve Tenant from Request Context (Priority: P1)

**Goal**: The system resolves which tenant a request belongs to by matching hostname or email domain against configured resolution rules. Hostname takes precedence over email domain.

**Independent Test**: Send requests with different hostnames and emails, verify correct tenant resolved each time.

### Tests for User Story 2

- [x] T027 [P] [US2] Write unit tests for resolver: hostname match, email domain match, hostname precedence over email, case-insensitive matching, no-match returns null in tests/unit/tenant/resolver.spec.ts

### Implementation for User Story 2

- [x] T028 [US2] Implement TenantResolver: build hostnameIndex and emailDomainIndex Maps from ConfigSnapshot, resolve() with hostname > emailDomain precedence, case-insensitive lookups in src/tenant/resolver.ts
- [x] T029 [US2] Implement tenant public API: createResolver(snapshot) factory, re-export types in src/tenant/index.ts
- [x] T030 [US2] Write integration test: load config then resolve tenants by hostname and email domain end-to-end in tests/integration/tenant-resolution.spec.ts

**Checkpoint**: Tenant resolution works. Hostname and email domain lookups return correct tenant. Unknown hostname returns null.

---

## Phase 5: User Story 3 — Fail Fast on Invalid Configuration (Priority: P1)

**Goal**: Invalid config files cause the application to refuse to start with clear, actionable error messages identifying the file and field.

**Independent Test**: Introduce deliberately invalid config, attempt start, verify app exits with descriptive error.

### Tests for User Story 3

- [x] T031 [P] [US3] Write unit tests for cross-tenant uniqueness: duplicate hostnames, duplicate email domains, duplicate tenant IDs in tests/unit/config/validator.spec.ts (append to existing)

### Implementation for User Story 3

- [x] T032 [US3] Add cross-tenant validation to validator: check global uniqueness of all hostnames, email domains, and tenant IDs across all loaded configs; aggregate all errors before reporting in src/config/validator.ts
- [x] T033 [US3] Add empty-directory detection: fail fast with clear message when no tenant files found in config directory in src/config/file-provider.ts
- [x] T034 [P] [US3] Create invalid test fixtures: tests/fixtures/invalid/missing-name.yaml (no name field), tests/fixtures/invalid/duplicate-hostname.yaml (conflicts with tenant-a), tests/fixtures/invalid/unknown-field.yaml (extra field not in schema), tests/fixtures/invalid/unresolved-env-var.yaml (references ${MISSING_VAR})
- [x] T035 [US3] Write integration tests: missing required field, duplicate hostname, unknown field, unresolved env var, empty config dir — each verifying exit with specific error message in tests/integration/fail-fast.spec.ts

**Checkpoint**: All invalid config scenarios produce clear errors. No invalid config can slip past startup.

---

## Phase 6: User Story 4 — Produce Configuration Hash for Audit Evidence (Priority: P2)

**Goal**: After successful config loading, produce a deterministic SHA-256 hash of the full config and log it to stdout.

**Independent Test**: Load same config twice, verify hash is identical. Change one setting, verify hash changes.

### Tests for User Story 4

- [x] T036 [P] [US4] Write unit tests for hasher: deterministic output, key-order independence, different configs produce different hashes in tests/unit/config/hasher.spec.ts

### Implementation for User Story 4

- [x] T037 [US4] Implement computeConfigHash using safe-stable-stringify for deterministic serialization and crypto.createHash('sha256') for hashing in src/config/hasher.ts
- [x] T038 [US4] Integrate hasher into loadConfig pipeline: compute hash after validation, store in ConfigSnapshot.configHash, log hash to stdout in src/config/index.ts
- [x] T039 [P] [US4] Create golden test fixtures: tests/fixtures/golden/defaults.yaml and tests/fixtures/golden/tenants/acme-corp.yaml and tests/fixtures/golden/tenants/globex-inc.yaml with known expected hash
- [x] T040 [US4] Write golden-fixture integration test: load golden configs, assert hash matches hardcoded expected value; detect regressions in tests/integration/config-loading.spec.ts (append)

**Checkpoint**: Config hash is deterministic and logged. Golden fixture tests guard against hash regressions.

---

## Phase 7: User Story 5 — Environment Variable Substitution Security (Priority: P2)

**Goal**: Env var substitution includes security controls: denylist patterns prevent secret values from appearing in logs, and missing vars with no default cause clear errors.

**Independent Test**: Define a config with ${SECRET_KEY}, set env var, verify value is resolved but [REDACTED] appears in any log output.

### Tests for User Story 5

- [x] T041 [P] [US5] Write unit tests for denylist: vars matching *_SECRET, *_KEY, *_PASSWORD, *_TOKEN patterns are flagged; redacted in log output in tests/unit/config/env-substitute.spec.ts (append)

### Implementation for User Story 5

- [x] T042 [US5] Add denylist pattern matching to env-substitute: detect sensitive var names (*_SECRET, *_KEY, *_PASSWORD, *_TOKEN), track which vars are sensitive in src/config/env-substitute.ts
- [x] T043 [US5] Add redaction utility: when logging resolved config, replace sensitive values with [REDACTED]; ensure hash input is never logged in src/config/env-substitute.ts
- [x] T044 [US5] Write integration test: config with sensitive env var loads correctly, verify log output contains [REDACTED] not actual secret value in tests/integration/config-loading.spec.ts (append)

**Checkpoint**: Secrets are resolved for runtime use but never appear in log output.

---

## Phase 8: Storage Adapter (Independent Module)

**Goal**: Define StorageAdapter interface and ship a working SQLite reference implementation for local dev. Every method enforces tenant scoping.

**Independent Test**: Run contract test suite against SQLite adapter; all CRUD operations scoped to correct tenant.

### Tests for Storage Adapter

- [x] T045 [P] Write contract test suite that any StorageAdapter must pass: create, findById, findMany, update, delete, transaction, tenant isolation in tests/contract/storage-adapter.spec.ts
- [x] T046 [P] Write unit tests for SQLite adapter: initialization, migrations, tenant-scoped queries in tests/unit/storage/sqlite-adapter.spec.ts

### Implementation for Storage Adapter

- [x] T047 Implement SQLiteAdapter: initialize with migrations, CRUD with automatic tenant_id WHERE clause, transaction support, getMetadata in src/storage/sqlite-adapter.ts
- [x] T048 Create initial SQLite migration: CREATE TABLE with id, tenant_id, collection, data columns and tenant_id index in migrations/sqlite/001_create_base_tables.sql

**Checkpoint**: SQLite adapter passes all contract tests. Tenant isolation is enforced.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Application entry point, published schema, final integration, documentation

- [x] T049 Implement application entry point: load dotenv, instantiate FileConfigProvider, call loadConfig, create TenantResolver, log config hash, handle startup errors with process.exit(1) in src/index.ts
- [x] T050 Generate published JSON Schema from Zod schemas using zod-to-json-schema, write to config/schema/tenant.schema.json via a build script in package.json
- [x] T051 Add Apache 2.0 license headers to all src/ files per constitution licensing requirements
- [x] T052 Validate quickstart.md instructions end-to-end: clone, install, set env vars, start, verify two tenants load and hash is logged
- [x] T053 Run full CI pipeline locally: pnpm lint && pnpm type-check && pnpm test:coverage && pnpm build — verify all pass
- [x] T054 [P] Write contract test suite for ConfigProvider interface: loadDefaults returns valid raw config, loadTenants returns array with source file metadata and tenant IDs, error on missing directory, error on empty directory in tests/contract/config-provider.spec.ts
- [x] T055 Create security guidance documentation covering: env var management best practices, denylist configuration for sensitive vars, tenant isolation verification steps, network exposure considerations, secretRef future roadmap in docs/SECURITY.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2. This is the MVP.
- **US2 (Phase 4)**: Depends on Phase 3 (needs ConfigSnapshot from loaded config)
- **US3 (Phase 5)**: Depends on Phase 3 (extends the validator built in US1)
- **US4 (Phase 6)**: Depends on Phase 3 (needs ConfigSnapshot to hash)
- **US5 (Phase 7)**: Depends on Phase 3 (extends env-substitute built in US1)
- **Storage (Phase 8)**: Depends on Phase 2 only — can run in parallel with US1-US5
- **Polish (Phase 9)**: Depends on all prior phases

### Parallel Execution Strategy

```
Phase 1 (Setup)
    │
Phase 2 (Foundational)
    │
    ├──► Phase 3 (US1 — MVP) ──┬──► Phase 4 (US2)
    │                           ├──► Phase 5 (US3)
    │                           ├──► Phase 6 (US4)
    │                           └──► Phase 7 (US5)
    │
    └──► Phase 8 (Storage — independent)
                                     │
                              Phase 9 (Polish)
```

### Within Each User Story

- Tests and implementation can be written in parallel when they touch different files [P]
- Implementation tasks within a story follow dependency order (provider → validator → public API)
- Story is complete when checkpoint passes

### Parallel Opportunities Per Phase

**Phase 1**: T003, T004, T005, T006 can all run in parallel
**Phase 2**: T009, T010, T011, T012 can all run in parallel
**Phase 3**: T014-T016 (tests) in parallel; T017-T018 (env-sub + schema) in parallel; T022-T024 (configs) in parallel
**Phase 4**: T027 (tests) can start immediately
**Phase 5**: T031 + T034 in parallel
**Phase 6**: T036 + T039 in parallel
**Phase 7**: T041 can start immediately
**Phase 8**: T045 + T046 in parallel; entire phase parallel with Phases 3-7

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together:
Task: "T014 Unit tests for env-substitute in tests/unit/config/env-substitute.spec.ts"
Task: "T015 Unit tests for Zod schemas in tests/unit/config/schema.spec.ts"
Task: "T016 Unit tests for validator in tests/unit/config/validator.spec.ts"

# Launch independent implementation in parallel:
Task: "T017 Implement env-substitute in src/config/env-substitute.ts"
Task: "T018 Define Zod schemas in src/config/schema.ts"

# Launch all example configs in parallel:
Task: "T022 Create config/defaults.yaml"
Task: "T023 Create config/tenants/acme-corp.yaml"
Task: "T024 Create config/tenants/globex-inc.yaml"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 — Config Loading
4. **STOP and VALIDATE**: Load two example tenants, confirm validated and available
5. This alone satisfies FR-001, FR-002, FR-007, FR-008, FR-009, FR-014, FR-015, FR-016, FR-017

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Config Loading) → Test independently → **MVP!**
3. US2 (Tenant Resolution) → Tenants are now resolvable → **Core complete**
4. US3 (Fail Fast) → Error scenarios hardened → **Production-safe**
5. US4 (Config Hash) → Audit evidence available → **Compliance ready**
6. US5 (Env Var Security) → Secrets protected in logs → **Security hardened**
7. Storage Adapter → Data persistence available → **Full feature**
8. Polish → Docs, CI, schema published → **Ship it**

### Subagent Parallel Strategy

With Claude subagents, maximize parallelism:

1. **Sequential**: Phase 1 → Phase 2 (must complete in order)
2. **Parallel batch 1**: US1 (Phase 3) + Storage (Phase 8)
3. **Parallel batch 2**: US2 (Phase 4) + US3 (Phase 5) + US4 (Phase 6) + US5 (Phase 7)
4. **Sequential**: Phase 9 (Polish) — after all above complete

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Tasks phases (1-9) are organized by user story, not by plan.md's technical phases (1-7). Mapping: Plan Phase 1 → Tasks Phase 1; Plan Phase 2+3 → Tasks Phases 2+3 (US1); Plan Phase 4 → Tasks Phase 4 (US2); Plan Phase 3 → Tasks Phase 5 (US3); Plan Phase 5 → Tasks Phase 6 (US4); Plan Phase 2 → Tasks Phase 7 (US5); Plan Phase 6 → Tasks Phase 8 (Storage); Plan Phase 7 → Tasks Phase 9 (Polish)
- Each user story is independently completable and testable at its checkpoint
- All source files must include Apache 2.0 license header (Constitution requirement)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
