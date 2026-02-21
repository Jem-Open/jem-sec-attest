# Feature Specification: PDF Evidence Export

**Feature Branch**: `006-pdf-evidence-export`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "Add PDF export for training evidence. The PDF must be readable for auditors and include: employee identity, tenant, training type (onboarding/annual), completion date, pass/fail, quiz summary, policy attestations, and version hashes. Acceptance criteria: PDF can be generated for a completed training session; PDF is consistently formatted; PDF generation failures are handled with a clear error and retry path."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Training Evidence as PDF (Priority: P1)

An auditor or compliance officer needs a printable, self-contained record of a completed training session. They request a PDF export for a specific completed session. The system generates a professionally formatted PDF containing all audit-relevant evidence for that session, which they can download, print, or file.

**Why this priority**: This is the core feature — without PDF generation, the feature delivers no value. Auditors require portable, offline-readable evidence documents.

**Independent Test**: Can be fully tested by requesting a PDF for any completed training session and verifying the document contains all required fields and is well-formatted.

**Acceptance Scenarios**:

1. **Given** a training session with status "passed", **When** the user requests a PDF export, **Then** the system generates a PDF containing employee identity, tenant name, training type, completion date, pass result, quiz summary, policy attestations, and version hashes.
2. **Given** a training session with status "exhausted" (failed all attempts), **When** the user requests a PDF export, **Then** the system generates a PDF showing the fail outcome with all attempt details.
3. **Given** a training session with status "in-progress" (not completed), **When** the user requests a PDF export, **Then** the system returns an error indicating the session must be completed before export.
4. **Given** a completed training session, **When** the PDF is generated, **Then** the PDF is consistently formatted regardless of the number of modules, quiz questions, or attempt count.

---

### User Story 2 - Verify Evidence Integrity from PDF (Priority: P2)

An auditor reviewing a previously exported PDF needs confidence that the evidence has not been tampered with. The PDF includes the SHA-256 content hash and schema version, allowing the auditor to cross-reference the hash against the system's stored evidence record.

**Why this priority**: Integrity verification is a key audit requirement. Without visible hashes, the PDF is just a report — with them, it becomes a verifiable attestation.

**Independent Test**: Can be tested by exporting a PDF and confirming the content hash printed on the PDF matches the hash stored in the evidence database record.

**Acceptance Scenarios**:

1. **Given** a generated PDF, **When** the auditor reads the content hash from the PDF, **Then** the hash matches the `contentHash` stored in the evidence record for that session.
2. **Given** a generated PDF, **When** the auditor reads the schema version, **Then** it matches the evidence record's `schemaVersion`.

---

### User Story 3 - Retry After PDF Generation Failure (Priority: P2)

A user attempts to generate a PDF but the operation fails (e.g., due to a transient error). The system provides a clear error message explaining what went wrong and allows the user to retry the export without re-navigating.

**Why this priority**: PDF generation can fail for various reasons. A clear retry path prevents user frustration and ensures auditors can always obtain their documents.

**Independent Test**: Can be tested by simulating a generation failure and verifying the error response includes a meaningful message and the user can immediately retry.

**Acceptance Scenarios**:

1. **Given** a PDF generation request that fails, **When** the user receives the error response, **Then** the response includes a human-readable error message explaining the failure.
2. **Given** a previous PDF generation failure, **When** the user retries the export, **Then** the system processes the retry as a fresh request and returns the PDF if the underlying issue has resolved.

---

### Edge Cases

- What happens when the evidence record exists but the referenced training session has been deleted? The system should still generate the PDF from the evidence record alone, since evidence is immutable and self-contained.
- What happens when a session has many modules (up to 20)? The PDF layout must handle variable-length content without breaking formatting or truncating data.
- What happens when quiz questions include free-text responses with long content (up to 2000 characters)? The PDF must wrap text appropriately without overflow.
- What happens when the tenant's display name or employee ID contains special characters or non-ASCII text? The PDF must render these correctly.
- What happens when multiple PDF exports are requested concurrently for the same session? Each request should independently generate a fresh PDF without conflict.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a PDF document from a completed training evidence record (session status: "passed", "exhausted", or "abandoned").
- **FR-002**: System MUST reject PDF export requests for sessions that have not reached a terminal state, returning a clear error message.
- **FR-003**: The generated PDF MUST include the following information:
  - Employee identity (employee ID)
  - Tenant name and tenant ID
  - Training type (onboarding or annual, derived from the role profile context)
  - Session completion date and time
  - Overall outcome: pass or fail
  - Aggregate score and pass threshold
  - Per-module quiz summary: module title, topic area, module score, question count, and individual question results (selected option, score, LLM rationale for free-text)
  - Policy attestation details: config hash, role profile ID and version, application version, pass threshold, max attempts
  - Content hash (SHA-256) and schema version for tamper verification
- **FR-004**: The PDF MUST be consistently formatted regardless of content volume (1–20 modules, variable question counts, variable response lengths).
- **FR-005**: System MUST provide the PDF as a downloadable file with a meaningful filename (e.g., `evidence-{tenantId}-{employeeId}-{sessionId}.pdf`).
- **FR-006**: System MUST enforce tenant isolation — a PDF export request for tenant A must not return evidence belonging to tenant B.
- **FR-007**: When PDF generation fails, the system MUST return an error response with a human-readable message describing the failure reason.
- **FR-008**: The PDF export endpoint MUST be idempotent — requesting the same evidence record multiple times produces equivalent PDF documents.
- **FR-009**: The PDF MUST include a generation timestamp indicating when the PDF was produced, distinct from the evidence generation timestamp.
- **FR-010**: System MUST validate that the requesting user is authenticated before allowing PDF export.

### Key Entities

- **TrainingEvidence**: The immutable evidence record containing all audit data. This is the primary data source for PDF generation. Includes session summary, policy attestation, module evidence with quiz details, outcome summary, and content hash.
- **PDF Document**: The generated output artifact. Contains a formatted representation of the evidence record designed for auditor readability. Not stored persistently — generated on demand.
- **Evidence Export Request**: A request to generate a PDF for a specific evidence record, scoped to a tenant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate and download a PDF for any completed training session within 5 seconds.
- **SC-002**: Generated PDFs are readable and printable on standard A4/Letter paper without content overflow or truncation.
- **SC-003**: 100% of required data fields (employee identity, tenant, training type, completion date, outcome, quiz summary, policy attestations, version hashes) are present in every generated PDF.
- **SC-004**: The content hash displayed in the PDF matches the stored evidence record hash in 100% of cases.
- **SC-005**: When PDF generation fails, 100% of error responses include a human-readable message and the user can retry without re-navigating.
- **SC-006**: PDFs generated for the same evidence record at different times are equivalent in content (only the PDF generation timestamp differs).

## Assumptions

- Training type (onboarding vs. annual) can be derived from the role profile context or session metadata. If not currently stored, it will be inferred from available data or labeled generically.
- PDF generation happens on-demand (not pre-generated and stored) to avoid storage overhead and ensure the latest formatting is always applied.
- The PDF is generated server-side and returned as a binary response to the client.
- Authentication is handled by the existing OIDC/session infrastructure — no new auth mechanism is needed for this endpoint.
- The PDF does not need to include scenario responses (learning scenarios), only quiz question results, unless auditors require full scenario detail. Quiz summary is the primary audit artifact.
