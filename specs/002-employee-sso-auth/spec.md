# Feature Specification: Employee SSO Authentication

**Feature Branch**: `002-employee-sso-auth`
**Created**: 2026-02-17
**Status**: Draft
**Input**: User description: "Add employee authentication for a multi-tenant environment using SSO configured entirely via tenant YAML/JSON. Employees must sign in and be associated with the correct tenant based on resolution rules. Support OIDC as the baseline; the system must allow tenants to configure IdP parameters via config files. Acceptance criteria: Employee can sign in to correct tenant; cannot access other tenant; auth failures are handled gracefully; audit events are recorded for sign-in/sign-out."

## Clarifications

### Session 2026-02-17

- Q: Are employee records persisted beyond the session? → A: Create a persistent employee record on first sign-in (JIT provisioning from IdP claims); update on subsequent sign-ins.
- Q: What is the default session TTL? → A: 1 hour default, configurable per-tenant.
- Q: Is rate limiting applied to auth endpoints? → A: Deferred to a future release.
- Q: What do unauthenticated users see on arrival? → A: Tenant-branded sign-in page with a "Sign in with SSO" button; redirect to IdP on click.
- Q: Can employees have multiple concurrent sessions? → A: Unlimited concurrent sessions; no cap enforced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee Signs In via Tenant SSO (Priority: P1)

An employee navigates to their organization's instance of the platform (e.g., `acme.example.com`). The system resolves the tenant from the hostname (or email domain) and displays a tenant-branded sign-in page featuring the organization's name/logo and a "Sign in with SSO" button. When the employee clicks the button, the system looks up the tenant's OIDC configuration and redirects to their organization's Identity Provider (IdP). After successful authentication at the IdP, the employee is redirected back. If this is their first sign-in, a persistent employee record is created from IdP claims (JIT provisioning); otherwise the existing record is updated. The employee lands on their tenant's dashboard with a valid session (default TTL: 1 hour). An audit event is recorded for the sign-in.

**Why this priority**: This is the core authentication flow — without it, no employee can access the platform. It exercises tenant resolution, OIDC config lookup, the full authorization code flow, session creation, and audit logging.

**Independent Test**: Can be fully tested by configuring a single tenant with OIDC settings, navigating to that tenant's hostname, completing the IdP sign-in, and verifying the employee lands on the correct tenant dashboard with a session.

**Acceptance Scenarios**:

1. **Given** a tenant "Acme Corp" is configured with hostname `acme.example.com` and OIDC settings pointing to their IdP, **When** an employee navigates to `acme.example.com` and clicks "Sign In", **Then** the system redirects to Acme Corp's IdP login page with a valid OIDC authorization request.
2. **Given** the employee has completed authentication at the IdP, **When** the IdP redirects back with a valid authorization code, **Then** the system exchanges the code for tokens, creates a session scoped to "Acme Corp", and redirects the employee to the tenant dashboard.
3. **Given** a successful sign-in occurs, **When** the session is created, **Then** an audit event is recorded containing: tenant ID, employee identifier (from IdP claims), timestamp, event type "sign-in", and the IdP issuer — but no secrets, tokens, or unnecessary PII.

---

### User Story 2 - Tenant Isolation Prevents Cross-Tenant Access (Priority: P2)

An authenticated employee of one tenant attempts to access resources belonging to a different tenant. The system MUST deny access entirely — no data leakage, no partial responses, no error messages revealing the existence of the other tenant.

**Why this priority**: Multi-tenant isolation is a constitutional principle (Principle III). A failure here is a critical-severity defect. This story validates that authentication is always scoped.

**Independent Test**: Can be tested by authenticating as an employee of Tenant A, then making requests with tenant-scoped identifiers belonging to Tenant B, and verifying all are rejected.

**Acceptance Scenarios**:

1. **Given** an employee is authenticated and has a valid session for "Acme Corp", **When** they attempt to access a resource URL belonging to "Beta Inc", **Then** the system returns a generic "not found" or "forbidden" response without revealing that "Beta Inc" exists.
2. **Given** an employee's session token is associated with tenant "Acme Corp", **When** a request arrives on the hostname `beta.example.com` with that session token, **Then** the system rejects the session (hostname mismatch) and requires re-authentication.
3. **Given** an IdP returns claims with an email domain not matching any configured tenant, **When** the system processes the callback, **Then** authentication fails with a user-friendly error and an audit event of type "auth-failure" is recorded with reason "tenant-mismatch".

---

### User Story 3 - Authentication Failure Handling (Priority: P3)

When authentication fails — due to IdP errors, expired tokens, misconfigured OIDC settings, or user cancellation — the system handles each scenario gracefully. The employee sees a clear, non-technical error message. Sensitive details (IdP error codes, token contents, internal state) are never exposed to the user. Every failure is recorded as an audit event.

**Why this priority**: Graceful failure handling is essential for usability and security. Error messages that leak internal details can aid attackers. Audit trails of failures are required for compliance.

**Independent Test**: Can be tested by simulating each failure mode (invalid callback state, expired code, IdP error response, network timeout) and verifying the user sees an appropriate message and an audit event is recorded.

**Acceptance Scenarios**:

1. **Given** the IdP redirects back with an error parameter (e.g., `error=access_denied`), **When** the system processes the callback, **Then** the employee sees a message like "Sign-in was not completed. Please try again or contact your administrator." and an audit event of type "auth-failure" is recorded with the error category.
2. **Given** the OIDC state parameter in the callback does not match the stored session state, **When** the system processes the callback, **Then** the request is rejected, the employee sees a generic error, and an audit event of type "auth-failure" with reason "state-mismatch" is recorded.
3. **Given** a tenant's OIDC configuration is missing or invalid (e.g., no `clientId`), **When** an employee attempts to sign in for that tenant, **Then** the system displays "Single sign-on is not configured for your organization. Please contact your administrator." and an audit event of type "auth-config-error" is recorded.
4. **Given** the token exchange with the IdP fails (network error, invalid response), **When** the system processes the callback, **Then** the employee sees a generic error, and an audit event of type "auth-failure" with reason "token-exchange-failed" is recorded.

---

### User Story 4 - Employee Signs Out (Priority: P4)

An authenticated employee clicks "Sign Out". The system destroys their local session, records an audit event, and optionally triggers OIDC front-channel or back-channel logout at the IdP if the tenant's configuration supports it.

**Why this priority**: Sign-out completes the authentication lifecycle. Audit events for sign-out are explicitly required in the acceptance criteria.

**Independent Test**: Can be tested by signing in, clicking sign-out, verifying the session is invalidated (subsequent requests require re-authentication), and checking the audit log for a "sign-out" event.

**Acceptance Scenarios**:

1. **Given** an employee has an active session, **When** they initiate sign-out, **Then** the local session is destroyed, the employee is redirected to a confirmation page, and an audit event of type "sign-out" is recorded with tenant ID, employee identifier, and timestamp.
2. **Given** an employee has signed out, **When** they attempt to access a protected resource, **Then** they are redirected to the sign-in flow.
3. **Given** a tenant's OIDC configuration includes a `logoutUrl`, **When** the employee signs out, **Then** the system also redirects to (or triggers) the IdP's logout endpoint after destroying the local session.

---

### Edge Cases

- What happens when an employee's email domain matches one tenant but they access via a hostname belonging to a different tenant? The system MUST use hostname-first resolution precedence (consistent with existing `TenantResolverImpl` behavior) and authenticate against the hostname-matched tenant's IdP.
- What happens when a tenant's OIDC configuration is changed (e.g., new `clientId`) while employees have active sessions? Existing sessions MUST remain valid until they expire naturally. New sign-in attempts use the updated configuration.
- What happens when two tenants share the same IdP but have different OIDC client configurations? Each tenant MUST use its own `clientId`/`clientSecret` configuration independently; the system never conflates IdP-level identity with tenant-level identity.
- What happens when the IdP returns claims that lack a required field (e.g., no `email` claim)? The system MUST reject the authentication, display a user-friendly error, and log an audit event with reason "missing-required-claims".
- What happens during concurrent sign-in attempts from the same browser? Each OIDC flow MUST use a unique state parameter; completing one flow MUST NOT invalidate or interfere with another.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST authenticate employees using the OIDC Authorization Code flow, configured per-tenant via YAML/JSON configuration files.
- **FR-002**: OIDC configuration per tenant MUST include at minimum: `issuerUrl`, `clientId`, `clientSecret` (via `${ENV_VAR}` substitution or `secretRef:`), `redirectUri`, and `scopes`.
- **FR-003**: The system MUST resolve the tenant before initiating the OIDC flow, using the existing tenant resolution rules (hostname > email domain precedence).
- **FR-004**: Upon successful OIDC callback, the system MUST extract the employee identity from IdP claims (at minimum: subject identifier, email, display name) and create a session scoped to the resolved tenant.
- **FR-005**: Sessions MUST be bound to the tenant context. A session created for Tenant A MUST NOT grant access to Tenant B resources.
- **FR-006**: The system MUST record audit events for: successful sign-in, failed sign-in (with categorized reason), sign-out, and configuration errors encountered during authentication.
- **FR-007**: Audit events MUST NOT contain secrets, tokens, authorization codes, or unnecessary PII. They MUST include: event type, tenant ID, employee identifier (if available), timestamp, and failure reason (if applicable).
- **FR-008**: All OIDC configuration MUST be validated against a published schema at configuration load time. Invalid configuration MUST prevent the system from offering SSO for the affected tenant (but MUST NOT prevent other tenants from functioning).
- **FR-009**: The system MUST validate the OIDC `state` parameter on callback to prevent CSRF attacks.
- **FR-010**: The system MUST validate the `id_token` signature and claims (issuer, audience, expiry) before trusting IdP assertions.
- **FR-011**: Authentication error messages shown to employees MUST be user-friendly and MUST NOT reveal internal system details, IdP error codes, or configuration information.
- **FR-012**: The system MUST support sign-out by destroying the local session and optionally redirecting to the IdP's logout endpoint if configured.
- **FR-013**: OIDC client secrets MUST NEVER appear in configuration files in plaintext. They MUST use environment variable substitution (`${VAR}`) or secret-manager references (`secretRef:`).
- **FR-014**: The system MUST create a persistent employee record on first sign-in using IdP claims (just-in-time provisioning). On subsequent sign-ins, the employee record MUST be updated with the latest claims (e.g., display name, email changes).
- **FR-015**: Sessions MUST have a default TTL of 1 hour. The TTL MUST be configurable per-tenant via the tenant configuration file.
- **FR-016**: [intentionally removed — scope deferred to future release]
- **FR-017**: Unauthenticated users arriving at a tenant's URL MUST see a tenant-branded sign-in page displaying the organization's name and logo (from tenant branding configuration) with a "Sign in with SSO" button. The system MUST NOT auto-redirect to the IdP without user interaction.
- **FR-018**: The system MUST allow unlimited concurrent sessions per employee. A new sign-in MUST NOT invalidate existing sessions.

### Key Entities

- **Employee**: A persistent record representing a person who has signed in to a tenant at least once. Created via JIT provisioning on first sign-in, updated on subsequent sign-ins. Attributes: employee ID (internal), tenant ID, IdP subject identifier, email, display name, first sign-in timestamp, last sign-in timestamp.
- **Employee Session**: Represents an authenticated employee's active session. An employee may have unlimited concurrent sessions. Attributes: session identifier, tenant ID, employee ID (references Employee), created timestamp, expires timestamp (default TTL: 1 hour, configurable per-tenant), IdP issuer.
- **OIDC Tenant Configuration**: Per-tenant OIDC settings within the tenant config file. Attributes: issuer URL, client ID, client secret reference, redirect URI, scopes, optional logout URL, optional additional claim mappings.
- **Auth Audit Event**: An immutable record of an authentication-related event. Attributes: event ID, event type (`sign-in`, `sign-out`, `auth-failure`, `auth-config-error`), tenant ID, employee identifier (if available), timestamp, metadata (failure reason, IdP issuer).

### Assumptions

- The existing tenant resolution system (hostname and email domain indexes) is the authoritative mechanism for determining which tenant an authentication request belongs to. This feature builds on top of it, not alongside it.
- OIDC is the only SSO protocol required for the initial release. SAML support is deferred to a future feature (per Principle V, the adapter interface MUST accommodate future SAML addition).
- Session storage will use the existing storage adapter interface. The specific storage mechanism is an implementation detail.
- IdPs are assumed to be external, standards-compliant OIDC providers (e.g., Okta, Azure AD, Google Workspace). The system does not act as an IdP itself.
- Token refresh (using OIDC refresh tokens) is deferred. Sessions expire based on a configurable TTL (default: 1 hour). Employees re-authenticate when sessions expire.
- Concurrent session limits are not enforced in this release. This may be revisited if abuse patterns emerge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can complete the full sign-in flow (navigate to tenant URL → IdP redirect → IdP authentication → callback → dashboard) in under 5 seconds of system processing time (excluding time spent at the IdP).
- **SC-002**: 100% of sign-in and sign-out events produce a corresponding audit record within 1 second of the event occurring.
- **SC-003**: 100% of cross-tenant access attempts are rejected — zero data leakage across tenant boundaries during authentication.
- **SC-004**: An employee who encounters an authentication error sees a user-friendly message within 3 seconds, with no exposure of internal details.
- **SC-005**: A new tenant can be fully configured for SSO (OIDC settings in YAML, secrets in environment variables) and have employees sign in without any code changes or application restarts.
- **SC-006**: All authentication failures are categorized with a specific reason in the audit log, enabling administrators to diagnose issues without accessing application logs.
