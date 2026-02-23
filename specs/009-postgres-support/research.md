# Research: PostgreSQL Database Support

**Branch**: `009-postgres-support` | **Date**: 2026-02-22

## Decision 1: PostgreSQL Client Library

**Decision**: Use `postgres` (postgres.js / porsager) as the PostgreSQL client library.

**Rationale**:
- **Zero runtime dependencies** — self-contained, no transitive packages to audit
- **Bundled TypeScript types** — no separate `@types/` package needed for TS 5.9 strict
- **Built-in connection pooling** — always-on pool, configurable `max` (default 10)
- **Native connection string parsing** — handles `sslmode=require` from standard `postgres://` URLs without manual SSL object construction
- **Unlicense (public domain)** — maximally permissive, fully Apache 2.0 compatible
- **~300 kB unpacked** — lighter than `pg` (~600-700 kB)
- **Supabase officially recommends it** as their primary Node.js driver
- **Tagged template literals** prevent SQL injection by construction

**Alternatives considered**:

| Library | Verdict | Reason |
|---------|---------|--------|
| `pg` (node-postgres) | Runner-up | 17M+ weekly downloads, battle-tested. Requires separate `@types/pg`, 8 sub-package dependencies. Would also work well but postgres.js wins on every technical criterion for this project. |
| `@neondatabase/serverless` | Eliminated | Designed for Neon only. Connecting to AWS RDS, GCP Cloud SQL, or Azure requires a custom WebSocket proxy — unacceptable for multi-cloud requirement. |

## Decision 2: Cloud Compatibility Strategy

**Decision**: Use standard PostgreSQL connection strings with SSL/TLS support via `sslmode` parameter. No cloud-specific adapters or SDKs.

**Rationale**:
- All major cloud providers (AWS RDS, GCP Cloud SQL, Azure Database for PostgreSQL, Railway, Neon, Supabase) support standard `postgres://` connection strings
- `sslmode=require` in the connection string is parsed natively by postgres.js
- Custom CA certificates can be provided via the `ssl` option for `sslmode=verify-full`
- Cloud SQL Auth Proxy, RDS Proxy, and pgbouncer work transparently (the client sees a standard PostgreSQL endpoint)
- Constitution Principle V (Pluggable Architecture): no cloud-specific hosting assumptions

**Connection string examples**:
- AWS RDS: `postgres://user:pass@rds-host:5432/db?sslmode=require`
- GCP Cloud SQL (via proxy): `postgres://user:pass@127.0.0.1:5432/db`
- Azure: `postgres://user:pass@azure-host:5432/db?sslmode=require`
- Railway: `postgres://user:pass@railway-host:5432/db?sslmode=require`
- Neon: `postgres://user:pass@neon-host:5432/db?sslmode=require`
- Supabase: `postgres://user:pass@supabase-host:5432/db?sslmode=require`
- Self-hosted (no SSL): `postgres://user:pass@localhost:5432/db`
- Self-hosted (SSL): `postgres://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=/path/to/ca.pem`

## Decision 3: Adapter Lifecycle Pattern

**Decision**: Shared singleton — adapter factory creates one adapter instance at startup, shared by all routes.

**Rationale**:
- PostgreSQL connection pools must be shared to be effective; per-request pool creation defeats the purpose
- SQLite also benefits from a single connection (WAL mode allows concurrent reads)
- Routes no longer manage `close()` — the factory handles lifecycle
- Simplifies route code: `getStorage()` instead of `new SQLiteAdapter(...)` + `try/finally`

## Decision 4: Schema Approach

**Decision**: Mirror the SQLite single-table document-store pattern using PostgreSQL `jsonb` column type.

**Rationale**:
- Preserves behavioral parity with SQLite adapter (FR-010)
- `jsonb` supports efficient indexing and querying (`->`, `->>`, `@>` operators)
- SQLite `json_extract(data, '$.field')` maps to PostgreSQL `data->>'field'`
- Same `records` table structure: `id`, `tenant_id`, `collection`, `data` (jsonb), `created_at`, `updated_at`
- Enables future migration to relational schema without blocking this feature

## Decision 5: Test Infrastructure

**Decision**: Use Testcontainers for PostgreSQL test instances.

**Rationale**:
- Spins up real PostgreSQL in Docker — no behavioral gaps vs. production
- Disposable containers per test suite — clean state guaranteed
- Works in CI (GitHub Actions, etc.) and local dev with Docker
- No external PostgreSQL instance required for development

**Package**: `@testcontainers/postgresql` (MIT license)

## Decision 6: Adapter Selection Configuration

**Decision**: Use `DATABASE_URL` environment variable. If it starts with `postgres://` or `postgresql://`, use PostgreSQL adapter. Otherwise, fall back to SQLite with `DB_PATH` (or default `data/jem.db`).

**Rationale**:
- `DATABASE_URL` is the industry-standard environment variable name (Railway, Heroku, Render, Neon, Supabase all set it automatically)
- Protocol prefix detection (`postgres://` / `postgresql://`) is unambiguous
- Full backward compatibility: if `DATABASE_URL` is not set, SQLite is used exactly as before
- No new configuration files or schemas needed — Constitution Principle I satisfied by env var
