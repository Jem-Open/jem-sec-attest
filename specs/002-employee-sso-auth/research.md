# Research: Employee SSO Authentication

**Feature Branch**: `002-employee-sso-auth`
**Date**: 2026-02-18

## R1: OIDC Library for Multi-Tenant Next.js

**Decision**: `openid-client` v6.x + custom integration layer

**Rationale**:
- Supports dynamic per-tenant provider configuration at runtime (critical for multi-tenant OIDC where each tenant has its own IdP/clientId)
- Full control over the authorization code flow, state management, and PKCE
- Works with Next.js App Router route handlers (server-side only, Fetch API based)
- Actively maintained (v6.8.2+, 886+ dependents)
- Enables clean adapter interface for future SAML support (Principle V)

**Alternatives considered**:
- **Auth.js v5 (next-auth)**: Rejected. Still in beta/RC as of 2026. Dynamic provider configuration via "lazy initialization" has documented bugs (#11450, #12741). Over-abstracts the auth flow, making pluggable adapter design difficult. Original maintainer departed Jan 2025.
- **Arctic (oslo/lucia-auth)**: Rejected. Parent Lucia library deprecated March 2025. Limited OIDC-specific features (no built-in discovery, no id_token validation). Semantic versioning not guaranteed.
- **WorkOS AuthKit**: Out of scope. Commercial SaaS dependency conflicts with self-hosted config-as-code requirement (Principle I).

## R2: Session Management

**Decision**: `iron-session` v8 for encrypted stateless cookies with server-side validation for sensitive operations

**Rationale**:
- Edge Runtime compatible (works in Next.js middleware for fast route protection)
- Session data encrypted in httpOnly cookie — no database call needed for basic validation
- Tenant context embedded in encrypted payload, validated cryptographically
- For sensitive operations, optional database revocation check in route handlers (full Node.js runtime where better-sqlite3 is available)
- Configurable TTL per-tenant via `expiresAt` in session payload

**Alternatives considered**:
- **Node.js Runtime Middleware (Next.js 15.2+/16.x)**: Would allow direct better-sqlite3 access in middleware, but ties deployment to self-hosted only. iron-session preserves portability.
- **Pure database sessions**: Too slow for middleware (Edge runtime can't access better-sqlite3). Would require a database call on every request.
- **JWT-only (no server state)**: No revocation capability. iron-session provides encrypted cookies with embedded expiration that can be supplemented with DB checks.

## R3: Audit Event Strategy

**Decision**: Asynchronous logging using Next.js `after()` API with better-sqlite3 persistence

**Rationale**:
- `after()` (stable since Next.js 15.1) runs after the response is sent — zero TTFB impact
- Writes to existing better-sqlite3 storage adapter (no new infrastructure)
- Graceful degradation: audit write failures are logged to error monitoring but don't block the user
- Synchronous fallback available for critical events if needed

**Alternatives considered**:
- **Synchronous in request path**: Adds 10-20ms per event to TTFB. Rejected for performance.
- **Message queue (BullMQ/Redis)**: Overkill for initial release. Can migrate later if needed.

## R4: Rate Limiting

**Decision**: Deferred to a future release.

**Rationale**:
- Not required for MVP authentication feature.
- Can be layered on as a separate concern without modifying the core auth flow.
- Infrastructure-level rate limiting (CDN, reverse proxy) can provide interim protection.

## R5: Employee Record Storage

**Decision**: JIT provisioning into better-sqlite3 via existing storage adapter

**Rationale**:
- Employee records created on first OIDC sign-in using `sub` claim as persistent identifier
- Updated on subsequent sign-ins (latest email, display name, last sign-in timestamp)
- Tenant-scoped (all queries include tenant_id)
- Uses existing storage adapter interface — no new storage mechanism

## R6: Package Versions

All packages pinned to latest stable as of February 2026.

| Dependency | Version | Purpose | License |
|------------|---------|---------|---------|
| `next` | ^16.1.0 | App Router framework (Constitution IX) | MIT |
| `react` / `react-dom` | ^19.2.1 | Required by Next.js | MIT |
| `ai` | ^6.0.0 | Vercel AI SDK (Constitution IX) | Apache-2.0 |
| `openid-client` | ^6.8.0 | OIDC client (discovery, auth code flow, token validation) | MIT |
| `iron-session` | ^8.0.4 | Encrypted stateless session cookies | MIT |
| `zod` | ^4.3.6 | Schema validation (upgrade from v3) | MIT |
| `better-sqlite3` | ^11.7.0 | Local SQLite storage | MIT |
| `yaml` | ^2.8.0 | YAML config parsing | ISC |
| `safe-stable-stringify` | ^2.5.0 | Deterministic hashing | MIT |
| `dotenv` | ^16.4.0 | Environment variable loading | BSD-2-Clause |
| `typescript` | ^5.9.2 | Type checking (latest stable) | Apache-2.0 |
| `vitest` | ^4.0.0 | Test runner | MIT |

All licenses compatible with Apache 2.0 (Licensing Requirements).

**Note**: Zod upgrade from v3 to v4 may require migration of existing schemas. Zod 4 has a new API surface. This should be evaluated during implementation; if migration is non-trivial, v3 can be retained for this feature with v4 upgrade as a separate task.
