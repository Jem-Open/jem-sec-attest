# Data Model: Employee SSO Authentication

**Feature Branch**: `002-employee-sso-auth`
**Date**: 2026-02-18

## Entities

### Employee

Persistent record created via JIT provisioning on first OIDC sign-in.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK, generated | Internal employee identifier |
| tenantId | string | FK → Tenant.id, NOT NULL, indexed | Owning tenant |
| idpSubject | string | NOT NULL, unique per tenant | OIDC `sub` claim (persistent IdP identifier) |
| email | string | NOT NULL | Employee email from IdP claims |
| displayName | string | NOT NULL | Employee display name from IdP claims |
| firstSignInAt | string (ISO 8601) | NOT NULL, immutable | Timestamp of first sign-in |
| lastSignInAt | string (ISO 8601) | NOT NULL | Updated on each sign-in |

**Uniqueness**: `(tenantId, idpSubject)` — an employee is uniquely identified within a tenant by their IdP subject.

**Lifecycle**:
- Created on first successful OIDC callback for a given `(tenantId, sub)` pair
- Updated on subsequent sign-ins (email, displayName, lastSignInAt)
- Never deleted by the auth system (retention policy managed separately)

### Employee Session

Encrypted in `iron-session` cookie. No database table — session data lives in the encrypted cookie payload. Optional database record for revocation tracking of sensitive operations.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| sessionId | string (UUID) | Generated per sign-in | Unique session identifier |
| tenantId | string | NOT NULL | Tenant context for this session |
| employeeId | string | NOT NULL | References Employee.id |
| email | string | NOT NULL | For display in UI |
| displayName | string | NOT NULL | For display in UI |
| idpIssuer | string | NOT NULL | OIDC issuer URL that authenticated this session |
| createdAt | number (epoch ms) | NOT NULL | Session creation timestamp |
| expiresAt | number (epoch ms) | NOT NULL | Expiration (default: createdAt + 3600000) |

**Lifecycle**:
- Created in OIDC callback after successful token exchange
- Read/validated in middleware on every request (cryptographic only)
- Destroyed on sign-out or expiration
- Multiple concurrent sessions per employee (no invalidation on new sign-in)

**Validation rules**:
- `expiresAt > Date.now()` — session must not be expired
- Tenant resolved from request hostname must match `tenantId` — prevents cross-tenant session reuse

### OIDC Tenant Configuration

Extension to existing `TenantSettings` in tenant YAML/JSON config files. Validated at config load time.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| issuerUrl | string (URL) | Required | OIDC Discovery endpoint base URL |
| clientId | string | Required, min length 1 | OIDC client identifier |
| clientSecret | string | Required, must match `${ENV_VAR}` pattern | OIDC client secret (env var reference) |
| redirectUri | string (URL) | Required | Callback URL for this tenant |
| scopes | string[] | Required, min 1 item, must include "openid" | OIDC scopes to request |
| logoutUrl | string (URL) | Optional | IdP logout endpoint for sign-out |
| claimMappings | object | Optional | Custom claim-to-field mappings |

**Parent**: Nested under `settings.auth.oidc` in tenant config.

**Validation rules** (Zod schema):
- `issuerUrl` must be a valid HTTPS URL
- `clientSecret` must match pattern `/^\$\{[A-Z_][A-Z0-9_]*\}$/` (env var substitution)
- `scopes` must include `"openid"`
- If `logoutUrl` provided, must be a valid URL
- Invalid OIDC config prevents SSO for that tenant only (other tenants unaffected)

### Auth Session Config

Per-tenant session configuration, sibling to OIDC config.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| sessionTtlSeconds | number | Optional, positive integer, default 3600 | Session TTL in seconds |

**Parent**: Nested under `settings.auth` in tenant config.

### Auth Audit Event

Immutable, append-only record. Written asynchronously via `after()`.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK, generated | Unique event identifier |
| eventType | enum | NOT NULL | One of: `sign-in`, `sign-out`, `auth-failure`, `auth-config-error` |
| tenantId | string | Nullable (unknown for some failures) | Tenant context |
| employeeId | string | Nullable (unknown for failures) | Employee involved |
| timestamp | string (ISO 8601) | NOT NULL | When event occurred |
| ipAddress | string | NOT NULL | Client IP address |
| userAgent | string | NOT NULL | Client user agent |
| metadata | object | Optional | Additional context (see below) |

**Metadata by event type**:
- `sign-in`: `{ idpIssuer: string }`
- `sign-out`: `{ idpIssuer: string }`
- `auth-failure`: `{ reason: string, idpIssuer?: string }` where reason is one of: `state-mismatch`, `token-exchange-failed`, `missing-required-claims`, `tenant-mismatch`, `idp-error`, `session-expired`
- `auth-config-error`: `{ reason: string, tenantId: string }` where reason is one of: `missing-oidc-config`, `invalid-oidc-config`

**Lifecycle**:
- Created asynchronously after auth events
- Never updated or deleted (immutable)
- Subject to tenant retention policy for eventual purging

**Security constraints** (FR-007):
- MUST NOT contain: tokens, authorization codes, client secrets, full IdP error responses
- MUST NOT contain PII beyond: employee email (via employeeId reference), IP address
- Metadata values are sanitized (no raw error stack traces)

## Relationships

```text
Tenant (existing)
  └── has many → Employee (new)
  └── has one  → OIDC Tenant Configuration (config extension)
  └── has one  → Auth Session Config (config extension)

Employee
  └── has many → Employee Session (cookie-based, no FK in DB)
  └── referenced by → Auth Audit Event (via employeeId)

Auth Audit Event
  └── references → Tenant (via tenantId, nullable)
  └── references → Employee (via employeeId, nullable)
```

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| employees | `(tenantId, idpSubject)` UNIQUE | JIT provisioning lookup |
| employees | `(tenantId, email)` | Email-based lookups |
| audit_events | `(tenantId, eventType, timestamp)` | Filtered audit queries |
| audit_events | `(tenantId, employeeId, timestamp)` | Per-employee audit history |
