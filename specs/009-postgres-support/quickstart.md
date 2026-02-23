# Quickstart: PostgreSQL Database Support

**Branch**: `009-postgres-support` | **Date**: 2026-02-22

## Prerequisites

- Node.js 20.9+
- pnpm
- Docker (for running tests with Testcontainers)
- PostgreSQL 14+ (for local development with PostgreSQL; optional — SQLite works by default)

## Development Setup

### Option A: SQLite (default, no changes needed)

```bash
pnpm install
pnpm dev
```

SQLite is the default. No `DATABASE_URL` needed.

### Option B: Local PostgreSQL

```bash
# Start PostgreSQL (Docker example)
docker run -d --name jem-postgres \
  -e POSTGRES_USER=jem \
  -e POSTGRES_PASSWORD=jem \
  -e POSTGRES_DB=jem_attest \
  -p 5432:5432 \
  postgres:16

# Set connection string
export DATABASE_URL="postgres://jem:jem@localhost:5432/jem_attest"

pnpm install
pnpm dev
```

### Option C: Cloud PostgreSQL

Set `DATABASE_URL` to your cloud provider's connection string:

```bash
# Railway, Neon, Supabase, etc.
export DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require"

# AWS RDS with SSL
export DATABASE_URL="postgres://user:pass@rds-host:5432/db?sslmode=require"

# GCP Cloud SQL via Auth Proxy
export DATABASE_URL="postgres://user:pass@127.0.0.1:5432/db"

pnpm install
pnpm dev
```

The schema is created automatically on first request.

## Running Tests

```bash
# All tests (SQLite-based unit/integration + PostgreSQL contract tests)
pnpm test

# PostgreSQL-specific tests (requires Docker for Testcontainers)
pnpm test:integration
```

## Key Files

| File | Purpose |
|------|---------|
| `src/storage/adapter.ts` | StorageAdapter interface (unchanged) |
| `src/storage/types.ts` | Query types (unchanged) |
| `src/storage/sqlite-adapter.ts` | SQLite implementation (unchanged) |
| `src/storage/postgres-adapter.ts` | **New** — PostgreSQL implementation |
| `src/storage/factory.ts` | **New** — Adapter factory (singleton selection) |
| `tests/contract/storage-adapter.spec.ts` | Contract tests (extended for PostgreSQL) |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | (none) | PostgreSQL connection string. Activates PostgreSQL adapter. |
| `DB_PATH` | No | `data/jem.db` | SQLite file path. Used when `DATABASE_URL` is absent. |
