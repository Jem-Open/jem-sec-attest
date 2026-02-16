# Implementation Plan: Multi-Tenant Configuration-as-Code

**Branch**: `001-multi-tenant-config` | **Date**: 2026-02-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-multi-tenant-config/spec.md`

## Summary

Build a configuration-as-code system that loads multi-tenant definitions from YAML/JSON files, validates them against a Zod schema at startup, resolves tenants by hostname or email domain, substitutes environment variables for secrets, and produces a SHA-256 config hash for audit evidence. The system uses a `ConfigProvider` interface with a `FileConfigProvider` reference implementation, a `StorageAdapter` interface with a `better-sqlite3` reference implementation for local dev, and ships with two example tenants demonstrating the full feature set.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 20+
**Primary Dependencies**: `yaml` (parsing), `zod` (validation), `safe-stable-stringify` (deterministic hashing), `better-sqlite3` (local storage), `dotenv` (env loading)
**Storage**: SQLite via `better-sqlite3` (local dev); `StorageAdapter` interface for Postgres/MongoDB/DynamoDB/SurrealDB (production)
**Testing**: Vitest (unit + integration), v8 coverage
**Target Platform**: Node.js server (Linux/macOS/Windows)
**Project Type**: Single project (library + CLI entry point)
**Performance Goals**: Startup with 20 tenants in <10 seconds; tenant resolution <1ms per lookup
**Constraints**: 2-20 tenants; no hot-reload; config changes require restart
**Scale/Scope**: Small-scale enterprise training platform

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Configuration-as-Code Only | PASS | All tenant config via YAML/JSON files. No admin portal. Secrets via `${VAR}` / `${VAR:-default}` env refs only (constitution amended to bless this syntax). `secretRef:` deferred per constitution allowance. Schema published alongside feature. |
| II. Deterministic, Audit-Friendly | PASS | Config hash (SHA-256) produced at startup and logged. Deterministic via `safe-stable-stringify`. Hash included in evidence bundles. |
| III. Security-First, Multi-Tenant Isolation | PASS | `StorageAdapter` enforces `tenantId` on every method. Env var denylist prevents secret leakage into logs. Resolution rules enforce uniqueness. |
| IV. Minimal Data Collection | PASS | Config system does not persist raw secrets. Env var values resolved in-memory only. |
| V. Pluggable Architecture | PASS | `ConfigProvider` interface (file, Git, vault). `StorageAdapter` interface (SQLite, Postgres, MongoDB, DynamoDB). Both selectable via config. |
| VI. Accessibility & Localization | N/A | No user-facing UI in this feature. |
| VII. Quality Gates | PASS | Vitest unit + integration tests. Contract tests for both adapters (StorageAdapter + ConfigProvider). Lefthook pre-commit hooks. GitHub Actions CI on every PR. |
| VIII. Documentation Required | PASS | quickstart.md, example YAML configs, schema published, security guidance (docs/SECURITY.md) for secrets management, network exposure, and tenant isolation verification. |
| Licensing | PASS | All dependencies MIT/ISC — Apache 2.0 compatible. Source files include Apache 2.0 header. |

**Post-Phase 1 re-check**: All principles remain satisfied. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-tenant-config/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: developer setup guide
├── contracts/           # Phase 1: interface definitions
│   └── interfaces.ts    # ConfigProvider, TenantResolver, StorageAdapter
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── config/
│   ├── index.ts                  # Public API: loadConfig(), getSnapshot()
│   ├── provider.ts               # ConfigProvider interface
│   ├── file-provider.ts          # FileConfigProvider implementation
│   ├── schema.ts                 # Zod schemas for tenant config
│   ├── env-substitute.ts         # ${VAR} substitution with denylist
│   ├── validator.ts              # Schema validation + cross-tenant checks
│   ├── hasher.ts                 # Deterministic config hashing
│   └── errors.ts                 # ConfigError types
├── tenant/
│   ├── index.ts                  # Public API: resolveTenant()
│   ├── resolver.ts               # TenantResolver implementation
│   └── types.ts                  # Tenant, TenantSettings, ConfigSnapshot
├── storage/
│   ├── adapter.ts                # StorageAdapter interface
│   ├── sqlite-adapter.ts         # better-sqlite3 reference implementation
│   └── types.ts                  # QueryFilter, TransactionContext, etc.
└── index.ts                      # Application entry point

config/
├── defaults.yaml                 # Base/default tenant settings
├── tenants/
│   ├── acme-corp.yaml            # Example tenant: Acme Corp
│   └── globex-inc.yaml           # Example tenant: Globex Inc
└── schema/
    └── tenant.schema.json        # Published JSON Schema (generated from Zod)

tests/
├── unit/
│   ├── config/
│   │   ├── env-substitute.spec.ts
│   │   ├── schema.spec.ts
│   │   ├── validator.spec.ts
│   │   └── hasher.spec.ts
│   ├── tenant/
│   │   └── resolver.spec.ts
│   └── storage/
│       └── sqlite-adapter.spec.ts
├── integration/
│   ├── config-loading.spec.ts    # Full startup pipeline
│   ├── tenant-resolution.spec.ts # End-to-end resolution
│   └── fail-fast.spec.ts         # Invalid config rejection
├── contract/
│   └── storage-adapter.spec.ts   # Contract tests for StorageAdapter
└── fixtures/
    ├── golden/                   # Golden config fixtures for hash testing
    │   ├── defaults.yaml
    │   └── tenants/
    │       ├── acme-corp.yaml
    │       └── globex-inc.yaml
    ├── invalid/                  # Invalid configs for fail-fast testing
    │   ├── missing-name.yaml
    │   ├── duplicate-hostname.yaml
    │   ├── unknown-field.yaml
    │   └── unresolved-env-var.yaml
    └── valid/                    # Valid configs for happy-path testing
        ├── defaults.yaml
        └── tenants/
            ├── tenant-a.yaml
            └── tenant-b.yaml
```

**Structure Decision**: Single project structure. This is a library/service, not a web app or mobile app. The `config/` directory at the root contains runtime configuration files (YAML). The `src/` directory contains TypeScript source code organized by domain module (config, tenant, storage).

## Implementation Phases

### Phase 1: Project Scaffold & Tooling

Set up the TypeScript project with all baseline tooling.

**Modules**: None (tooling only)
**Deliverables**:
- `package.json` with pnpm, scripts, dependencies
- `tsconfig.json` (strict mode, NodeNext, ES2022)
- `biome.json` (linting + formatting)
- `lefthook.yml` (pre-commit: lint + type-check)
- `vitest.config.ts` (unit + integration workspace)
- `.github/workflows/ci.yml` (lint, type-check, test, build)
- `.env.example`

**Acceptance criteria mapping**: SC-002 (starts in <10s), SC-007 (developer can set up locally)

### Phase 2: Config Loading & Env Substitution

Implement the core config loading pipeline.

**Modules**:
- `src/config/provider.ts` — `ConfigProvider` interface
- `src/config/file-provider.ts` — `FileConfigProvider` reading YAML/JSON from disk
- `src/config/env-substitute.ts` — `${VAR}` substitution with security controls

**Key design decisions**:
- **Substitution order**: Raw YAML text → env substitution → YAML parse → validation. Substitution on raw text ensures YAML parser sees final values.
- **Denylist**: Env var names matching patterns like `*_SECRET`, `*_KEY`, `*_PASSWORD`, `*_TOKEN` are flagged. Their resolved values are never logged — only `[REDACTED]` appears in any log output.
- **Default syntax**: Support `${VAR:-default}` for optional env vars with fallback values.
- **Missing vars**: `${VAR}` with no default and no matching env var → hard error with file path and variable name.

**Acceptance criteria mapping**: FR-001, FR-007, FR-008, FR-014, SC-006

### Phase 3: Schema Validation & Fail-Fast

Implement Zod schemas and the validation pipeline.

**Modules**:
- `src/config/schema.ts` — Zod schemas for `TenantConfig`, `BaseConfig`, `TenantSettings`
- `src/config/validator.ts` — Orchestrates: validate individual → merge with defaults → validate merged → check global uniqueness
- `src/config/errors.ts` — `ConfigError` with file, path, message

**Key design decisions**:
- **Strict mode**: All Zod schemas use `.strict()` — unknown fields are rejected (FR-009).
- **Error aggregation**: Collect all validation errors before reporting (not just first failure). Each error includes source file path and field path.
- **Cross-tenant validation**: After per-file validation, check global uniqueness of hostnames, email domains, and tenant IDs (FR-010).
- **Merge strategy**: Deep merge of `defaults.settings` with `tenant.settings`. Tenant values win. Arrays are replaced, not concatenated.
- **Published schema**: Generate `tenant.schema.json` from Zod schemas using `zod-to-json-schema` (Constitution Principle I: schema published alongside feature).

**Acceptance criteria mapping**: FR-002, FR-003, FR-009, FR-010, FR-015, FR-016, FR-017, SC-003

### Phase 4: Tenant Resolution

Implement the tenant resolver with hostname and email domain strategies.

**Modules**:
- `src/tenant/resolver.ts` — `TenantResolver` with hostname and email domain resolution
- `src/tenant/types.ts` — `Tenant`, `ConfigSnapshot`, `TenantResolverContext`

**Key design decisions**:
- **Resolution precedence**: Hostname > email domain (FR-006). If hostname resolves to Tenant A and email domain resolves to Tenant B, Tenant A wins.
- **Index structure**: `Map<string, string>` for O(1) lookups. Built at startup from validated configs. Hostname index is case-insensitive (stored lowercase). Email domain index is case-insensitive.
- **No match**: Returns `null`. Callers (HTTP middleware, etc.) convert to 404 "tenant_not_found" response (FR-013).
- **Immutable snapshot**: `ConfigSnapshot` is frozen after construction. `Object.freeze()` on all nested structures.

**Acceptance criteria mapping**: FR-004, FR-005, FR-006, FR-013, SC-004

### Phase 5: Config Hashing & Audit Evidence

Implement deterministic config hashing.

**Modules**:
- `src/config/hasher.ts` — `computeConfigHash(snapshot: ConfigSnapshot): string`

**Key design decisions**:
- **Algorithm**: SHA-256 via Node.js built-in `crypto`.
- **Determinism**: `safe-stable-stringify` sorts object keys alphabetically before hashing.
- **Input**: The entire `ConfigSnapshot` (all tenants, all settings, all resolution rules) is hashed — but *after* env substitution, so the hash reflects actual runtime values.
- **Output**: Hex-encoded SHA-256 digest (64 chars), logged to stdout at startup.
- **Security**: The hash is of resolved config including secrets. The hash itself does not leak secrets (it's a one-way digest). But the hash input must never be logged.

**Acceptance criteria mapping**: FR-011, SC-005

### Phase 6: Storage Adapter

Implement the storage adapter interface and SQLite reference implementation.

**Modules**:
- `src/storage/adapter.ts` — `StorageAdapter` interface
- `src/storage/sqlite-adapter.ts` — `better-sqlite3` implementation
- `src/storage/types.ts` — `QueryFilter`, `TransactionContext`, `StorageMetadata`

**Key design decisions**:
- **Tenant scoping**: Every method takes `tenantId` as first parameter. SQLite implementation adds `WHERE tenant_id = ?` to all queries automatically.
- **Minimal surface**: CRUD + query + transaction + metadata. No complex query builders.
- **Contract tests**: `tests/contract/storage-adapter.spec.ts` defines the test suite any adapter must pass. SQLite adapter runs it. Future Postgres/MongoDB adapters will run the same tests.
- **Migrations**: Simple numbered SQL files in `migrations/sqlite/`. Applied on `initialize()`.

**Acceptance criteria mapping**: Constitution Principle V (pluggable), Principle III (tenant isolation)

### Phase 7: Example Tenants, Docs & Integration Tests

Ship the example configs, documentation, and full integration test suite.

**Modules**: None (configs, docs, tests only)
**Deliverables**:
- `config/defaults.yaml`, `config/tenants/acme-corp.yaml`, `config/tenants/globex-inc.yaml`
- `config/schema/tenant.schema.json` (generated)
- `.env.example`
- Integration tests covering full startup, resolution, fail-fast, and hash determinism
- Golden config fixtures for hash regression testing

**Acceptance criteria mapping**: FR-012, SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007

## Module Dependency Graph

```
                    ┌─────────────────┐
                    │   Entry Point   │
                    │   src/index.ts  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  config/index   │ ◄── public API: loadConfig()
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
   ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼───────┐
   │  file-provider  │ │  validator  │ │    hasher     │
   │  (ConfigProvider)│ │            │ │               │
   └────────┬───────┘ └─────┬──────┘ └───────────────┘
            │                │
   ┌────────▼───────┐ ┌─────▼──────┐
   │ env-substitute  │ │   schema   │
   │                 │ │   (Zod)    │
   └─────────────────┘ └────────────┘

                    ┌─────────────────┐
                    │ tenant/resolver  │ ◄── uses ConfigSnapshot
                    └─────────────────┘

                    ┌─────────────────┐
                    │ storage/adapter  │ ◄── independent module
                    │ storage/sqlite   │
                    └─────────────────┘
```

## Acceptance Criteria Mapping

| Criterion | Phase | Module(s) | Test Type |
|-----------|-------|-----------|-----------|
| FR-001: Load YAML/JSON | 2 | file-provider | Unit + Integration |
| FR-002: Validate against schema | 3 | validator, schema | Unit |
| FR-003: Fail fast, clear error | 3 | validator, errors | Integration |
| FR-004: Resolve by hostname | 4 | resolver | Unit + Integration |
| FR-005: Resolve by email domain | 4 | resolver | Unit + Integration |
| FR-006: Hostname > email precedence | 4 | resolver | Unit |
| FR-007: Env var substitution | 2 | env-substitute | Unit |
| FR-008: Fail on missing env var | 2 | env-substitute | Unit + Integration |
| FR-009: Reject unknown fields | 3 | schema (`.strict()`) | Unit |
| FR-010: Reject duplicate rules | 3 | validator | Unit + Integration |
| FR-011: Deterministic config hash | 5 | hasher | Unit + Integration |
| FR-012: Two example tenants | 7 | config files | Integration |
| FR-013: Tenant not found response | 4 | resolver | Unit |
| FR-014: No secrets in source | 2 | env-substitute | Integration |
| FR-015: Base default config | 3 | validator (merge) | Unit |
| FR-016: Tenant overrides defaults | 3 | validator (merge) | Unit |
| FR-017: Validate merged config | 3 | validator | Unit |
| FR-018: ${VAR:-default} fallback syntax | 2 | env-substitute | Unit |
| SC-001: Add tenant = add file | 7 | — | Integration |
| SC-002: Start in <10s | 7 | — | Integration |
| SC-003: Invalid → exit <5s | 7 | — | Integration |
| SC-004: 100% correct resolution | 7 | resolver | Integration |
| SC-005: Hash determinism | 5, 7 | hasher | Unit + Integration (golden) |
| SC-006: No secrets in files | 7 | — | Integration |
| SC-007: Quickstart works | 7 | quickstart.md | Manual |

## Parallel Work Strategy

The following phases can be worked in parallel using subagents:

- **Phase 1** (scaffold) must complete first — all others depend on it.
- **Phase 2** (config loading) and **Phase 6** (storage adapter) are independent — run in parallel.
- **Phase 3** (validation) depends on Phase 2.
- **Phase 4** (resolver) depends on Phase 3 (needs validated ConfigSnapshot).
- **Phase 5** (hasher) depends on Phase 3 (needs ConfigSnapshot type).
- **Phase 7** (integration) depends on all prior phases.

```
Phase 1 ──┬──► Phase 2 ──► Phase 3 ──┬──► Phase 4 ──► Phase 7
           │                          └──► Phase 5 ──► Phase 7
           └──► Phase 6 ─────────────────────────────► Phase 7
```

## Complexity Tracking

No Constitution violations. No complexity justifications needed.
