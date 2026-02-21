# Research: PDF Evidence Export

**Branch**: `006-pdf-evidence-export` | **Date**: 2026-02-21

## R1: PDF Generation Library

**Decision**: Use `pdfkit` for server-side PDF generation.

**Rationale**: pdfkit is a lightweight, pure-JavaScript PDF generation library with no external binary dependencies (unlike Puppeteer which requires Chromium). It provides direct control over document layout, text formatting, and page structure — ideal for generating structured audit documents with predictable formatting. MIT license is fully compatible with Apache 2.0.

**Alternatives considered**:

| Library | License | Pros | Cons | Rejected Because |
|---------|---------|------|------|------------------|
| `pdf-lib` | MIT | Good for modifying existing PDFs | Lower-level API for document creation from scratch; less ergonomic for flowing text layouts | Designed more for PDF manipulation than document generation |
| `puppeteer` | Apache 2.0 | HTML-to-PDF, easy templating | Requires Chromium binary (~300MB), heavyweight for server deployment, non-deterministic rendering | Constitution Principle V (pluggable, air-gapped deployments) — Chromium dependency is a deployment burden |
| `jspdf` | MIT | Lightweight | Primarily browser-focused, weaker server-side text layout | Not designed for Node.js server-side generation |
| `@react-pdf/renderer` | MIT | React component model for PDFs | Adds React rendering overhead for a backend-only operation | Over-engineered for a single document type |

## R2: Training Type Derivation

**Decision**: Add a `trainingType` field to the evidence body schema as an optional string enum (`"onboarding" | "annual" | "other"`). Populate it during evidence generation from tenant configuration or session metadata.

**Rationale**: The current evidence schema does not include an explicit training type. Rather than inferring it at PDF generation time (fragile), the training type should be captured at evidence generation time when the full session context is available. If the field is absent on existing evidence records, the PDF renderer will display "Not specified".

**Alternatives considered**:

| Approach | Rejected Because |
|----------|------------------|
| Infer from role profile name at render time | Fragile heuristic, not auditable |
| Require training type in tenant config globally | Overly rigid — tenants may have mixed training types |
| Hard-code as "Security Training" | Doesn't meet spec requirement for onboarding/annual distinction |

**Migration note**: Existing evidence records without `trainingType` will render with "Not specified" in the PDF. New evidence records will include the field. Schema version remains compatible (additive change).

## R3: API Endpoint Design

**Decision**: `GET /api/training/[tenant]/evidence/[sessionId]/pdf`

**Rationale**: Follows the existing REST pattern where the evidence resource is at `/evidence/[sessionId]` and the PDF is a representation of that resource. Using GET (not POST) because PDF generation is idempotent and read-only — it renders existing evidence data without side effects.

**Response**: Binary PDF with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="evidence-{tenantId}-{employeeId}-{sessionId}.pdf"`.

**Error responses**: Standard JSON error format (`{ error, message }`) matching existing route patterns.

## R4: Authentication and Authorization

**Decision**: Reuse the existing header-based auth pattern (`x-tenant-id`, `x-employee-id`, `x-employee-role`). Admin role required for export (same as evidence list endpoint).

**Rationale**: The evidence list and retrieve endpoints already gate access by role. PDF export carries the same sensitivity level, so the same authorization model applies. Employees see only their own evidence; admins can export any session within their tenant.

## R5: PDF Document Structure

**Decision**: Single-page-flow document with the following sections:

1. **Header**: Tenant branding (display name), document title "Training Evidence Certificate", generation timestamp
2. **Employee & Session Info**: Employee ID, tenant ID, training type, session dates, attempt number
3. **Outcome Summary**: Pass/fail badge, aggregate score, pass threshold, weak areas
4. **Module Summary Table**: Module title, topic area, score per module
5. **Quiz Detail Per Module**: Question text, selected answer, score, LLM rationale (for free-text)
6. **Policy Attestation**: Config hash, role profile ID/version, app version, pass threshold, max attempts
7. **Integrity Footer**: Content hash (SHA-256), schema version, evidence generation timestamp, evidence ID

**Rationale**: This structure mirrors audit document conventions — identification first, outcome summary for quick review, detailed evidence for deep inspection, integrity verification at the end. Variable-length content (modules, questions) flows naturally with page breaks as needed.

## R6: Error Handling and Retry

**Decision**: PDF generation errors return HTTP 500 with `{ error: "pdf_generation_failed", message: "<specific reason>" }`. The endpoint is stateless and idempotent, so retrying is simply re-requesting the same URL.

**Rationale**: Since no state is modified during PDF generation (evidence is read-only, PDF is not persisted), any failure is safe to retry. The client receives a clear error code that distinguishes PDF generation failures from auth or not-found errors.
