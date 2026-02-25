# Research: Docker Local Environment & E2E Testing

**Feature**: 011-docker-e2e-testing
**Date**: 2026-02-23
**Sources**: Background research agents (Dex OIDC, Playwright E2E, Next.js Docker)

---

## Decision 1: Test IDP — Dex

**Decision**: Use `dexidp/dex:v2.41.1` as the local OIDC identity provider.

**Rationale**:
- Purpose-built OpenID Connect provider, not a general-purpose IAM system
- Lightweight (single binary) — minimal container overhead compared to Keycloak
- In-memory storage mode eliminates a fourth container
- Native `staticPasswords` connector — test users declared in a YAML config file, no admin API calls needed
- Official Docker Hub image with a stable pinned tag; well-documented for exactly this use case
- The OIDC well-known endpoint (`/.well-known/openid-configuration`) on port `5556` is reachable once Dex is ready, suitable for Docker Compose `healthcheck` (note: `curl` is not available in the Alpine-based Dex image; use `wget` from BusyBox instead)

**Alternatives considered**:
- `mock-oauth2-server` (navikt): Simpler but no Playwright-compatible form-based login UI; requires API-based token injection
- Keycloak: Full-featured but requires a second database container and much longer startup time
- `node-oidc-provider`: Needs custom scaffolding to stand up

---

## Decision 2: OIDC Hostname Strategy

**Decision**: Use the Docker Compose service name `dex` as the issuer hostname. Add a one-time `/etc/hosts` entry (`127.0.0.1 dex`) on the developer's machine.

**Rationale**:
The fundamental challenge with Docker OIDC: the authorization URL in the OIDC redirect must be resolvable by the browser (running on the host), yet the app container must reach the IDP for token discovery and exchange. Using the Docker service name `dex` solves both:

- **App container → Dex**: Docker Compose bridge network DNS resolves `dex` to the Dex container's internal IP. No extra configuration needed.
- **Browser → Dex**: The host's `/etc/hosts` maps `127.0.0.1 dex`; Dex's port `5556` is mapped to the host. Browser can reach `http://dex:5556/dex/auth?...`.
- **Token issuer verification**: The issued token's `iss` claim (`http://dex:5556/dex`) matches the app's configured `ACME_OIDC_ISSUER_URL`. No issuer mismatch.

This is a one-time developer-machine setup step, documented in `quickstart.md`.

**Alternatives considered**:
- `host.docker.internal`: Works on Mac Docker Desktop but requires explicit `extra_hosts: host-gateway` on Linux; the browser still can't resolve `host.docker.internal` without system configuration
- `localhost` as issuer: Requires `network_mode: host` for the app container, which breaks inter-service DNS on Mac Docker Desktop
- Traefik/nginx proxy: Adds a fourth container and complexity for a purely local dev concern

---

## Decision 3: Next.js Docker Build — Standalone Output

**Decision**: Add `output: "standalone"` to `next.config.ts`. Use a two-stage Dockerfile: `node:20-alpine` builder → minimal runner.

**Rationale**:
- Standalone output reduces the production Docker image from multi-GB (full `node_modules`) to ~200–400 MB (only required modules)
- The generated `server.js` starts the app with `node server.js` — no Next.js CLI dependency at runtime
- `HOSTNAME=0.0.0.0` environment variable required for the container to accept connections from outside
- Non-root `nodejs:1001` user is a Docker security best practice
- `postgres` and `better-sqlite3` must both be listed in `serverExternalPackages` to prevent bundling of native modules
- `NEXT_PUBLIC_*` variables are baked in at build time; all secrets and URLs are injected at runtime via environment variables

**Build-time vs runtime env vars**:
| Variable | Stage | Example |
|---|---|---|
| `NEXT_PUBLIC_*` | Build | Not used in this project currently |
| `SESSION_SECRET`, `DATABASE_URL`, `ACME_OIDC_*`, `ANTHROPIC_API_KEY` | Runtime | Injected via Docker Compose `environment:` |

---

## Decision 4: Playwright — CLI-First, Host Machine

**Decision**: Install `@playwright/test` as a dev dependency. Tests run from the host machine using the Playwright CLI. `playwright.config.ts` at the project root. Tests live in `tests/e2e/`.

**Rationale**:
- User explicitly requested "playwright cli" — tests run via `pnpm test:e2e` or `npx playwright test` on the host
- Host-machine Playwright can reach the app at `http://localhost:3000` and Dex at `http://dex:5556` (via `/etc/hosts`)
- `tests/e2e/` directory already exists in the project; consistent with the existing test layout
- `screenshot: "only-on-failure"` and `trace: "on-first-retry"` minimize artifact noise while capturing failures

**Key config choices**:
- `baseURL: "http://localhost:3000"` — app port mapped to host
- `outputDir: "test-results"` — already exists in the project
- `webServer` block NOT used — stack is started separately with `pnpm docker:up`
- No `projects` for CI yet — single Chromium project for local testing

**Auth state persistence**:
- Global setup (`auth.setup.ts`) authenticates once and saves `storageState` to `tests/e2e/.auth/user.json`
- Journey spec loads the saved state rather than re-authenticating before each test
- `.auth/` directory added to `.gitignore`

---

## Decision 5: Tenant Config — Env-Var OIDC in acme-corp.yaml

**Decision**: Extend `config/tenants/acme-corp.yaml` with an `auth.oidc` block using environment variable substitution for all mutable fields.

**Rationale**:
- The existing `acme-corp.yaml` already uses `${ACME_WEBHOOK_SECRET}` pattern — consistent
- Config schema (`config/schema/auth.schema.json`) already defines `OIDCConfig` with required fields: `issuerUrl`, `clientId`, `clientSecret`, `redirectUri`, `scopes`
- `clientSecret` schema enforces `^\$\{...\}$` pattern — must be an env var reference
- Other fields (`issuerUrl`, `redirectUri`) are string/URI — can be literal or env-var-substituted depending on what the config loader supports; env vars used for all fields so the same YAML works for Docker and production
- Production deployments set their own values for these env vars; if unset, OIDC is not configured and auth fails gracefully (existing behaviour)

**New env vars** (added to `.env.example`):
| Variable | Docker value | Notes |
|---|---|---|
| `ACME_OIDC_ISSUER_URL` | `http://dex:5556/dex` | Internal Docker DNS resolution |
| `ACME_OIDC_CLIENT_ID` | `jem-app` | Must match Dex staticClient id |
| `ACME_OIDC_CLIENT_SECRET` | Secret (see `.env.docker.example`) | Must match Dex staticClient secret |
| `ACME_OIDC_REDIRECT_URI` | `http://localhost:3000/api/auth/acme-corp/callback` | Browser-facing; must match Dex config |

---

## Decision 6: Health Check Endpoint

**Decision**: Create `app/api/health/route.ts` as a Next.js App Router route handler returning `{ status: "healthy" }`.

**Rationale**:
- Next.js has no built-in health endpoint; a custom route is required for Docker `HEALTHCHECK` and Docker Compose `healthcheck`
- Must use `export const dynamic = "force-dynamic"` to prevent static caching at build time
- Returns HTTP 200 (healthy) or HTTP 503 (unhealthy) — standard convention
- Lightweight: no database check required for the initial implementation; the storage adapter's `initialize()` already runs at startup

---

## Decision 7: PostgreSQL Schema Initialisation

**Decision**: No separate migration file needed. The `PostgresAdapter.initialize()` method already runs `CREATE TABLE IF NOT EXISTS records (...)` on startup.

**Rationale**:
- `src/storage/postgres-adapter.ts` contains `initialize()` which creates the schema idempotently
- The `getStorage()` factory calls `adapter.initialize()` before returning the adapter
- On first Docker Compose start, the schema is created automatically when the app first receives a request that touches storage

---

## Decision 8: Docker Compose Service Ordering

**Decision**: Use `depends_on: condition: service_healthy` to sequence startup: `postgres` → `dex` → `app`.

**Rationale**:
- Postgres and Dex both expose health endpoints; healthy state is verifiable before starting the app
- Prevents the app from crashing on startup if the database or IDP is not yet ready
- `postgres` healthcheck: `pg_isready` command (built into the postgres image)
- `dex` healthcheck: `wget --spider --quiet http://localhost:5556/dex/.well-known/openid-configuration` (`curl` is not available in the Alpine Dex image; `wget` from BusyBox is used instead; port 5556 is Dex's main OIDC listener)
- `app` healthcheck: `curl http://localhost:3000/api/health` (the new health route)
