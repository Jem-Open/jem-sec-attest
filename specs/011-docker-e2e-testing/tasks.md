# Tasks: Docker Local Environment & E2E Testing

**Input**: Design documents from `/specs/011-docker-e2e-testing/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: E2E tests are central to this feature. Auth setup and journey tests are implementation tasks (not test-first), as they require a running Docker stack.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Housekeeping and environment files needed before any implementation begins. No external dependencies.

- [x] T001 Update `.gitignore` — add `tests/e2e/.auth/` and `.env.docker` entries
- [x] T002 [P] Create `.env.docker.example` with all Docker-specific env vars: `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SESSION_SECRET`, `ACME_OIDC_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `ACME_WEBHOOK_SECRET` (see plan.md Step 8 for full content)
- [x] T003 [P] Update `.env.example` — add `ACME_OIDC_ISSUER_URL`, `ACME_OIDC_CLIENT_ID`, `ACME_OIDC_CLIENT_SECRET`, `ACME_OIDC_REDIRECT_URI` documentation under the existing database section

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Production build configuration and Docker health check — required before the Docker image can be built or the stack started.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Modify `next.config.ts` — add `output: "standalone"` to the config object and add `"postgres"` to `serverExternalPackages` alongside `"better-sqlite3"`
- [x] T005 [P] Create `app/api/health/route.ts` — Apache 2.0 header, `export const dynamic = "force-dynamic"`, `GET` handler returning `{ status: "healthy", timestamp: new Date().toISOString(), uptime: process.uptime() }` with HTTP 200; catch-all returns `{ status: "unhealthy", error }` with HTTP 503 (see contracts/health.openapi.yaml)
- [x] T006 [P] Create `.dockerignore` — exclude: `.git`, `node_modules`, `.next`, `coverage`, `test-results`, `dist`, `.env*`, `*.md`, `specs/`, `.specify/`, `tests/`, `.claude/`, `.agents/`
- [x] T007 Create `Dockerfile` — two-stage build: stage 1 `node:20-alpine AS builder` (install pnpm, `pnpm install --frozen-lockfile`, `pnpm build`, copy `public/` and `.next/static/` into `.next/standalone/`); stage 2 `node:20-alpine AS runner` (install `curl`, create group `nodejs` and user `nextjs` with UID 1001 in that group, copy `.next/standalone/`, set `NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0`, `USER nextjs`, `EXPOSE 3000`, `HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD curl -f http://localhost:3000/api/health || exit 1`, `CMD ["node", "server.js"]`)

**Checkpoint**: Run `docker build -t jem-app-test .` from repo root — image must build successfully.

---

## Phase 3: User Story 1 — Spin Up Full Local Stack (Priority: P1) 🎯 MVP

**Goal**: A single command starts all services (app, Dex IDP, PostgreSQL), all health checks pass, the app is reachable at `http://localhost:3000`, and logs are accessible via `docker compose logs`.

**Independent Test**: Run `pnpm docker:up` → verify `docker compose -f docker/compose.yml ps` shows all three services as `healthy`.

- [x] T008 [P] [US1] Create `docker/dex/config.yaml` — Dex IDP config: `issuer: http://dex:5556/dex`, `storage: { type: memory }`, `web: { http: 0.0.0.0:5556 }`, `enablePasswordDB: true`, `oauth2: { skipApprovalScreen: true }`, `staticClients` entry with `id: jem-app`, secret matching `.env.docker.example` default, `redirectURIs: ["http://localhost:3000/api/auth/acme-corp/callback"]`, `name: "JEM Attestation (local)"`, `staticPasswords` entry for `alice@acme.com` / `alice` / `acme-test-001` (bcrypt hash of `Acme1234!` — use `node -e "require('bcryptjs').hash('Acme1234!', 10, (_,h)=>console.log(h))"` or a pre-generated hash; document generation command in a comment)
- [x] T009 [P] [US1] Modify `config/tenants/acme-corp.yaml` — add `settings.auth.oidc` block: `issuerUrl: "${ACME_OIDC_ISSUER_URL}"`, `clientId: "${ACME_OIDC_CLIENT_ID}"`, `clientSecret: "${ACME_OIDC_CLIENT_SECRET}"`, `redirectUri: "${ACME_OIDC_REDIRECT_URI}"`, `scopes: [openid, profile, email]`
- [x] T010 [US1] Create `docker/compose.yml` — **Note: the actual implementation intentionally diverges from this original description in three ways: (1) there is no `app` service — Next.js runs locally via `pnpm dev` rather than as a containerised service; (2) the Dex image used is `dexidp/dex:v2.41.1` (not `v2.37.0`); (3) the Dex healthcheck uses `wget` against the OIDC discovery endpoint (`http://localhost:5556/dex/.well-known/openid-configuration`) rather than `curl http://localhost:5558/healthz/ready`.** Two services: `postgres` (`postgres:16-alpine`, env vars from `.env.docker`, healthcheck `pg_isready -U postgres -d jem_attest` every 10s/5 retries/30s start, network `jem_local`); `dex` (`dexidp/dex:v2.41.1`, ports `5556:5556` and `5558:5558`, volume mount `./dex/config.yaml:/etc/dex/config.yaml:ro`, command `dex serve /etc/dex/config.yaml`, healthcheck `wget -qO- http://localhost:5556/dex/.well-known/openid-configuration` every 10s/3 retries/15s start, depends_on postgres healthy, network `jem_local`); volumes `postgres_data`; networks `jem_local: driver: bridge`
- [x] T011 [US1] Update `package.json` `scripts` — add `"docker:up": "docker compose -f docker/compose.yml up --build -d"` and `"docker:down": "docker compose -f docker/compose.yml down -v"`

**Checkpoint**: `pnpm docker:up` completes without error. `docker compose -f docker/compose.yml ps` shows all three services `(healthy)`. App responds at `http://localhost:3000/api/health`. `pnpm docker:down` cleanly removes all containers and volumes.

---

## Phase 4: User Story 2 — OIDC Sign-In via Test IDP (Priority: P2)

**Goal**: A Playwright test authenticates as `alice@acme.com` via the local Dex IDP, completes the full OIDC authorization code flow, and lands on an authenticated page. Auth state is persisted for subsequent tests.

**Independent Test**: Run `pnpm test:e2e --grep "sign-in"` against the running stack — the auth setup completes, `tests/e2e/.auth/user.json` is written, and the first journey test (checking authenticated session) passes.

- [x] T012 [US2] Install `@playwright/test` dev dependency — run `pnpm add -D @playwright/test` then `pnpm exec playwright install chromium` (document the chromium install step in quickstart.md if not already present; do NOT commit the browser binaries)
- [x] T013 [P] [US2] Create `playwright.config.ts` at repo root — Apache 2.0 header, `testDir: "./tests/e2e"`, `fullyParallel: false`, `retries: 0`, `reporter: "html"`, `globalSetup: "./tests/e2e/auth.setup.ts"`, `use: { baseURL: "http://localhost:3000", screenshot: "only-on-failure", trace: "on-first-retry", video: "retain-on-failure" }`, `outputDir: "test-results"`, single project `chromium` using `devices["Desktop Chrome"]`
- [x] T014 [P] [US2] Create `tests/e2e/tsconfig.json` — extends root `../../tsconfig.json`, `compilerOptions: { outDir: "../../dist/e2e" }`, `include: ["**/*.ts"]`
- [x] T015 [US2] Create `tests/e2e/auth.setup.ts` — Apache 2.0 header; imports `chromium` from `@playwright/test`; launches browser context; navigates to `http://localhost:3000/api/auth/acme-corp/signin`; waits for URL matching `/dex:5556/` (Dex login page); fills `input[name="login"]` or `input[type="email"]` with `alice@acme.com`; fills `input[type="password"]` with `Acme1234!`; clicks submit button; waits for URL to return to `http://localhost:3000`; saves `storageState` to `tests/e2e/.auth/user.json`; closes browser; exports default async function
- [x] T016 [P] [US2] Create `tests/e2e/fixtures/auth.ts` — Apache 2.0 header; extends `test` from `@playwright/test` with `storageState: "tests/e2e/.auth/user.json"` applied to `page` fixture; re-exports `expect`
- [x] T017 [US2] Update `package.json` `scripts` — add `"test:e2e": "playwright test"`

**Checkpoint**: Stack running + `pnpm test:e2e --grep "sign-in"` — auth setup writes `tests/e2e/.auth/user.json` without error. Authenticated fixture loads the session correctly.

---

## Phase 5: User Story 3 — Full User Journey: Sign-In → Training → Export (Priority: P3)

**Goal**: An automated Playwright test suite covers the complete user journey for `alice@acme.com` on the `acme-corp` tenant: authenticated session confirmed → training intake completed → training modules answered → evidence export downloaded.

**Independent Test**: `pnpm test:e2e` against the running stack — all journey spec tests pass and `test-results/` contains no failure artifacts.

- [x] T018 [US3] Create `tests/e2e/journey.spec.ts` using the `playwright-cli` skill — Apache 2.0 header; import `test`, `expect` from `../fixtures/auth`; four tests in `describe("acme-corp full user journey")`:
  1. **"authenticated session is active after sign-in"** — navigate to `/acme-corp`, assert not redirected to sign-in, assert authenticated UI element visible
  2. **"training intake — completes role profile generation"** — navigate to `/acme-corp/intake` or `/api/intake/acme-corp/profile`, fill intake form (job description textarea), submit, wait for generated role profile, confirm profile and advance
  3. **"training modules — completes all modules and reaches completed state"** — navigate to training session start, loop through module content/quiz/scenario interactions, answer each question, submit, wait for next module or completion state, assert session status is `completed`
  4. **"evidence export — produces downloadable PDF"** — navigate to export page, trigger export button, assert download event or response `Content-Type: application/pdf`, assert no error state visible

**Checkpoint**: `pnpm test:e2e` with the stack running — all 4 journey tests pass. Any failure produces a screenshot in `test-results/`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, formatting, and documentation completeness across all deliverables.

- [x] T019 [P] Run `pnpm type-check` — fix any TypeScript errors introduced in `app/api/health/route.ts`, `playwright.config.ts`, `tests/e2e/auth.setup.ts`, `tests/e2e/fixtures/auth.ts`, `tests/e2e/journey.spec.ts`
- [x] T020 [P] Run `pnpm lint` (`biome check .`) and `pnpm lint:fix` — fix any Biome formatting violations in all new and modified files; pay attention to import ordering and quote style
- [x] T021 [P] Run existing test suite `pnpm test` — confirm no regressions from `next.config.ts` or `acme-corp.yaml` changes
- [ ] T022 Run full end-to-end validation per `specs/011-docker-e2e-testing/quickstart.md` — perform the one-time `/etc/hosts` setup if not done, `pnpm docker:up`, wait for healthy, `pnpm test:e2e`, confirm all pass, `pnpm docker:down`, confirm clean teardown

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 (Dockerfile needs health route + standalone config)
- **US2 (Phase 4)**: Depends on Phase 3 (Playwright tests need a running stack to validate against; `auth.setup.ts` calls the live app)
- **US3 (Phase 5)**: Depends on Phase 4 (journey tests build on authenticated session from US2)
- **Polish (Phase 6)**: Depends on all story phases complete

### User Story Dependencies

- **US1 (P1)**: Stack infrastructure — foundation for everything
- **US2 (P2)**: Depends on US1 (stack must be running to validate OIDC sign-in)
- **US3 (P3)**: Depends on US2 (uses authenticated session established in US2 auth setup)

### Within Each Phase — Parallel Opportunities

**Phase 1**: T002 and T003 can run in parallel (different files)

**Phase 2**: T005 and T006 can run in parallel (different files); T007 must follow T004 (needs `output: standalone` set before Dockerfile is finalized)

**Phase 3**: T008 and T009 can run in parallel (different files); T010 depends on both; T011 can run in parallel with T010

**Phase 4**: T013, T014, T016 can run in parallel (different files); T015 depends on T013; T017 can run any time

**Phase 6**: T019, T020, T021 can all run in parallel

---

## Parallel Execution Examples

### Phase 3 — User Story 1

```bash
# These two can be launched simultaneously:
Task T008: Create docker/dex/config.yaml
Task T009: Modify config/tenants/acme-corp.yaml

# Once both complete:
Task T010: Create docker/compose.yml
Task T011: Update package.json scripts (can overlap with T010)
```

### Phase 4 — User Story 2

```bash
# These three can be launched simultaneously:
Task T013: Create playwright.config.ts
Task T014: Create tests/e2e/tsconfig.json
Task T016: Create tests/e2e/fixtures/auth.ts

# Once T013 completes:
Task T015: Create tests/e2e/auth.setup.ts
```

### Phase 6 — Polish

```bash
# All three can be launched simultaneously:
Task T019: pnpm type-check
Task T020: pnpm lint
Task T021: pnpm test
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T007)
3. Complete Phase 3: User Story 1 (T008–T011)
4. **STOP and VALIDATE**: `pnpm docker:up` → all services healthy, app reachable, logs visible
5. Stack is now deployable locally — US2 and US3 can follow

### Incremental Delivery

1. Setup + Foundational → Docker image builds successfully
2. Add US1 → Stack starts → validate manually → **MVP: local production stack running**
3. Add US2 → OIDC sign-in works via Playwright → `auth.setup.ts` saves session state
4. Add US3 → Full journey test passes end-to-end → **Final: full E2E coverage**

---

## Notes

- **`/etc/hosts` prerequisite**: Before running the stack, `127.0.0.1 dex` must be in the host's `/etc/hosts`. See `quickstart.md`.
- **bcrypt hash for T008**: Use `node -e "const b=require('bcryptjs'); b.hash('Acme1234!',10,(_,h)=>console.log(h))"` — requires `bcryptjs` (`pnpm add -D bcryptjs` temporarily, or use an online bcrypt generator)
- **Playwright CLI**: T018 uses the `playwright-cli` skill for accurate selector patterns against the actual app UI
- **Apache 2.0 headers**: All new `.ts` files require the license header (see CLAUDE.md)
- **Biome formatting**: Run `npx biome check --write <file>` after creating each TypeScript file
- **`[P]` tasks** = different files, no incomplete task dependencies — safe to run concurrently
- Stop at each **Checkpoint** to validate the story independently before advancing
