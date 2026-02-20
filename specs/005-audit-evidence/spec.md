# Feature Specification: Audit-Ready Training Evidence

**Feature Branch**: `005-audit-evidence`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Generate audit-ready evidence for completed training. Evidence must include quiz questions, employee answers, scoring rationale, pass/fail, and policy attestations with timestamps. Evidence must be versioned and include hashes that connect it to the training configuration and skills used. Acceptance criteria: Evidence JSON is generated for every completed session; evidence contains required fields; evidence can be exported as a shareable artifact for audits."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Evidence on Session Completion (Priority: P1)

When an employee completes a training session (reaches "passed", "exhausted", or "abandoned" terminal state), the system automatically generates a comprehensive evidence record capturing the full training history. This evidence includes every quiz question asked, the employee's answers, how each answer was scored, the overall pass/fail outcome, and timestamps for every interaction. The evidence is stored as a permanent, immutable record tied to that session.

**Why this priority**: Without automatic evidence generation at completion time, there is nothing to audit. This is the core capability that all other stories depend on.

**Independent Test**: Can be fully tested by completing a training session and verifying that an evidence record is created with all required fields populated.

**Acceptance Scenarios**:

1. **Given** a training session reaches "passed" status, **When** evaluation completes, **Then** an evidence record is generated containing all module questions, employee answers, scores, rationales, and a final pass determination with timestamps.
2. **Given** a training session reaches "exhausted" status (all attempts used), **When** evaluation completes, **Then** an evidence record is generated capturing all attempts, final scores, and an exhausted determination.
3. **Given** a training session is abandoned, **When** the abandon action completes, **Then** an evidence record is generated capturing the partial progress and abandoned status.
4. **Given** a completed session already has an evidence record, **When** evidence generation is triggered again, **Then** the system returns the existing evidence without creating a duplicate.

---

### User Story 2 - Evidence Integrity and Versioning (Priority: P1)

Every evidence record includes a version identifier and cryptographic hashes that link it to the exact training configuration, role profile, and application version used during the session. An auditor can verify that the evidence has not been tampered with and corresponds to a specific policy configuration.

**Why this priority**: Evidence without integrity guarantees has no audit value. This is equally critical to generation itself.

**Independent Test**: Can be tested by generating evidence and verifying that the version, config hash, and content hash fields are present and that the content hash matches a recomputation from the evidence body.

**Acceptance Scenarios**:

1. **Given** evidence is generated for a completed session, **When** the evidence is inspected, **Then** it contains an evidence schema version, a content hash computed over the evidence body, and the config hash from the training session.
2. **Given** evidence was generated with schema version 1, **When** the evidence schema changes in a future release, **Then** existing evidence records retain their original schema version and remain readable.
3. **Given** evidence is generated, **When** any field in the evidence body is modified after creation, **Then** the content hash no longer matches a recomputation, signaling tampering.

---

### User Story 3 - Export Evidence as Shareable Artifact (Priority: P2)

A compliance officer or auditor can retrieve the evidence for a completed training session as a self-contained JSON document suitable for sharing with external auditors, regulatory bodies, or archival systems. The export includes all evidence fields and can be retrieved by session ID.

**Why this priority**: Generation and integrity are prerequisites. Export enables the external sharing use case that auditors need.

**Independent Test**: Can be tested by calling the export endpoint with a valid session ID and verifying the response is a complete, self-contained JSON document with the correct content type.

**Acceptance Scenarios**:

1. **Given** a completed session with generated evidence, **When** an authorized user requests the evidence export for that session, **Then** the system returns a JSON document containing the full evidence record.
2. **Given** a session that is still in progress, **When** an authorized user requests evidence export, **Then** the system responds with an appropriate error indicating the session is not yet complete.
3. **Given** a session belonging to tenant A, **When** a user authenticated for tenant B requests the evidence, **Then** the system denies access (tenant isolation).

---

### User Story 4 - List Evidence Records for Audit Review (Priority: P3)

A compliance officer can retrieve a list of evidence records filtered by employee, date range, or pass/fail outcome to support periodic compliance reviews and audits.

**Why this priority**: Listing and filtering is a convenience layer on top of the core generation and export capabilities. It supports bulk audit workflows.

**Independent Test**: Can be tested by generating evidence for multiple sessions and querying with filters to verify correct results are returned.

**Acceptance Scenarios**:

1. **Given** multiple completed sessions for a tenant, **When** a compliance officer requests evidence records filtered by employee ID, **Then** only evidence for that employee is returned, ordered by completion date.
2. **Given** evidence records spanning several months, **When** filtered by date range, **Then** only records within the specified range are returned.
3. **Given** a mix of passed and failed sessions, **When** filtered by outcome, **Then** only matching records are returned.

---

### Edge Cases

- What happens when a session completes but the evidence generation fails (e.g., storage error)? The session completion must not be blocked; evidence generation failure is logged and can be retried.
- What happens when evidence is requested for a session that predates this feature? The system returns a clear "no evidence available" response rather than an error.
- What happens when a session has zero scored modules (abandoned immediately)? Evidence is still generated capturing the empty state with appropriate metadata.
- How does evidence handle remediation attempts? All attempts are captured in a single evidence record, with per-attempt breakdowns.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically generate an evidence record when a training session reaches any terminal state ("passed", "exhausted", or "abandoned").
- **FR-002**: Evidence MUST include the full text of every quiz question and scenario prompt presented during the session.
- **FR-003**: Evidence MUST include every employee answer (selected option for multiple-choice, full text for free-text responses) with the timestamp of submission.
- **FR-004**: Evidence MUST include the score awarded for each answer and, for free-text answers, the scoring rationale provided by the evaluation system.
- **FR-005**: Evidence MUST include the overall pass/fail determination, aggregate score, per-module scores, and the pass threshold that was applied.
- **FR-006**: Evidence MUST include a policy attestation section recording which tenant configuration (by config hash), role profile (by ID and version), and application version governed the training session.
- **FR-007**: Evidence MUST include timestamps for session start, each module completion, each answer submission, evaluation completion, and final session outcome.
- **FR-008**: Evidence MUST include an evidence schema version identifier to support forward-compatible schema evolution.
- **FR-009**: Evidence MUST include a content hash (SHA-256) computed over the canonical evidence body, enabling tamper detection.
- **FR-010**: Evidence MUST be immutable once generated — no updates or modifications permitted after creation.
- **FR-011**: System MUST provide an endpoint to retrieve a single evidence record by session ID, returning a self-contained JSON document.
- **FR-012**: System MUST provide an endpoint to list evidence records for a tenant, supporting filters by employee ID, date range, and pass/fail outcome.
- **FR-013**: Evidence records MUST be scoped to the tenant that owns the training session (tenant isolation enforced).
- **FR-017**: Employees MUST be able to retrieve evidence only for their own training sessions.
- **FR-018**: Users with a "compliance" or "admin" role MUST be able to retrieve and list evidence for all employees within their tenant.
- **FR-019**: The list evidence endpoint (FR-012) MUST be restricted to users with a "compliance" or "admin" role.
- **FR-014**: System MUST be idempotent — requesting evidence generation for a session that already has evidence returns the existing record.
- **FR-015**: Evidence generation failure MUST NOT block or roll back the session state transition. Failures are logged for manual retry.
- **FR-020**: System MUST provide an endpoint for compliance/admin users to manually trigger evidence generation for any completed session that is missing evidence (e.g., after a prior generation failure).
- **FR-016**: For sessions with multiple attempts (remediation), evidence MUST capture all attempts with per-attempt module scores and aggregate scores.

### Key Entities

- **TrainingEvidence**: The primary evidence record for a completed training session. Contains the full audit trail including session metadata, policy attestation, per-module breakdowns, and integrity hashes. One evidence record per session (1:1 relationship). Linked to the originating session by session ID.
- **ModuleEvidence**: A per-module breakdown within the training evidence. Contains the module's questions, employee answers, scores, rationales, and timestamps. Nested within TrainingEvidence (not a separate top-level entity).
- **PolicyAttestation**: A section within evidence capturing the exact policy configuration, role profile, and application version that governed the session. Provides the chain of custody between evidence and organizational policy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of training sessions reaching a terminal state have a corresponding evidence record generated within 5 seconds of completion.
- **SC-002**: Every evidence record passes a self-validation check — the content hash matches a recomputation from the evidence body.
- **SC-003**: An auditor can retrieve any individual evidence record in under 2 seconds.
- **SC-004**: Evidence records for sessions predating this feature return a clear "not available" response rather than an error, with zero false positives.
- **SC-005**: Evidence export produces a self-contained JSON document that requires no additional system access to interpret (all referenced data is inline).
- **SC-006**: Tenant isolation is enforced — zero cross-tenant evidence access is possible through any endpoint.

## Clarifications

### Session 2026-02-20

- Q: Who should be able to access evidence records? → A: Employees can view their own evidence; a "compliance" or "admin" role can view all evidence for the tenant.
- Q: How should failed evidence generation be retried? → A: Manual retry via an endpoint — a compliance/admin user can trigger evidence generation for a session.

## Assumptions

- **SHA-256 for content hashing**: Industry-standard algorithm suitable for tamper detection. Not intended as a cryptographic signature (no private key signing).
- **Evidence schema starts at version 1**: Future schema changes increment the version; old evidence remains readable at its original version.
- **Evidence includes question text but not correct answers or rubrics**: Correct answers and rubrics are server-only fields not included in evidence, consistent with existing client-safe data stripping. The evidence captures what the employee saw and how they were scored, not the answer key.
- **JSON format for evidence**: Standard, portable format suitable for audit exchange. No PDF or other rendering in this feature scope.
- **Retention follows tenant configuration**: Evidence records follow the same retention policy as other training data configured per tenant.
- **Authorization for evidence endpoints uses existing auth middleware**: Existing tenant-scoped session authentication applies. Role-based access control distinguishes between employee self-access and compliance/admin tenant-wide access. Role determination is expected to be derivable from the existing session or a role claim in the OIDC token.
- **Non-blocking generation**: Evidence is generated in a fire-and-forget pattern (like existing audit logging). If generation fails, a compliance/admin user can manually re-trigger via a dedicated endpoint. No background job infrastructure is required.
