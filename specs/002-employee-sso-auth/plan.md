# Implementation Plan: Employee SSO Authentication

**Branch**: `002-employee-sso-auth` | **Date**: 2026-02-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-employee-sso-auth/spec.md`

## Summary

Implement OIDC-based employee authentication for the multi-tenant platform. Each tenant configures its own IdP parameters via YAML/JSON config files. The system resolves the tenant (hostname > email domain), displays a branded sign-in page, executes the OIDC Authorization Code flow with PKCE, provisions employee records via JIT, creates encrypted sessions (1-hour default TTL), and records immutable audit events for all auth lifecycle events.

Technical approach: `openid-client` v6 for dynamic per-tenant OIDC, `iron-session` for encrypted stateless cookies, Next.js App Router for route handlers and middleware, existing `better-sqlite3` adapter for employee/audit persistence.

Rate limiting is deferred to a future release.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20+
**Primary Dependencies**: Next.js 16.x (App Router), React 19.x, `openid-client` v6.x, `iron-session` v8.x, `ai` v6.x (Vercel AI SDK), existing: `zod` v4.x, `yaml` v2.x, `better-sqlite3` v12.x, `safe-stable-stringify`, `dotenv`
**Storage**: better-sqlite3 (existing adapter) for employees, audit events; iron-session encrypted cookies for sessions
**Testing**: Vitest 4.x, `oidc-provider` for mock IdP in integration tests
**Target Platform**: Node.js 20+ server (self-hosted), Next.js App Router
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: <5s system processing for full sign-in flow (SC-001); audit events within 1s (SC-002)
**Constraints**: Edge Runtime middleware must not use better-sqlite3; no Redis dependency
**Scale/Scope**: Multi-tenant, unlimited concurrent sessions per employee

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Configuration-as-Code Only | PASS | OIDC settings per-tenant in YAML/JSON (FR-001, FR-002). Secrets via `${ENV_VAR}` substitution (FR-013). Published Zod schema (FR-008). No admin portal. |
| II. Deterministic, Audit-Friendly Behavior | PASS | Audit events with structured schema for all auth events (FR-006, FR-007). Session metadata includes config hash from existing system. |
| III. Security-First and Multi-Tenant Isolation | PASS | Sessions bound to tenant context (FR-005). Hostname validation rejects cross-tenant sessions (US2). Audit logs exclude secrets/tokens (FR-007). CSRF protection via state parameter (FR-009). |
| IV. Minimal Data Collection | PASS | Only IdP subject, email, display name persisted (FR-014). No raw tokens stored. Audit events contain minimal PII (FR-007). |
| V. Pluggable Architecture | PASS | `AuthAdapter` interface with `OIDCAdapter` implementation. SAML adapter slot documented. SSO provider selectable via tenant config. |
| VI. Accessibility and Localization | PASS | Sign-in page must meet WCAG 2.1 AA. Keyboard navigation, screen reader compatible. English default with i18n-ready string externalization. |
| VII. Quality Gates | PASS | Contract tests for AuthAdapter interface. Integration tests with mock IdP. Tenant isolation tests. CI required. |
| VIII. Documentation Required | PASS | quickstart.md with example YAML config. Security guidance for secrets management and IdP setup. |
| IX. Technology Stack | PASS | Next.js 16.x (latest stable) with App Router. AI SDK v6.x installed as production dependency per constitution. |

**Gate result**: ALL PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-employee-sso-auth/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity schemas
├── quickstart.md        # Phase 1: setup guide
├── contracts/           # Phase 1: API contracts
│   └── auth-api.yaml    # OpenAPI spec for auth endpoints
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── config/              # (existing) tenant config loading/validation
│   └── schema.ts        # Extended with OIDCConfigSchema
├── tenant/              # (existing) tenant resolution
├── storage/             # (existing) better-sqlite3 adapter
├── auth/                # (new) authentication module
│   ├── adapters/
│   │   ├── auth-adapter.ts       # AuthAdapter interface
│   │   └── oidc-adapter.ts       # OIDCAdapter implementation
│   ├── session/
│   │   └── session-manager.ts    # iron-session wrapper
│   ├── audit.ts                  # Auth audit event logger
│   └── index.ts                  # Public API
└── index.ts

app/                     # (new) Next.js App Router
├── layout.tsx           # Root layout
├── middleware.ts         # Session validation + tenant context
├── [tenant]/
│   ├── auth/
│   │   ├── signin/
│   │   │   └── page.tsx         # Tenant-branded sign-in page
│   │   ├── error/
│   │   │   └── page.tsx         # Auth error page
│   │   └── signout-confirm/
│   │       └── page.tsx         # Sign-out confirmation
│   └── dashboard/
│       └── page.tsx             # Post-auth landing (placeholder)
└── api/
    └── auth/
        └── [tenant]/
            ├── signin/route.ts  # Initiate OIDC flow
            ├── callback/route.ts # Handle OIDC callback
            └── signout/route.ts  # Destroy session + optional IdP logout

tests/
├── unit/
│   ├── auth/
│   │   ├── oidc-adapter.test.ts
│   │   └── session-manager.test.ts
│   └── config/
│       └── oidc-schema.test.ts
├── integration/
│   └── auth/
│       ├── signin-flow.test.ts
│       ├── tenant-isolation.test.ts
│       └── audit-events.test.ts
└── contract/
    └── auth-adapter.test.ts

config/
└── examples/
    └── tenants/
        └── acme-corp.yaml       # Example tenant with OIDC config
```

**Structure Decision**: Web application using Next.js App Router conventions (Constitution IX). Existing `src/` modules remain as shared libraries. New `app/` directory added for Next.js routing. Auth module under `src/auth/` follows established pattern from `src/config/` and `src/tenant/`.

## Complexity Tracking

> No Constitution Check violations. No complexity justifications needed.
