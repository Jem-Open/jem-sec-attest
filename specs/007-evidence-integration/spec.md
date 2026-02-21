# Feature Specification: Compliance Evidence Integration

**Feature Branch**: `007-evidence-integration`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "Integrate with Sprinto to automatically upload training evidence via API for a configured workflow check. The integration must be pluggable so other providers (Drata/Vanta) can be added later without rewriting core logic. The integration must be configured via YAML/JSON per tenant and must record success/failure and retries. Acceptance criteria: On training completion, evidence is pushed to Sprinto for tenants that enable it; failures are retried and logged; tenants without Sprinto enabled are unaffected."

## Clarifications

### Session 2026-02-21

- Q: What retry execution model should be used — persistent queue (DB-backed, survives restarts) or in-process retries (async chain with delays, lost on restart)? → A: In-process retries. Bounded async chain with exponential backoff; retries are lost on process restart, which is acceptable given the short retry window and the upload status record enabling later identification of lost uploads.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Evidence Push to Sprinto (Priority: P1)

When an employee completes security attestation training, the system automatically uploads the resulting evidence record to Sprinto's compliance platform for the tenant's configured workflow check. The compliance administrator does not need to manually export and upload evidence — it happens seamlessly as part of the training completion flow.

**Why this priority**: This is the core value proposition. Without automatic evidence push, the entire feature has no purpose. Every other story builds on this foundation.

**Independent Test**: Can be fully tested by completing a training session for a Sprinto-enabled tenant and verifying that the evidence record appears in the Sprinto workflow check. Delivers immediate value by eliminating manual evidence upload.

**Acceptance Scenarios**:

1. **Given** a tenant with Sprinto integration enabled and a valid workflow check configured, **When** an employee's training session reaches "passed" status and evidence is generated, **Then** the evidence is automatically uploaded to Sprinto and the upload is recorded as successful.
2. **Given** a tenant with Sprinto integration enabled, **When** an employee's training session reaches "exhausted" status and evidence is generated, **Then** the evidence is automatically uploaded to Sprinto (even for non-passing outcomes, since the compliance record must reflect the attempt).
3. **Given** a tenant with no compliance integration configured, **When** an employee completes training, **Then** evidence is generated locally as before and no external upload is attempted.

---

### User Story 2 - Retry and Failure Handling (Priority: P2)

When an evidence upload to Sprinto fails (network error, rate limit, service outage), the system automatically retries with backoff. If all retries are exhausted, the failure is logged with enough detail for an administrator to diagnose and manually re-trigger the upload.

**Why this priority**: External API calls will inevitably fail. Without retry logic, the system would silently lose evidence uploads during transient outages, undermining trust in the compliance workflow.

**Independent Test**: Can be tested by simulating a failing Sprinto endpoint and verifying that the system retries the configured number of times, records each attempt, and logs the final failure with actionable detail.

**Acceptance Scenarios**:

1. **Given** a Sprinto upload fails with a transient error (network timeout, 429, 5xx), **When** the system processes the failure, **Then** it retries the upload up to the configured maximum number of attempts with increasing delay between attempts.
2. **Given** all retry attempts are exhausted, **When** the final attempt fails, **Then** the system records the failure with the error details, timestamps, and attempt count, and logs the failure for administrator visibility.
3. **Given** a retry succeeds after an initial failure, **When** the upload completes, **Then** the system records the eventual success and the total number of attempts taken.
4. **Given** a Sprinto upload fails with a non-retryable error (401 unauthorized, 400 bad request), **When** the system processes the failure, **Then** it does not retry and immediately records the failure with the error details.

---

### User Story 3 - Per-Tenant Integration Configuration (Priority: P3)

A platform administrator configures which compliance provider (Sprinto, and eventually Drata or Vanta) each tenant uses by editing the tenant's YAML configuration file. Each tenant can have different providers or no provider at all. Configuration includes provider-specific credentials and workflow identifiers.

**Why this priority**: Configuration is essential but is a one-time setup activity per tenant. The automatic push (P1) and reliability (P2) deliver the ongoing operational value.

**Independent Test**: Can be tested by adding compliance integration settings to a tenant YAML file, restarting the system, and verifying the configuration is loaded and validated correctly — without needing to actually trigger an upload.

**Acceptance Scenarios**:

1. **Given** a tenant YAML file with a valid compliance integration block specifying Sprinto as the provider, **When** the system loads configuration, **Then** the Sprinto integration is activated for that tenant with the specified credentials and workflow check identifier.
2. **Given** a tenant YAML file with no compliance integration block, **When** the system loads configuration, **Then** no compliance integration is active for that tenant and training completion behaves exactly as before.
3. **Given** a tenant YAML file with an invalid compliance integration block (missing required fields, unknown provider), **When** the system loads configuration, **Then** the configuration is rejected with a clear validation error message identifying the problem.

---

### User Story 4 - Upload Status Visibility (Priority: P4)

An administrator can see the upload status (pending, succeeded, failed, retrying) for each evidence record through the existing evidence listing, so they can identify records that failed to upload and take corrective action.

**Why this priority**: Observability is important for operational trust but can initially be achieved through logs alone. A dedicated status view is a quality-of-life enhancement.

**Independent Test**: Can be tested by querying the evidence list for a tenant and verifying that each record includes its compliance upload status and history.

**Acceptance Scenarios**:

1. **Given** evidence records with various upload statuses (some succeeded, some failed, some pending), **When** an administrator views the evidence list, **Then** each record displays its current upload status.
2. **Given** an evidence record that failed to upload, **When** an administrator views the record details, **Then** the error message, number of attempts, and timestamp of last attempt are visible.

---

### Edge Cases

- What happens when evidence is generated for a session that was already uploaded (idempotency)? The system must not create duplicate uploads for the same evidence record.
- What happens when the compliance provider's API is down for an extended period (hours)? Retries are bounded (max 5 attempts, ~5 min total window) and run in-process. After exhaustion, the failure is recorded and no further automatic retries occur. Extended outages require manual intervention after the provider recovers.
- What happens when a tenant's compliance credentials are rotated mid-flight? In-progress retries should use the credentials that were active when the upload was initiated.
- What happens when the evidence record is very large? The system must handle payload size limits imposed by the provider.
- What happens when multiple training sessions complete simultaneously for the same tenant? Uploads must not interfere with each other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a pluggable compliance provider architecture where new providers can be added by implementing a defined provider interface, without modifying the core upload orchestration logic.
- **FR-002**: System MUST automatically initiate an evidence upload to the configured compliance provider when evidence is generated for a completed training session (passed or exhausted).
- **FR-003**: System MUST allow each tenant to independently configure zero or one compliance provider via the tenant YAML configuration file.
- **FR-004**: System MUST validate compliance integration configuration at startup, rejecting invalid or incomplete provider settings with clear error messages.
- **FR-005**: System MUST retry failed uploads caused by transient errors (network failures, rate limits, server errors) up to a configurable maximum number of attempts with exponential backoff.
- **FR-006**: System MUST distinguish between retryable errors (timeouts, 429, 5xx) and non-retryable errors (401, 400, 404) and only retry for retryable errors.
- **FR-007**: System MUST record the outcome of each upload attempt, including: provider name, attempt count, status (pending/succeeded/failed), error details (if any), and timestamps.
- **FR-008**: System MUST ensure idempotent uploads — re-triggering an upload for already-uploaded evidence must not create a duplicate record in the compliance provider.
- **FR-009**: System MUST NOT affect training completion, evidence generation, or any other functionality for tenants that have no compliance integration configured.
- **FR-010**: System MUST support Sprinto as the first compliance provider, mapping training evidence fields to Sprinto's workflow check evidence upload format.
- **FR-011**: System MUST log all upload attempts, successes, and failures with sufficient detail for operational troubleshooting.
- **FR-012**: System MUST expose upload status on evidence records so administrators can identify failed uploads.

### Key Entities

- **ComplianceUpload**: Represents a single upload attempt/result for an evidence record to a compliance provider. Key attributes: evidence ID, provider name, status, attempt count, error details, timestamps, provider-specific reference ID (on success).
- **ComplianceProvider (interface)**: Defines the contract that each compliance platform adapter must fulfill — accepts an evidence record and returns success/failure with a provider-specific reference.
- **ComplianceIntegrationConfig**: Per-tenant configuration specifying the provider type, credentials (via environment variable references), workflow/check identifiers, and retry settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of training evidence generated for Sprinto-enabled tenants results in a successful upload to Sprinto within 10 minutes of evidence generation under normal operating conditions.
- **SC-002**: Transient upload failures are automatically resolved through retries at least 95% of the time without manual intervention.
- **SC-003**: Administrators can identify any failed uploads and their error details within 30 seconds of accessing the evidence view.
- **SC-004**: Adding a new compliance provider (e.g., Drata) requires implementing only the provider-specific adapter — no changes to the upload orchestration, retry logic, configuration loading, or status tracking code.
- **SC-005**: Tenants without compliance integration configured experience zero change in training completion time or behavior.

## Assumptions

- Sprinto provides a GraphQL API for uploading evidence to a workflow check, authenticated via an `api-key` HTTP header. Regional endpoints serve US, EU, and India regions.
- Credentials for compliance providers are stored as environment variable references in tenant YAML (consistent with the existing pattern for OIDC client secrets).
- The retry strategy uses in-process exponential backoff with jitter (async chain with delays), starting at a reasonable interval (e.g., 5 seconds) and capping at a maximum delay (e.g., 5 minutes), with a default maximum of 5 retry attempts. Retries are not persisted — if the process restarts mid-retry, the attempt is lost. This is acceptable because the upload status record allows administrators to identify and manually address any uploads lost to process restarts.
- The evidence upload is fire-and-forget from the training completion flow (non-blocking), consistent with how evidence generation itself works today. The entire retry chain runs within the same async fire-and-forget context.
- Only one compliance provider can be configured per tenant at a time. Multi-provider support (uploading to both Sprinto and Drata simultaneously) is out of scope for this feature.

## Out of Scope

- Bi-directional sync with compliance providers (e.g., pulling compliance status back from Sprinto).
- A UI for configuring compliance integrations — configuration is YAML-only.
- Manual re-trigger of failed uploads via an admin API endpoint (can be added as a follow-up).
- Drata and Vanta provider implementations — only the pluggable architecture and Sprinto adapter are in scope.
- Webhook-based notifications from compliance providers back to the platform.
