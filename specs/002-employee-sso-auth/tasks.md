# Tasks: Employee SSO Authentication

**Input**: Design documents from `/specs/002-employee-sso-auth/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/auth-api.yaml, quickstart.md

**Tests**: Not explicitly requested in spec. Tests are NOT included in task phases. Add via separate task if desired.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Next.js App Router**: `app/` at repository root
- **Shared libraries**: `src/` at repository root (existing pattern)
- **Tests**: `tests/` at repository root (existing pattern)
- **Config examples**: `config/examples/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize Next.js 16 project structure and install new dependencies

- [x] T001 Initialize Next.js 16.x with App Router by installing `next`, `react`, `react-dom`, and `ai` (Vercel AI SDK) as production dependencies; create `next.config.ts` with TypeScript strict mode and App Router enabled
- [x] T002 Install auth dependencies: `openid-client` v6.x and `iron-session` v8.x as production dependencies in package.json
- [x] T003 Evaluate Zod v3→v4 migration for existing schemas in src/config/schema.ts; if breaking changes are minimal, upgrade `zod` to v4.x and migrate existing schemas; if non-trivial, document findings and retain v3 for this feature
- [x] T004 [P] Update `tsconfig.json` to include `app/` directory in compilation paths and configure Next.js-compatible module resolution (JSX, path aliases)
- [x] T005 [P] Create Next.js root layout in app/layout.tsx with HTML boilerplate, metadata, and body wrapper (no styling framework yet)
- [x] T006 [P] Add `SESSION_SECRET` to `.env.example` with documentation comment; add `.env.local` to `.gitignore` if not already present

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Extend tenant config schema by adding `OIDCConfigSchema` and `AuthSessionConfigSchema` to src/config/schema.ts; nest under `settings.auth.oidc` and `settings.auth` in `TenantSettingsSchema`; validate `clientSecret` matches `${ENV_VAR}` pattern; require `scopes` to include `"openid"`; add `sessionTtlSeconds` with default 3600 (FR-002, FR-008, FR-013, FR-015)
- [x] T008 Update `TenantSettings` interface in src/tenant/types.ts to include `auth?: { oidc?: OIDCTenantConfig; sessionTtlSeconds?: number }` matching the new schema fields
- [x] T009 Define `AuthAdapter` interface in src/auth/adapters/auth-adapter.ts with methods: `initiateSignIn(request, tenant)`, `handleCallback(request, tenant)`, `signOut(request, tenant)`; define `AuthResult` and `EmployeeClaims` types for return values (Principle V — pluggable for future SAML)
- [x] T010 [P] Define Employee entity types in src/auth/types.ts: `Employee` interface (id, tenantId, idpSubject, email, displayName, firstSignInAt, lastSignInAt), `EmployeeSession` interface (sessionId, tenantId, employeeId, email, displayName, idpIssuer, createdAt, expiresAt), `AuthAuditEvent` interface (id, eventType, tenantId, employeeId, timestamp, ipAddress, userAgent, metadata), `AuthEventType` union type
- [x] T011 [P] Implement employee storage operations in src/auth/employee-repository.ts: `upsertFromClaims(tenantId, claims)` for JIT provisioning (creates on first sign-in, updates on subsequent); `findByIdpSubject(tenantId, idpSubject)`; use existing storage adapter; create employees table with `(tenantId, idpSubject)` unique index (FR-014)
- [x] T012 [P] Implement audit event logger in src/auth/audit.ts: `logAuthEvent(event)` function that writes to storage adapter asynchronously using Next.js `after()` API; define typed event constructors for each event type (sign-in, sign-out, auth-failure, auth-config-error); create audit_events table with indexes on `(tenantId, eventType, timestamp)` and `(tenantId, employeeId, timestamp)` (FR-006, FR-007)
- [x] T013 Implement session manager in src/auth/session/session-manager.ts: `createSession(data)`, `getSession()`, `destroySession()`; use `iron-session` with `SESSION_SECRET` env var; encrypt session payload containing `EmployeeSession` fields; validate `expiresAt` on read; configure httpOnly, secure, sameSite cookie flags (FR-005, FR-015)
- [x] T014 Implement Next.js middleware in app/middleware.ts: read session via session manager; if no valid session, redirect to `/{tenant}/auth/signin`; if session expired, destroy and redirect; extract tenant from hostname using existing `TenantResolverImpl`; validate session `tenantId` matches resolved tenant; pass tenant context via request headers; exclude `/api/auth/*`, `/_next/*`, and `/[tenant]/auth/*` from protection

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Employee Signs In via Tenant SSO (Priority: P1)

**Goal**: Complete OIDC sign-in flow: tenant-branded page → IdP redirect → callback → JIT provisioning → session creation → dashboard

**Independent Test**: Configure a single tenant with OIDC settings, navigate to tenant hostname, complete IdP sign-in, verify employee lands on tenant dashboard with valid session and audit event recorded.

### Implementation for User Story 1

- [x] T015 [US1] Implement `OIDCAdapter` in src/auth/adapters/oidc-adapter.ts: `initiateSignIn` — resolve tenant OIDC config, discover issuer via `openid-client`, generate PKCE code_verifier/challenge and state, store in temporary iron-session, build authorization URL with scopes, return redirect response; cache discovered `Issuer` objects per tenant (FR-001, FR-003, FR-009)
- [x] T016 [US1] Implement `OIDCAdapter.handleCallback` in src/auth/adapters/oidc-adapter.ts: validate state parameter against stored session state; if IdP error parameter present, return failure; exchange authorization code for tokens with PKCE verifier; validate id_token signature and claims (issuer, audience, expiry) via openid-client; extract sub, email, name claims; return `EmployeeClaims` (FR-004, FR-009, FR-010)
- [x] T017 [US1] Create sign-in initiation route handler in app/api/auth/[tenant]/signin/route.ts: resolve tenant from path param using TenantResolverImpl; validate OIDC config exists; call `OIDCAdapter.initiateSignIn`; return redirect to IdP; on config error, log `auth-config-error` audit event and redirect to error page
- [x] T018 [US1] Create OIDC callback route handler in app/api/auth/[tenant]/callback/route.ts: resolve tenant; call `OIDCAdapter.handleCallback`; on success: call `employeeRepository.upsertFromClaims` for JIT provisioning, create session via session manager with tenant-configurable TTL, log `sign-in` audit event, redirect to `/{tenant}/dashboard`; on failure: log `auth-failure` audit event with categorized reason, redirect to `/{tenant}/auth/error`
- [x] T019 [US1] Create tenant-branded sign-in page in app/[tenant]/auth/signin/page.tsx: server component that resolves tenant from params, loads branding (displayName, logoUrl, primaryColor) from tenant config; render organization name, logo (if configured), and "Sign in with SSO" button linking to `/api/auth/{tenant}/signin`; meet WCAG 2.1 AA (keyboard nav, screen reader labels, no color-only information) (FR-017)
- [x] T020 [US1] Create placeholder dashboard page in app/[tenant]/dashboard/page.tsx: server component that reads session, displays "Welcome, {displayName}" and tenant name; include "Sign Out" button/link (used by US4); this is a minimal placeholder for post-auth landing
- [x] T021 [US1] Create example tenant OIDC config in config/examples/tenants/acme-corp.yaml: complete YAML file with name, hostnames, emailDomains, branding settings, auth.oidc section (issuerUrl, clientId, clientSecret with `${ACME_OIDC_CLIENT_SECRET}`, redirectUri, scopes including openid/profile/email, logoutUrl), and auth.sessionTtlSeconds
- [x] T022 [US1] Create auth module public API in src/auth/index.ts: re-export AuthAdapter, OIDCAdapter, SessionManager, EmployeeRepository, logAuthEvent, and all types from src/auth/types.ts

**Checkpoint**: At this point, User Story 1 should be fully functional — an employee can sign in to their tenant via OIDC and land on the dashboard

---

## Phase 4: User Story 2 — Tenant Isolation Prevents Cross-Tenant Access (Priority: P2)

**Goal**: Ensure authenticated employees cannot access other tenants' resources; sessions reject hostname mismatches; unresolvable tenants return generic errors

**Independent Test**: Authenticate as Tenant A employee, attempt requests on Tenant B hostname with same session cookie, verify all are rejected with generic 404/403 and audit events logged.

### Implementation for User Story 2

- [x] T023 [US2] Enhance middleware tenant-session validation in app/middleware.ts: when session `tenantId` does not match the tenant resolved from the request hostname, destroy the session cookie and redirect to sign-in; ensure the redirect URL is for the current hostname's tenant, not the session's tenant; return generic 404 for requests to unresolvable hostnames (no tenant existence leakage)
- [x] T024 [US2] Add tenant-mismatch handling to callback route in app/api/auth/[tenant]/callback/route.ts: after extracting IdP claims, verify the employee's email domain against the resolved tenant's configured emailDomains (if strict matching is desired); if IdP returns claims for a domain not matching the tenant, log `auth-failure` with reason `tenant-mismatch` and redirect to error page with generic message
- [x] T025 [US2] Ensure all route handlers in app/api/auth/[tenant]/ validate that the `[tenant]` path parameter resolves to a valid tenant via TenantResolverImpl; return generic 404 (not "tenant not found") for invalid slugs to prevent tenant enumeration

**Checkpoint**: Tenant isolation verified — sessions are tenant-scoped, cross-tenant access returns generic errors

---

## Phase 5: User Story 3 — Authentication Failure Handling (Priority: P3)

**Goal**: Handle all auth failure modes gracefully with user-friendly messages and categorized audit events

**Independent Test**: Simulate each failure mode (IdP error, state mismatch, missing claims, config error, token exchange failure), verify user sees appropriate message and audit event is recorded with correct reason.

### Implementation for User Story 3

- [x] T026 [US3] Create auth error page in app/[tenant]/auth/error/page.tsx: server component that reads error code from search params; map error codes to user-friendly messages (e.g., `signin_cancelled` → "Sign-in was not completed.", `invalid_request` → "Something went wrong.", `missing_config` → "Single sign-on is not configured for your organization."); never display raw error details; include "Try Again" link back to sign-in page; meet WCAG 2.1 AA (FR-011)
- [x] T027 [US3] Add comprehensive error handling to OIDCAdapter.handleCallback in src/auth/adapters/oidc-adapter.ts: catch and categorize all failure modes — IdP error parameter (`idp-error`), state mismatch (`state-mismatch`), token exchange failure (`token-exchange-failed`), missing required claims (`missing-required-claims`); return structured error result with reason code (never raw error details)
- [x] T028 [US3] Add OIDC config validation error handling to sign-in route in app/api/auth/[tenant]/signin/route.ts: when tenant exists but OIDC config is missing or invalid, log `auth-config-error` audit event with reason (`missing-oidc-config` or `invalid-oidc-config`), redirect to error page with `missing_config` code; ensure other tenants continue functioning (FR-008)
- [x] T029 [US3] Update callback route in app/api/auth/[tenant]/callback/route.ts to map all OIDCAdapter error results to appropriate error page redirects and audit events; ensure every failure path logs an audit event with categorized reason before redirecting (FR-006)

**Checkpoint**: All authentication failure modes handled gracefully — user sees friendly messages, audit log captures categorized reasons

---

## Phase 6: User Story 4 — Employee Signs Out (Priority: P4)

**Goal**: Complete sign-out flow: destroy session, record audit event, optionally redirect to IdP logout

**Independent Test**: Sign in, click sign-out, verify session destroyed (subsequent requests redirect to sign-in), audit event recorded, and optional IdP logout triggered.

### Implementation for User Story 4

- [x] T030 [US4] Create sign-out route handler in app/api/auth/[tenant]/signout/route.ts: read current session to extract employee info for audit; destroy session via session manager; log `sign-out` audit event with tenant ID, employee ID, and IdP issuer; check tenant OIDC config for `logoutUrl`; if present, redirect to IdP logout endpoint; otherwise redirect to sign-out confirmation page (FR-012)
- [x] T031 [US4] Create sign-out confirmation page in app/[tenant]/auth/signout-confirm/page.tsx: static page confirming "You have been signed out." with link to sign back in; meet WCAG 2.1 AA
- [x] T032 [US4] Wire "Sign Out" action from dashboard page (app/[tenant]/dashboard/page.tsx) to POST `/api/auth/{tenant}/signout` using a form submission or client-side navigation

**Checkpoint**: Full authentication lifecycle complete — sign-in, session validation, sign-out all functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, examples, and final validation

- [x] T033 [P] Generate and publish JSON Schema for the OIDC tenant configuration by extending the existing `generate:schema` script in scripts/generate-schema.ts to include `OIDCConfigSchema` and `AuthSessionConfigSchema` output (Constitution I — published schemas)
- [x] T034 [P] Add Apache 2.0 license headers to all new source files in src/auth/, app/, and tests/ per Constitution Licensing Requirements
- [x] T035 Validate quickstart.md end-to-end: follow the steps in specs/002-employee-sso-auth/quickstart.md using the example config; verify sign-in, sign-out, and audit events work as documented; fix any discrepancies between docs and implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase completion
  - US1 (Phase 3): Can start after Phase 2
  - US2 (Phase 4): Can start after Phase 2 (enhances middleware from Phase 2, but independent test scope)
  - US3 (Phase 5): Depends on US1 (builds error handling on top of callback route)
  - US4 (Phase 6): Depends on US1 (needs sign-in to exist before sign-out)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```text
Phase 1 (Setup)
  └──▶ Phase 2 (Foundational)
         ├──▶ Phase 3 (US1: Sign-In) ──▶ Phase 5 (US3: Error Handling)
         │                             ──▶ Phase 6 (US4: Sign-Out)
         └──▶ Phase 4 (US2: Isolation)
                                        ──▶ Phase 7 (Polish)
```

### Within Each User Story

- Models/types before services
- Services/adapters before route handlers
- Route handlers before pages
- Core implementation before integration

### Parallel Opportunities

- T004, T005, T006 (Setup phase) — different files, no dependencies
- T010, T011, T012 (Foundational phase) — types, employee repo, audit logger are independent
- T033, T034 (Polish phase) — schema generation and license headers are independent
- US2 (Phase 4) can run in parallel with US1 if desired (both depend only on Phase 2)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test full sign-in flow with a real or mock IdP
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Sign-In) → Test independently → Deploy/Demo (**MVP**)
3. US2 (Isolation) → Test independently → Deploy/Demo
4. US3 (Error Handling) → Test independently → Deploy/Demo
5. US4 (Sign-Out) → Test independently → Deploy/Demo
6. Polish → Final validation → Release

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Rate limiting is deferred to a future release (R4 in research.md)
- Zod v3→v4 migration evaluated in T003 — may be retained at v3 if migration is complex
- All new files must include Apache 2.0 license headers (T034)
