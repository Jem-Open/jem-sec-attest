# jem-sec-attest

Multi-tenant security attestation training platform.

## Tech Stack

- **Language**: TypeScript 5.9 (strict mode), Node.js 20.9+
- **Framework**: Next.js 16.x (App Router), React 19.x
- **Package manager**: pnpm
- **Linter/Formatter**: Biome (2-space indent, double quotes, semicolons, 100 line width)
- **Tests**: Vitest with projects: `unit`, `integration`, `contract`
- **Storage**: SQLite via `better-sqlite3` through `StorageAdapter` interface
- **AI**: Vercel AI SDK v6 (`ai` package) — `generateObject()` with Zod schemas
- **Auth**: `openid-client` v6.x (OIDC), `iron-session` v8.x (encrypted cookies)
- **Validation**: Zod v4.x
- **Config**: YAML tenant configs, `dotenv` for env vars

## Project Structure

```text
src/
  config/          # Multi-tenant YAML config loading
  tenant/          # Tenant types and resolution
  auth/            # OIDC authentication adapters
  intake/          # Role profile generation (AI-powered)
  training/        # Training workflow state machine
  storage/         # StorageAdapter interface + SQLite adapter
app/
  api/
    auth/[tenant]/       # signin, callback, signout
    intake/[tenant]/     # profile, generate, confirm
    training/[tenant]/   # session, module content/quiz/scenario, evaluate, abandon
  [tenant]/              # Tenant-scoped pages
  layout.tsx
tests/
  unit/            # Mocked dependencies, fast
  integration/     # Real SQLite, multiple modules
  contract/        # API contract validation
  fixtures/        # Shared test data
```

## Commands

```bash
pnpm test                   # Run all tests (unit + integration + contract)
pnpm test:unit              # Unit tests only
pnpm test:integration       # Integration tests only
pnpm test:coverage          # Tests with coverage report (80% threshold)
pnpm lint                   # Biome check
pnpm lint:fix               # Biome auto-fix
pnpm type-check             # tsc --noEmit
pnpm build                  # Production build
pnpm dev                    # Development server
```

## Code Style

- **Biome** enforces: import sorting, no unused vars/imports, no explicit `any`, `useConst`
- **Path alias**: `@/*` maps to `./src/*`
- **All imports**: Use `@/` alias for `src/` modules; use bare relative paths (`../config/index`) without file extensions — `moduleResolution: "bundler"` handles resolution
- **Apache 2.0 license headers** on all source files
- **Pre-commit hooks** (lefthook): lint + type-check run automatically

## Testing

- Vitest globals (`describe`, `it`, `expect`, `vi`) are available without import — configured per-project
- **Mock pattern**: Use `vi.hoisted()` for mock objects referenced inside `vi.mock()` factories:
  ```typescript
  const { mockRepo } = vi.hoisted(() => {
    const mockRepo = { findById: vi.fn() };
    return { mockRepo };
  });
  vi.mock("@/training/session-repository", () => ({
    SessionRepository: vi.fn().mockImplementation(() => mockRepo),
  }));
  ```
- Route files create `new SQLiteAdapter()` at module scope — tests must use the `vi.hoisted()` pattern above
- **Config mocks**: `@/config/index` mocks must export BOTH `getSnapshot` (sync) AND `ensureConfigLoaded` (async) — route files use the async version:
  ```typescript
  vi.mock("@/config/index", () => ({
    getSnapshot: vi.fn().mockReturnValue(snapshot),
    ensureConfigLoaded: vi.fn().mockResolvedValue(snapshot),
  }));
  ```
- **Module generator mocks**: `ModuleContentLlmSchema` output uses flat `quizQuestions[]`; test mocks must use this shape (not nested `quiz: { questions[] }`)

## Environment

Copy `.env.example` to `.env`. Required variables:

- `SESSION_SECRET` — minimum 32 characters for iron-session encryption
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `AZURE_OPENAI_API_KEY`) — at least one AI provider key
- Per-tenant webhook secrets (e.g., `ACME_WEBHOOK_SECRET`)

## Gotchas

- **pnpm, not npm** — all commands use pnpm; `npm test` works but `pnpm test` is canonical
- **Biome lint artifacts** — `playwright-report/` and `test-results/` contain compiled JS that triggers ~650 Biome errors; add them to `biome.json` `files.ignore` when present
- **Biome tabs vs spaces** — run `npx biome check --write <file>` after creating files to fix formatting
- **Integration tests need globals** — vitest `globals: true` must be set per-project in `vitest.config.ts`, not just at root level
- **Tenant isolation** — every API route validates `[tenant]` param against loaded config; storage queries must filter by tenant

## Recent Changes
- 011-docker-e2e-testing: Added Docker local stack (PostgreSQL + Dex IDP), Playwright E2E test suite, and health endpoint
- 009-postgres-support: Added TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x, React 19.x, `postgres` (postgres.js — Unlicense, zero deps)
- 008-guardrails-i18n-a11y: Added TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, Vercel AI SDK v6, Zod v4.x

## Docker Local Stack

The Docker Compose stack (`docker/compose.yml`) runs **infrastructure only** — PostgreSQL and Dex OIDC IDP. The Next.js application always runs locally via `pnpm dev`. This is by design: the app uses hot-reload and local debugging, while external dependencies (database, identity provider) run in containers.

```bash
pnpm docker:up              # Start infra (Postgres + Dex)
pnpm dev                    # Start the app locally (required separately)
pnpm docker:down            # Tear down infra
```

Do **not** add an `app` service to `docker/compose.yml` — the app is always run locally.

## Active Technologies
- TypeScript 5.9, Node.js 20.9+ (011-docker-e2e-testing)
- PostgreSQL 16 via `PostgresAdapter` (existing); schema auto-initialised by `adapter.initialize()` on first connection (011-docker-e2e-testing)
