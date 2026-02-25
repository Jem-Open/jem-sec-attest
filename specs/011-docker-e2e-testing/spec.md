# Feature Specification: Docker Local Environment & E2E Testing

**Feature Branch**: `011-docker-e2e-testing`
**Created**: 2026-02-23
**Status**: Draft
**Input**: User description: "add the ability for us to spin up this project locally using docker containers and test using playwright cli (use playwright skills). the local application should have the ability to have an IDP running in a docker container for testing only that allows us to test oidc, and pull user journey from sign in, to training to export. The test users can be defined in the container. the nextjs application should be deployed as if in prod. No need for host reload or dev mode. We should able to pick up issues from the logs."

## Clarifications

### Session 2026-02-23

- Q: How many tenants should the Docker local stack and E2E tests target? → A: One fixed test tenant named `acme`. All services, IDP config, and Playwright tests target `acme` only.
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

1. **Given** the developer has Docker installed, **When** they run the startup command, **Then** all services (app, IDP, database) start without errors and the app is reachable at a known local URL within 2 minutes.
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

- What happens when the IDP container is not yet ready when the app starts up?
- How does the system behave if the test user's OIDC token expires mid-journey?
- What happens if the database container fails to initialise its schema on first boot?
- How are port conflicts handled if a developer already has something running on the default ports?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The local stack MUST be startable with a single command that brings up the Next.js application, the test IDP, and a PostgreSQL database.
- **FR-002**: The Next.js application MUST run in production build mode (no hot-reload, no development overlays, no source maps exposed).
- **FR-003**: The test IDP MUST implement OIDC (authorization code flow) and issue tokens containing at minimum the standard claims `sub`, `email`, and `name`. No custom role or group claims are required. Test users are configured declaratively (e.g., via a config file or environment variables).
- **FR-004**: Test users MUST be definable without modifying application code — only IDP container configuration. The initial set is one employee-role user for the `acme` tenant.
- **FR-005**: The application MUST be configured to use the local IDP as its OIDC provider when running in the Docker environment, scoped to the `acme` tenant.
- **FR-006**: All services (app, IDP, database) MUST emit logs to stdout/stderr so they are readable via `docker logs` without entering the container. No separate log files or UI are required.
- **FR-007**: A Playwright test suite MUST cover the full user journey: OIDC sign-in → training intake → training modules → evidence export.
- **FR-008**: Playwright tests MUST capture screenshots and log snapshots on failure for post-run diagnosis.
- **FR-009**: The stack MUST include a dependency health check so the application only starts after the IDP and database are ready.
- **FR-010**: The environment MUST be destroyable with a single command, leaving no residual state on the developer's machine.

### Key Entities

- **Test IDP**: A containerised OpenID Connect provider used only in local/test environments. Holds user credentials and issues OIDC tokens. Has no connection to production identity systems.
- **Test User**: A single employee-role account defined in the IDP config for the `acme` tenant. Used by Playwright tests to authenticate and exercise the full training journey. Additional roles are out of scope for this feature.
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
- The Docker stack targets a single tenant named `acme`. Multi-tenant isolation testing is out of scope for this feature.
- A lightweight open-source OIDC-capable IDP (e.g., Dex, Keycloak, or mock-oauth2-server) is acceptable for local testing.
- The Docker stack uses PostgreSQL as the database, matching the production storage adapter. No separate test schema is required; the schema is initialised on first container start.
- Developers are expected to have Docker and Docker Compose installed; the feature does not provision Docker itself.
- The Playwright test suite is a new addition to the project, running against the local stack only (not CI/production).
- Port assignments for local services (app, IDP, DB) will follow defaults; see [Ports / Configuration](#ports--configuration) below. Conflicts are the developer's responsibility to resolve.

## Ports / Configuration

The canonical source for port bindings is `docker/compose.yml`. The table below documents the default host-side ports that Compose exposes; the container-internal ports are identical.

| Service    | Container name | Default host port | Purpose                              |
|------------|----------------|-------------------|--------------------------------------|
| `postgres` | `jem-postgres` | `5432`            | PostgreSQL database                  |
| `dex`      | `jem-dex`      | `5556`            | Dex OIDC server (must be browser-reachable; add `127.0.0.1 dex` to `/etc/hosts`) |
| `dex`      | `jem-dex`      | `5558`            | Dex health and metrics endpoint      |

The Next.js application is **not** a Compose service — it runs on the developer's host via `pnpm dev` (default port `3000`) or `pnpm build && pnpm start`.

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
