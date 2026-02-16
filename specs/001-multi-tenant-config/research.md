# Research: Multi-Tenant Configuration-as-Code

**Branch**: `001-multi-tenant-config` | **Date**: 2026-02-16

## 1. YAML Parsing

**Decision**: `yaml` (eemeli/yaml)
**Rationale**: Native TypeScript types, zero dependencies, YAML 1.2 compliant, actively maintained (v2.8.x). ISC license (Apache 2.0 compatible).
**Alternatives considered**: `js-yaml` — wider adoption but requires separate `@types/js-yaml`, less TypeScript-native.

## 2. Schema Validation

**Decision**: Zod
**Rationale**: TypeScript-first with automatic type inference, excellent human-readable error messages with field paths, built-in `.strict()` for rejecting unknown properties. Config validation is startup-only so Zod's 5-18x slower speed vs AJV is irrelevant. MIT license.
**Alternatives considered**: AJV + TypeBox — better performance but weaker error messages and more boilerplate. Overkill for 2-20 tenant startup validation.

## 3. Environment Variable Substitution

**Decision**: Custom regex-based `${VAR}` replacement
**Rationale**: Full control over error handling, denylist patterns, and security controls. Simple pattern (`/\$\{([^}]+)\}/g`) is well-understood. Substitution runs on raw YAML text *before* parsing, so validators see final typed values.
**Alternatives considered**: `dotenv-expand` — designed for `.env` files, not YAML configs. `envalid` — validates `process.env` but doesn't substitute into config files.

## 4. Config Hashing

**Decision**: `safe-stable-stringify` + Node.js built-in `crypto`
**Rationale**: Deterministic key ordering (alphabetical sort), fastest stable stringify (2.7x faster than alternatives), handles circular refs and BigInt. SHA-256 via built-in `crypto` — no extra dependency. MIT license.
**Alternatives considered**: `json-stable-stringify` — older, slower. `json-canonicalize` (RFC 8785) — stricter than needed for config hashing.

## 5. Storage Adapter

**Decision**: Custom `StorageAdapter` interface + `better-sqlite3` for local dev
**Rationale**: Minimal interface with tenant-scoped methods. `better-sqlite3` is fastest SQLite for Node.js, synchronous API suits SQLite's single-writer model, zero external deps. Production adapters (Postgres via Drizzle, MongoDB/DynamoDB via native clients) implemented behind same interface. MIT license.
**Alternatives considered**: Prisma — heavy, schema-first, `prisma generate` step. Kysely — pure query builder, more manual. TypeORM — decorator-based, heavier abstraction.

## 6. TypeScript Configuration

**Decision**: TypeScript 5.x, strict mode, `module: NodeNext`, `target: ES2022`
**Rationale**: `NodeNext` for dual ESM/CJS support. `ES2022` balances modern features with compatibility. `strict: true` + `noUncheckedIndexedAccess` catches subtle bugs.

## 7. Linting & Formatting

**Decision**: Biome
**Rationale**: 10-25x faster than ESLint + Prettier, single binary, built-in formatter (97% Prettier compatible), YAML config. MIT + Apache 2.0 dual license.
**Alternatives considered**: ESLint 9 flat config + Prettier — larger ecosystem but much slower and more config files.

## 8. Test Runner

**Decision**: Vitest
**Rationale**: 4x faster than Jest cold starts, native TypeScript/ESM support, Jest-compatible API, built-in coverage via v8. Workspace support for separating unit/integration tests. MIT license.
**Alternatives considered**: Jest — mature but slower, requires ts-jest/babel config. Node.js built-in test runner — too minimal for production use.

## 9. E2E Test Approach

**Decision**: Integration tests in Vitest with real config file fixtures
**Rationale**: For a config system (not a web UI), E2E means testing full startup → load → validate → resolve pipeline with real YAML files and env vars. Vitest workspace separates unit from integration tests. Golden config fixtures verify deterministic behaviour.

## 10. Package Manager

**Decision**: pnpm
**Rationale**: Strict dependency resolution (prevents phantom dependencies), content-addressable storage (disk savings), fast installs, `--frozen-lockfile` for reproducible CI builds. Industry standard for 2025-2026. MIT license.
**Alternatives considered**: Bun — faster but less mature for production. npm — slower, less strict.

## 11. Commit Hooks

**Decision**: Lefthook
**Rationale**: Go binary (faster than bash-based Husky), parallel hook execution, YAML config, glob-based file filtering, no Node.js runtime dependency. MIT license.
**Alternatives considered**: Husky + lint-staged — more popular but slower, sequential execution.

## 12. Secret Reference Syntax (Constitution Alignment)

**Decision**: Use `${VAR}` and `${VAR:-default}` syntax for environment variable substitution. Defer `secretRef:` support.
**Rationale**: The constitution originally referenced `env:` prefix syntax and `secretRef:` for secret-manager integration. `${VAR}` is the industry-standard syntax (Docker Compose, Spring Boot, shell) and is more familiar to operators. The constitution was amended to bless `${VAR}` syntax explicitly. `secretRef:` (for vault/KMS integration) is deferred to a future feature per the constitution's allowance — env var substitution covers all initial use cases.
**Alternatives considered**: `env:VAR_NAME` prefix syntax — less standard, unfamiliar to most operators. Implementing `secretRef:` now — adds scope (vault client, auth, caching) without immediate need for 2-20 tenant scale.

## License Compatibility Summary

All selected dependencies are MIT or ISC licensed — fully compatible with Apache 2.0.
