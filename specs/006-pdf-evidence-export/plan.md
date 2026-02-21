# Implementation Plan: PDF Evidence Export

**Branch**: `006-pdf-evidence-export` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-pdf-evidence-export/spec.md`

## Summary

Add a PDF export endpoint for training evidence records. Auditors can download a professionally formatted PDF containing employee identity, tenant info, training type, completion date, pass/fail outcome, quiz summaries, policy attestations, and integrity hashes. Uses `pdfkit` for server-side PDF generation from existing immutable evidence records. The PDF is generated on-demand and not persisted.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20.9+
**Primary Dependencies**: Next.js 16.x (App Router), pdfkit (new), Zod v4.x
**Storage**: SQLite via `better-sqlite3` through `StorageAdapter` — read-only access for this feature
**Testing**: Vitest with projects: unit, integration, contract
**Target Platform**: Node.js server (Next.js API routes)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: PDF generation within 5 seconds for sessions with up to 20 modules
**Constraints**: No external binary dependencies (no Chromium/wkhtmltopdf), Apache 2.0 license compatibility
**Scale/Scope**: Single new API endpoint, one new source module, schema additive change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Configuration-as-Code Only | PASS | No admin portal. No new configuration files needed. |
| II. Deterministic, Audit-Friendly | PASS | PDF renders from immutable evidence with version hashes. Same evidence produces equivalent PDFs. |
| III. Security-First, Multi-Tenant | PASS | Endpoint enforces tenant scoping via existing auth pattern. Evidence queries filter by tenantId. |
| IV. Minimal Data Collection | PASS | No new data persisted. PDF generated on-demand from existing evidence. |
| V. Pluggable Architecture | PASS | pdfkit is a library, not a hosted service. Constitution already lists "PDF rendering" as an adapter point. Future: could extract a PdfRenderer interface. |
| VI. Accessibility & Localization | PASS | PDF uses externalized strings. Document structure supports screen reader-friendly PDF tags. |
| VII. Quality Gates | PASS | Unit tests for renderer, contract tests for API endpoint. |
| VIII. Documentation Required | PASS | quickstart.md documents setup and usage. OpenAPI contract published. |
| IX. Technology Stack | PASS | Uses Next.js App Router for the API route. No AI SDK needed (PDF is not AI-generated). |
| Apache 2.0 Licensing | PASS | pdfkit is MIT licensed — compatible with Apache 2.0. |

**Post-Phase-1 re-check**: All gates still pass. The additive `trainingType` schema change is backward-compatible and does not affect evidence integrity (contentHash covers the evidence body).

## Project Structure

### Documentation (this feature)

```text
specs/006-pdf-evidence-export/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: entity documentation
├── quickstart.md        # Phase 1: setup and usage guide
├── contracts/           # Phase 1: OpenAPI contract
│   └── pdf-export.yaml
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── evidence/
│   ├── schemas.ts          # Modified: add optional trainingType to EvidenceBodySchema
│   ├── pdf-renderer.ts     # New: PDF document generation from TrainingEvidence
│   ├── evidence-repository.ts  # Existing: used to fetch evidence records
│   └── hash.ts             # Existing: content hash verification
app/
├── api/
│   └── training/
│       └── [tenant]/
│           └── evidence/
│               └── [sessionId]/
│                   └── pdf/
│                       └── route.ts  # New: GET handler for PDF export
tests/
├── unit/
│   └── evidence/
│       └── pdf-renderer.spec.ts  # New: renderer unit tests
└── contract/
    └── evidence/
        └── pdf-export-api.spec.ts  # New: API contract tests
```

**Structure Decision**: Follows existing project layout. New files are placed alongside existing evidence module files. The API route nests under the existing evidence route path.

## Complexity Tracking

No constitution violations to justify. All principles pass cleanly.
