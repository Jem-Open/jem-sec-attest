# jem-sec-attest

AI-driven, multi-tenant security attestation training platform.

jem-sec-attest generates personalised security training modules based on an employee's role profile, delivers interactive learning content (quizzes, scenario-based exercises), and produces compliance-grade evidence of completion. Each tenant gets an isolated training environment with its own authentication, configuration, and data store.

## Features

- **Multi-tenant architecture** — hostname and email-domain routing with strict data isolation
- **AI-powered role profile generation** — Vercel AI SDK v6 with Zod-validated structured output
- **Two-level training state machine** — session-level (8 states) and module-level (6 states) workflows
- **Dual scoring** — multiple-choice (numeric 1.0/0.0) and free-text (LLM-evaluated 0.0–1.0)
- **OIDC authentication** — openid-client v6 with iron-session encrypted cookies
- **Dual database support** — SQLite (zero-config) or PostgreSQL
- **Compliance integration** — evidence export and audit trail
- **Internationalisation and accessibility** — i18n support, WCAG compliance
- **Secret redaction** — automatic detection and redaction of sensitive values in logs

## Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript 5.9 (strict mode), Node.js 20.9+ |
| Framework | Next.js 16.x (App Router), React 19.x |
| Package manager | pnpm 9.x |
| Database | SQLite (`better-sqlite3`) or PostgreSQL (`postgres.js`) |
| AI | Vercel AI SDK v6 (`ai` package) — `generateObject()` with Zod schemas |
| Auth | `openid-client` v6.x (OIDC), `iron-session` v8.x (encrypted cookies) |
| Validation | Zod v4.x |
| Config | YAML tenant configs with `${VAR}` env substitution, `dotenv` |
| Linter/Formatter | Biome (2-space indent, double quotes, semicolons, 100-char width) |
| Tests | Vitest (unit, integration, contract), Playwright (E2E) |

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20.9+ | Runtime |
| pnpm | 9.x | `npm install -g pnpm` |
| Docker | 24+ | Only for PostgreSQL + OIDC local stack |
| AI provider key | — | Anthropic, OpenAI, or Azure OpenAI |

## Quick Start

```bash
# Clone and install
git clone https://github.com/Jem-Open/jem-sec-attest.git
cd jem-sec-attest
pnpm install

# Configure environment
cp .env.example .env
# Edit .env — set SESSION_SECRET (min 32 chars) and at least one AI provider key

# Start the dev server (uses SQLite by default — no database setup needed)
pnpm dev
```

Open http://localhost:3000/acme-corp to access the acme-corp tenant.

To use PostgreSQL instead of SQLite, set `DATABASE_URL` in `.env`:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/jem_attest
```

The schema is auto-initialised on first connection — no migrations required.

## Local Development with Docker

The Docker Compose stack runs **infrastructure only** (PostgreSQL + Dex OIDC IDP). The Next.js app always runs locally via `pnpm dev` for hot-reload and debugging.

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker | 24+ | Docker Desktop on Mac/Windows |
| Docker Compose | v2 | Bundled with Docker Desktop |
| pnpm | 9.x | `npm install -g pnpm` |
| Node.js | 20.9+ | For running the app and Playwright locally |

### One-Time Setup

#### 1. Add the Dex hostname to `/etc/hosts`

The Dex identity provider runs as `dex` inside Docker. Both your browser and the local app need to resolve this hostname.

**macOS / Linux:**
```bash
echo "127.0.0.1 dex" | sudo tee -a /etc/hosts
```

**Windows** (Administrator PowerShell):
```powershell
Add-Content C:\Windows\System32\drivers\etc\hosts "127.0.0.1 dex"
```

Verify:
```bash
ping -c 1 dex
# Expected: PING dex (127.0.0.1)
```

#### 2. Install dependencies

```bash
pnpm install
pnpm exec playwright install chromium   # For E2E tests
```

#### 3. Configure environment variables

```bash
cp .env.example .env
```

Set the following in `.env`:

```bash
SESSION_SECRET=<minimum-32-character-random-string>
ANTHROPIC_API_KEY=<your-anthropic-api-key>

# Docker infrastructure
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jem_attest
ACME_OIDC_ISSUER_URL=http://dex:5556/dex
ACME_OIDC_CLIENT_ID=jem-app
ACME_OIDC_CLIENT_SECRET=local-dev-secret-min32chars-replace-this-1234
ACME_OIDC_REDIRECT_URI=http://localhost:3000/api/auth/acme-corp/callback
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Starting the Stack

```bash
# Terminal 1 — start infrastructure (PostgreSQL + Dex)
pnpm docker:up

# Terminal 2 — start the application
pnpm dev
```

**Infrastructure URLs:**

| Service | URL |
|---|---|
| Application | http://localhost:3000/acme-corp |
| Dex IDP | http://dex:5556/dex |
| Dex health | http://localhost:5558/healthz/ready |
| PostgreSQL | localhost:5432 |

### Test Users

| Name | Email | Password |
|---|---|---|
| Alice Acme | `alice@acme.com` | `Acme1234!` |

Users are defined in `docker/dex/config.yaml` (in-memory storage). To add users, edit that file and restart the stack.

### Watching Logs

```bash
docker compose -f docker/compose.yml logs -f           # All services
docker compose -f docker/compose.yml logs -f dex        # Dex only
docker compose -f docker/compose.yml logs -f postgres   # PostgreSQL only
```

Application logs appear in the `pnpm dev` terminal.

### Running E2E Tests

With infrastructure and app both running:

```bash
pnpm test:e2e                                                  # Run all E2E tests
pnpm exec playwright test --headed                             # Watch the browser
pnpm exec playwright test tests/e2e/journey.spec.ts            # Single file
pnpm exec playwright test --debug tests/e2e/journey.spec.ts    # Debug mode
pnpm exec playwright show-report                               # View failure report
```

### Stopping

```bash
# Ctrl+C in the pnpm dev terminal
pnpm docker:down    # Stops containers and removes volumes
```

### Troubleshooting

**OIDC discovery fails — cannot reach `http://dex:5556/dex`**

Check `/etc/hosts` and Dex health:
```bash
grep dex /etc/hosts                          # Should show: 127.0.0.1 dex
docker compose -f docker/compose.yml ps      # dex should show "healthy"
```

**Database connection error**

Verify PostgreSQL is healthy and `DATABASE_URL` points to `localhost:5432` (not `postgres:5432`):
```bash
docker compose -f docker/compose.yml ps      # postgres should show "healthy"
```

**Playwright tests fail with "Target page was closed"**

Wait for `pnpm dev` to finish starting and confirm http://localhost:3000/acme-corp loads in a browser before running tests.

**`SESSION_SECRET must be set and at least 32 characters`**

Generate a valid secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Security Notes

- Dex IDP and test credentials are for **local development only** — never used in production.
- `.env` is in `.gitignore` and must not be committed.
- No TLS in the local stack — do not expose these ports to untrusted networks.

## Project Structure

```text
src/
  config/          # Multi-tenant YAML config loading
  tenant/          # Tenant types and resolution
  auth/            # OIDC authentication adapters
  intake/          # Role profile generation (AI-powered)
  training/        # Training workflow state machine
  storage/         # StorageAdapter interface + SQLite/Postgres adapters
app/
  api/
    auth/[tenant]/       # signin, callback, signout
    intake/[tenant]/     # profile, generate, confirm
    training/[tenant]/   # session, module content/quiz/scenario, evaluate, abandon
    health/              # Health check endpoint
  [tenant]/              # Tenant-scoped pages
  layout.tsx
config/                  # Tenant YAML configuration files
docker/
  compose.yml            # PostgreSQL + Dex infrastructure
  dex/config.yaml        # Dex IDP configuration
tests/
  unit/                  # Mocked dependencies, fast
  integration/           # Real database, multi-module flows
  contract/              # API contract validation (testcontainers)
  e2e/                   # Playwright browser tests
  fixtures/              # Shared test data
```

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run Biome linter |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Auto-format with Biome |
| `pnpm type-check` | TypeScript type checking (`tsc --noEmit`) |
| `pnpm test` | Run all tests (unit + integration + contract) |
| `pnpm test:unit` | Unit tests only |
| `pnpm test:integration` | Integration tests only |
| `pnpm test:coverage` | Tests with coverage report (80% threshold) |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm docker:up` | Start Docker infrastructure (PostgreSQL + Dex) |
| `pnpm docker:down` | Tear down Docker infrastructure and volumes |
| `pnpm generate:schema` | Generate JSON schema from TypeScript types |

## Configuration

Tenants are defined in YAML files under `config/`. Each tenant specifies its display name, resolution rules (hostname, email domain), authentication method, training parameters, and optional compliance integrations.

Environment variable substitution (`${VAR}` and `${VAR:-default}`) is supported in YAML configs — secrets are injected at runtime, never hardcoded. See [`.env.example`](.env.example) for all available variables.

To add a new tenant, create a YAML config file in `config/` following the existing examples and set the corresponding environment variables.

## Testing

The project uses four test tiers:

| Tier | Tool | Scope | Command |
|---|---|---|---|
| Unit | Vitest | Isolated functions with mocked dependencies | `pnpm test:unit` |
| Integration | Vitest | Multi-module flows with real SQLite database | `pnpm test:integration` |
| Contract | Vitest | API contract validation with PostgreSQL via testcontainers | `pnpm test` |
| E2E | Playwright | Full browser flows against Docker infrastructure | `pnpm test:e2e` |

Coverage threshold is 80%, enforced via `pnpm test:coverage`.

## Production Deployment

Build and run using Docker:

```bash
docker build -t jem-sec-attest .
docker run -p 3000:3000 --env-file .env.docker jem-sec-attest
```

The Dockerfile uses a multi-stage build:
- **Builder stage** — installs dependencies and compiles the Next.js standalone output
- **Runner stage** — minimal `node:20-alpine` image with non-root user (`nextjs:1001`)
- **Health check** — `GET /api/health` returns HTTP 200

Environment variables (database, OIDC, AI keys) are injected at runtime via `--env-file` — no secrets are baked into the image.

## Security

- **Tenant isolation** — all storage operations scoped by `tenantId`; cross-tenant access is impossible at the adapter level
- **Secret redaction** — variables matching `*_SECRET`, `*_KEY`, `*_PASSWORD`, `*_TOKEN` are automatically redacted in logs
- **Configuration validation** — strict schema validation at startup; missing required fields cause fail-fast
- **Global uniqueness** — hostnames and email domains are enforced unique across tenants

See [`docs/SECURITY.md`](docs/SECURITY.md) for full details on environment variable management, tenant isolation, audit trails, and the secret reference roadmap.

## Contributing

1. **Pre-commit hooks** — [Lefthook](https://github.com/evilmartians/lefthook) runs `lint` and `type-check` automatically on commit
2. **Formatting** — Biome enforces 2-space indent, double quotes, semicolons, 100-char line width. Run `pnpm lint:fix` to auto-fix
3. **License headers** — all source files must include the Apache 2.0 license header
4. **Path aliases** — use `@/*` for imports from `src/`; no file extensions needed (`moduleResolution: "bundler"`)
5. **Package manager** — use `pnpm`, not npm or yarn

## License

[Apache License 2.0](LICENSE)

Copyright 2026 jem-sec-attest contributors. See [NOTICE](NOTICE) for attribution.
