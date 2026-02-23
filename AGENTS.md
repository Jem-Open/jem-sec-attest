# AGENTS.md

Multi-tenant security attestation training platform.

## Setup

```bash
pnpm install                # Install dependencies (pnpm only, not npm/yarn)
cp .env.example .env        # Then fill in required values (see Environment below)
```

## Development

```bash
pnpm dev                    # Start dev server (tsx src/index.ts)
pnpm build                  # Production build (tsc)
pnpm start                  # Run production build (node dist/index.js)
```

## Testing

Vitest with three project scopes: `unit`, `integration`, `contract`.

```bash
pnpm test                   # All tests
pnpm test:unit              # Unit tests only (tests/unit/**/\*.spec.ts)
pnpm test:integration       # Integration tests only (tests/integration/**/\*.spec.ts)
pnpm test:coverage          # All tests with coverage (80% threshold on branches/functions/lines/statements)
pnpm test:watch             # Watch mode
```

Run a single test file:

```bash
pnpm vitest run tests/unit/training/state-machine.spec.ts
```

Run tests matching a name pattern:

```bash
pnpm vitest run -t "should transition"
```

### Test conventions

- Vitest globals (`describe`, `it`, `expect`, `vi`) available without import.
- Use `vi.hoisted()` for mock objects referenced inside `vi.mock()` factories — required because route files instantiate adapters at module scope.
- Test files use `.spec.ts` extension.

## Lint / Format

```bash
pnpm lint                   # Biome check (errors on unused vars/imports, explicit any, etc.)
pnpm lint:fix               # Biome auto-fix
pnpm format                 # Biome format (2-space indent, double quotes, semicolons, 100 line width)
pnpm type-check             # tsc --noEmit
```

Fix formatting on a specific file:

```bash
npx biome check --write src/path/to/file.ts
```

## Pre-commit Hooks

Lefthook runs `pnpm lint` and `pnpm type-check` in parallel on pre-commit.

## CI (GitHub Actions)

All checks must pass on PRs to `main`:

1. **Lint** — `pnpm lint`
2. **Type Check** — `pnpm type-check`
3. **Test** — `pnpm test:coverage`
4. **Build** — `pnpm build` (runs after lint, type-check, and test pass)

## PR Requirements

- Branch off `main`; commit format: `feat(scope): description` or `fix(scope): description`
- All CI checks must pass (lint, type-check, test:coverage, build)
- Apache 2.0 license headers on all source files

## Key Directories

```
src/
  auth/            # OIDC authentication adapters (openid-client v6, iron-session v8)
  config/          # Multi-tenant YAML config loading
  tenant/          # Tenant types and resolution
  intake/          # Role profile generation (AI-powered, Vercel AI SDK v6)
  training/        # Training workflow state machine
  storage/         # StorageAdapter interface, SQLite + PostgreSQL adapters
  audit/           # Audit logging
  compliance/      # Compliance integrations (e.g., Sprinto)
  evidence/        # PDF evidence export (pdfkit)
  guardrails/      # AI guardrails
  i18n/            # Internationalization
  retention/       # Data retention policies
app/
  api/auth/[tenant]/       # signin, callback, signout routes
  api/intake/[tenant]/     # profile, generate, confirm routes
  api/training/[tenant]/   # session, module content/quiz/scenario, evaluate, abandon routes
  api/admin/               # Admin routes
  [tenant]/                # Tenant-scoped pages
config/
  tenants/         # Per-tenant YAML configs (acme-corp.yaml, globex-inc.yaml)
  defaults.yaml    # Default config values
  schema/          # Config JSON schema
tests/
  unit/            # Mocked dependencies, fast
  integration/     # Real SQLite, multi-module flows
  contract/        # API contract validation (golden files)
  fixtures/        # Shared test data
migrations/
  sqlite/          # SQLite migration files
scripts/
  generate-schema.ts  # Config schema generation
```

## Code Style

- **TypeScript strict mode** with `noUncheckedIndexedAccess`
- **Path alias**: `@/*` → `./src/*`
- **Route files** (`app/api/`): Use `@/` alias imports without `.js` extension
- **Source files** (`src/`): Use `.js` extension in relative imports
- **Biome** enforces: import sorting, `useConst`, no unused vars/imports, no explicit `any`

## Environment

Copy `.env.example` to `.env`. Required:

- `SESSION_SECRET` — minimum 32 characters
- At least one AI provider key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `AZURE_OPENAI_API_KEY`
- Per-tenant webhook secrets (e.g., `ACME_WEBHOOK_SECRET`)

Optional:

- `DATABASE_URL` — PostgreSQL connection string (defaults to SQLite at `data/jem.db`)
- `DB_PATH` — SQLite path override (when `DATABASE_URL` is not set)

## Tech Stack

- TypeScript 5.9, Node.js 20.9+, Next.js 16.x (App Router), React 19.x
- pnpm 9.x, Biome, Vitest, Lefthook
- SQLite (`better-sqlite3`) / PostgreSQL (`postgres`)
- Vercel AI SDK v6, Zod v4, openid-client v6, iron-session v8
