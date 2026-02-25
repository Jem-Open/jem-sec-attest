# Quickstart: Local E2E Testing

This guide walks you through starting the infrastructure services in Docker, running the Next.js application locally, and executing the Playwright E2E test suite.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker | 24+ | Docker Desktop on Mac/Windows |
| Docker Compose | v2 | Bundled with Docker Desktop |
| pnpm | 9.x | `npm install -g pnpm` |
| Node.js | 20.9+ | For running the app and Playwright locally |

## One-Time Setup

### 1. Add the local IDP hostname to /etc/hosts

The Dex identity provider runs as `dex` in Docker. Your browser and the locally-running app both need to resolve this hostname.

```bash
echo "127.0.0.1 dex" | sudo tee -a /etc/hosts
```

Verify:
```bash
ping -c 1 dex
# Expected: PING dex (127.0.0.1)
```

### 2. Install dependencies (including Playwright)

```bash
pnpm install
pnpm exec playwright install chromium
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set the following values for local development:

```bash
# Session encryption — generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=<minimum-32-character-random-string>

# AI provider (required for training intake role profile generation)
ANTHROPIC_API_KEY=<your-anthropic-api-key>

# Database — points to the dockerised PostgreSQL on localhost
DATABASE_URL=postgres://postgres:postgres@localhost:5432/jem_attest

# OIDC — points to the dockerised Dex IDP (resolved via /etc/hosts)
ACME_OIDC_ISSUER_URL=http://dex:5556/dex
ACME_OIDC_CLIENT_ID=jem-app
ACME_OIDC_CLIENT_SECRET=local-dev-secret-min32chars-replace-this-1234
ACME_OIDC_REDIRECT_URI=http://localhost:3000/api/auth/acme-corp/callback
```

> **Note**: The `ACME_OIDC_CLIENT_SECRET` must match the value in `docker/dex/config.yaml`. The pre-configured value above is the default.

## Starting the Stack

### 1. Start infrastructure services (PostgreSQL + Dex)

```bash
pnpm docker:up
```

This starts PostgreSQL and Dex and waits for both health checks to pass.

**Infrastructure URLs:**
| Service | URL |
|---|---|
| Dex IDP | http://dex:5556/dex |
| Dex health | http://localhost:5558/healthz/ready |
| PostgreSQL | localhost:5432 |

**Startup typically completes in 15–30 seconds.**

### 2. Start the application locally

In a separate terminal:

```bash
pnpm dev
```

The app will be available at http://localhost:3000/acme-corp once started.

## Watching Logs

View Docker infrastructure logs:
```bash
docker compose -f docker/compose.yml logs -f
docker compose -f docker/compose.yml logs -f dex
docker compose -f docker/compose.yml logs -f postgres
```

Application logs appear in the `pnpm dev` terminal.

## Test Users

The following test users are pre-configured in the local Dex IDP:

| Name | Email | Password | Role |
|---|---|---|---|
| Alice Acme | `alice@acme.com` | `Acme1234!` | Employee (assigned during intake) |

These users are defined in `docker/dex/config.yaml` and cannot be changed at runtime (Dex uses in-memory storage). To add users, edit `docker/dex/config.yaml` and restart the stack.

## Running the E2E Test Suite

With the infrastructure running and the app running locally in a separate terminal:

```bash
pnpm test:e2e
```

To run in headed mode (watch the browser):
```bash
pnpm exec playwright test --headed
```

To run a specific test file:
```bash
pnpm exec playwright test tests/e2e/journey.spec.ts
```

To debug an individual test:
```bash
pnpm exec playwright test --debug tests/e2e/journey.spec.ts
```

**On test failure**, screenshots and traces are written to `test-results/`. View the HTML report:
```bash
pnpm exec playwright show-report
```

## Stopping

1. Stop the application: `Ctrl+C` in the `pnpm dev` terminal.
2. Stop the infrastructure:

```bash
pnpm docker:down
```

This stops all containers and removes the Docker volumes, leaving a clean slate for the next run.

## Troubleshooting

### OIDC discovery fails — cannot reach `http://dex:5556/dex`

Verify your `/etc/hosts` entry:
```bash
grep dex /etc/hosts
# Expected: 127.0.0.1 dex
```

Check that the Dex service is healthy:
```bash
docker compose -f docker/compose.yml ps
# dex should show "healthy"
```

### Database connection error

Check that the PostgreSQL service is healthy:
```bash
docker compose -f docker/compose.yml ps
# postgres should show "healthy"
```

Verify `DATABASE_URL` in your `.env` points to `localhost:5432` (not `postgres:5432`).

### Playwright tests fail with "Target page was closed"

The app may not be fully ready. Wait for `pnpm dev` to finish starting and confirm you can access http://localhost:3000/acme-corp in a browser before running tests.

### SESSION_SECRET error

If you see `SESSION_SECRET must be set and at least 32 characters`, generate a valid secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security Notes

- The Dex IDP and test credentials are for **local development only**. They are never used in production.
- `.env` is listed in `.gitignore` and MUST NOT be committed.
- The Dex client secret (`ACME_OIDC_CLIENT_SECRET`) should be a random string of at least 32 characters but can be any value for local testing.
- There is no TLS in the local stack. Do not expose these ports to untrusted networks.
