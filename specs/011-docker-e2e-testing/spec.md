# Feature Specification: Docker Local Environment & E2E Testing

**Feature Branch**: `011-docker-e2e-testing`
**Created**: 2026-02-23
**Status**: Draft
**Input**: User description: "add the ability for us to spin up this project locally using docker containers and test using playwright cli (use playwright skills). the local application should have the ability to have an IDP running in a docker container for testing only that allows us to test oidc, and pull user journey from sign in, to training to export. The test users can be defined in the container. the nextjs application should be deployed as if in prod. No need for host reload or dev mode. We should able to pick up issues from the logs."

## Clarifications

### Session 2026-02-23

- Q: How many tenants should the Docker local stack and E2E tests target? → A: One fixed test tenant named `acme-corp`. All services, IDP config, and Playwright tests target `acme-corp` only.
- Q: Which database should the Docker local stack use? → A: PostgreSQL — a dedicated Postgres container to match production more closely.
- Q: Which test user roles must be covered in the Playwright E2E suite? → A: Employee role only — one test user completing the full journey (sign-in → intake → training → export).
- Q: How should logs be surfaced to developers during test runs? → A: Stdout/stderr only — all services log to stdout and are readable via `docker logs`; no volume mounts or UI required.
- Q: Which OIDC claims must the test IDP emit for the app to accept the token? → A: Standard claims only (`sub`, `email`, `name`). The employee role is derived from the intake questionnaire, not from the OIDC token.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spin Up Full Local Stack (Priority: P1)

A developer wants to bring the entire application stack — including the Next.js app, a test Identity Provider (IDP), and a database — up with a single command. The environment runs in production mode, matching the real deployment as closely as possible, so issues found locally translate directly to production.

**Why this priority**: Foundation for all other stories. Nothing can be tested end-to-end without the stack running.

**Independent Test**: Running a single startup command brings all services online, responds to health checks, and the app is reachable in a browser — no other steps required.

**Acceptance Scenarios**:

1. **Given** the developer has Docker installed, **When** they run the startup command, **Then** all services (app, IDP, database) start without errors and the app is reachable at a known local URL within 3 minutes.
2. **Given** the stack is running, **When** the developer accesses the app URL, **Then** they see the application home page without any "dev mode" indicators (no hot-reload banners, no development error overlays).
3. **Given** the stack is running, **When** a service fails to start, **Then** the logs for that service are immediately accessible and contain actionable error messages.

---

### User Story 2 - OIDC Sign-In via Test IDP (Priority: P2)

A developer or QA engineer can sign in to the application using test user credentials managed entirely within the local Docker environment. The IDP handles the full OIDC flow (redirect, authentication, callback) without any external dependencies.

**Why this priority**: Sign-in is the entry point for the entire user journey. Every downstream test depends on a valid authenticated session.

**Independent Test**: A Playwright test navigates to the sign-in page, completes OIDC authentication using a pre-defined test user, and lands on the authenticated home page — no external accounts or keys needed.

**Acceptance Scenarios**:

1. **Given** the stack is running and a test user is defined in the IDP config, **When** the user navigates to the sign-in page and initiates login, **Then** they are redirected to the local IDP, can authenticate, and are redirected back to the application as an authenticated session.
2. **Given** an invalid test user credential, **When** sign-in is attempted, **Then** the IDP returns an appropriate error and the user is not granted access.
3. **Given** test user definitions in a config file, **When** the IDP container starts, **Then** all defined users are available for authentication without manual setup steps.

---

### User Story 3 - Full User Journey: Sign-In → Training → Export (Priority: P3)

An automated Playwright test suite exercises the complete user journey: authenticating as a test user, completing the training intake and workflow, and exporting the evidence/PDF output. This provides confidence that the critical path works end-to-end in a production-like environment.

**Why this priority**: Validates that all integrated components work together. Catches integration regressions that unit and integration tests miss.

**Independent Test**: The Playwright suite can be invoked against the running local stack and produces a pass/fail report covering the full journey from sign-in to export download.

**Acceptance Scenarios**:

1. **Given** the stack is running and a test user is signed in, **When** the user completes the training intake and all training modules, **Then** the system marks the session as complete and makes the evidence export available.
2. **Given** a completed training session, **When** the user triggers an export, **Then** a PDF or evidence file is produced and can be downloaded without error.
3. **Given** the Playwright suite is run, **When** any step in the journey fails, **Then** a screenshot and log snapshot are captured automatically for diagnosis.

---

### Edge Cases

**IDP not yet ready when the app connects**: Dex has a Docker Compose healthcheck that polls `http://localhost:5556/dex/.well-known/openid-configuration` every 10 seconds (up to 3 retries, 15-second start period). Dex itself depends on postgres via `condition: service_healthy`, so the startup order is postgres → dex, each gated by its own healthcheck. Running `docker compose up -d --wait` (or `pnpm docker:up`) blocks until all healthchecks pass before returning. The Next.js app is started separately (`pnpm dev`) after the stack is up, so by the time the app issues OIDC discovery requests Dex is guaranteed to be healthy. If Dex fails its healthcheck retries, Compose exits with a non-zero code and logs identify the failing service.

**OIDC token expiry mid-journey**: Dex uses its default token lifetimes — ID tokens are valid for 24 hours, access tokens for 1 hour, and refresh tokens rotate on use. A complete E2E Playwright run takes well under 10 minutes, so token expiry cannot occur during a test session. No special handling is required. If a developer leaves a session open for hours and resumes, they will be redirected to the Dex login page as a normal unauthenticated request; they can sign in again with the static test credentials (`alice@acme.com` / `Acme1234!`).

**Database schema not initialised on first boot**: Schema initialisation is handled entirely by the application layer, not by an init SQL script in the container. `PostgresAdapter.initialize()` executes `CREATE TABLE IF NOT EXISTS records ...` and `CREATE INDEX IF NOT EXISTS ...` — fully idempotent DDL — the first time `getStorage()` is called. This means the schema is created automatically on the first API request after the app starts. There is no manual migration step and no risk of a half-initialised state from a prior failed run, because `IF NOT EXISTS` makes the statements safe to re-run on every fresh container start.

**Port conflicts with existing local services**: The default host-side ports are `3000` (app), `5432` (postgres), `5556` and `5558` (dex). If any of these are already bound, `docker compose up` will fail with an `address already in use` error. To remap ports without editing `docker/compose.yml`, create a local override file (not checked in) — see the [Overriding ports](#overriding-ports) section below for the exact syntax. The app port (`3000`) is not a Compose service port but the `pnpm dev` / `next start` process; change it by setting `PORT=3001 pnpm dev` and updating the Dex `redirectURIs` in `docker/dex/config.yaml` accordingly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The local stack MUST be startable with a single command that brings up the Next.js application, the test IDP, and a PostgreSQL database.
- **FR-002**: The Next.js application MUST run in production build mode (no hot-reload, no development overlays, no source maps exposed).
- **FR-003**: The test IDP MUST implement OIDC (authorization code flow) and issue tokens containing at minimum the standard claims `sub`, `email`, and `name`. No custom role or group claims are required. Test users are configured declaratively (e.g., via a config file or environment variables).
- **FR-004**: Test users MUST be definable without modifying application code — only IDP container configuration. The initial set is one employee-role user for the `acme-corp` tenant.
- **FR-005**: The application MUST be configured to use the local IDP as its OIDC provider when running in the Docker environment, scoped to the `acme-corp` tenant.
- **FR-006**: All services (app, IDP, database) MUST emit logs to stdout/stderr so they are readable via `docker logs` without entering the container. No separate log files or UI are required.
- **FR-007**: A Playwright test suite MUST cover the full user journey: OIDC sign-in → training intake → training modules → evidence export.
- **FR-008**: Playwright tests MUST capture screenshots and log snapshots on failure for post-run diagnosis.
- **FR-009**: The stack MUST include a dependency health check so the application only starts after the IDP and database are ready. Each infrastructure service declares a Docker `HEALTHCHECK` directive (`pg_isready` for PostgreSQL; an HTTP probe of `/.well-known/openid-configuration` for Dex). Service startup order is enforced via `depends_on` with `condition: service_healthy` (Dex waits for PostgreSQL). The `pnpm docker:up` command passes `--wait` to `docker compose up`, so the command only exits once all declared healthchecks pass.
- **FR-010**: The environment MUST be destroyable with a single command, leaving no residual state on the developer's machine. The command is `pnpm docker:down` (equivalent to `docker compose -f docker/compose.yml down -v`). The `-v` flag removes named volumes (including the `postgres_data` volume), ensuring no database state persists between runs.

### Key Entities

- **Test IDP**: A containerised OpenID Connect provider used only in local/test environments. Holds user credentials and issues OIDC tokens. Has no connection to production identity systems.
- **Test User**: A single employee-role account defined in the IDP config for the `acme-corp` tenant. Used by Playwright tests to authenticate and exercise the full training journey. Additional roles are out of scope for this feature.
- **Local Stack**: The set of Docker containers (app, IDP, PostgreSQL) that collectively represent the running application in a production-like configuration.
- **E2E Test Suite**: The Playwright tests that automate and validate the full user journey against the local stack.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no prior setup can bring the full local stack online with a single command in under 3 minutes on a standard development machine (warm start; first-run image pulls measured separately).
- **SC-002**: 100% of the critical user journey steps (sign-in, intake, training, export) are covered by at least one automated Playwright test scenario.
- **SC-003**: All Playwright tests pass against the local stack without any manual intervention or external dependencies.
- **SC-004**: When a test fails, a screenshot and log excerpt are available within 30 seconds of test completion, without requiring the developer to re-run or inspect containers manually.
- **SC-005**: The local stack produces no warnings or errors in logs during a clean successful run of the full user journey.
- **SC-006**: The environment can be torn down completely and restarted fresh without leftover data affecting subsequent test runs.

## Assumptions

- The project already has a working OIDC integration; this feature wraps it in a local-only IDP rather than changing the auth logic.
- The app requires only standard OIDC claims (`sub`, `email`, `name`). Employee role assignment occurs during the training intake questionnaire, not at sign-in time.
- The Docker stack targets a single tenant named `acme-corp`. Multi-tenant isolation testing is out of scope for this feature.
- A lightweight open-source OIDC-capable IDP (e.g., Dex, Keycloak, or mock-oauth2-server) is acceptable for local testing.
- The Docker stack uses PostgreSQL as the database, matching the production storage adapter. No separate test schema is required; the schema is initialised on first container start.
- Developers are expected to have Docker and Docker Compose installed; the feature does not provision Docker itself.
- The Playwright test suite is a new addition to the project, running against the local stack only (not CI/production).
- Port assignments for local services (app, IDP, DB) will follow defaults; see [Ports / Configuration](#ports--configuration) below. Conflicts are the developer's responsibility to resolve.

## Ports / Configuration

The canonical source for port bindings is `docker/compose.yml`. The table below documents the default host-side ports that Compose exposes; the container-internal ports are identical.

| Service    | Container name | Default host port | Purpose                              |
|------------|----------------|-------------------|--------------------------------------|
| `app`      | `jem-app`      | `3000`            | Next.js application (production build) |
| `postgres` | `jem-postgres` | `5432`            | PostgreSQL database                  |
| `dex`      | `jem-dex`      | `5556`            | Dex OIDC server (must be browser-reachable; add `127.0.0.1 dex` to `/etc/hosts`) |
| `dex`      | `jem-dex`      | `5558`            | Dex health and metrics endpoint      |

The Next.js application **is** a Compose service — it runs as a containerised production build (`next build && next start`) and is started alongside the IDP and database by the single startup command.

### Overriding ports

Compose reads the standard environment variables listed in `.env.example`. To change a port, set the corresponding variable before starting the stack:

| Variable          | Controls                    | Default value |
|-------------------|-----------------------------|---------------|
| `POSTGRES_USER`   | PostgreSQL username          | `postgres`    |
| `POSTGRES_PASSWORD` | PostgreSQL password        | `postgres`    |
| `POSTGRES_DB`     | PostgreSQL database name     | `jem_attest`  |

Port numbers themselves are hardcoded in `docker/compose.yml`. To remap them without editing the file, use a Compose override file:

```yaml
# docker/compose.override.yml — not checked in; create locally as needed
services:
  postgres:
    ports:
      - "5433:5432"   # Use host port 5433 if 5432 is already taken
  dex:
    ports:
      - "5557:5556"
      - "5559:5558"
```

Run `docker compose -f docker/compose.yml -f docker/compose.override.yml up -d --wait` to apply the override.
