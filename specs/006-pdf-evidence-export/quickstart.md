# Quickstart: PDF Evidence Export

**Branch**: `006-pdf-evidence-export` | **Date**: 2026-02-21

## Prerequisites

- Node.js 20.9+
- pnpm installed
- `.env` configured (see `.env.example`)
- At least one tenant configured with training data

## Setup

```bash
# Switch to feature branch
git checkout 006-pdf-evidence-export

# Install dependencies (includes new pdfkit dependency)
pnpm install

# Run tests
pnpm test
```

## New Dependency

```bash
pnpm add pdfkit
pnpm add -D @types/pdfkit
```

## New Files

| File | Purpose |
|------|---------|
| `src/evidence/pdf-renderer.ts` | PDF document renderer — converts TrainingEvidence to PDF buffer |
| `app/api/training/[tenant]/evidence/[sessionId]/pdf/route.ts` | API route handler for PDF export |
| `tests/unit/evidence/pdf-renderer.spec.ts` | Unit tests for PDF rendering logic |
| `tests/contract/evidence/pdf-export-api.spec.ts` | Contract tests for the PDF export endpoint |

## Modified Files

| File | Change |
|------|--------|
| `src/evidence/schemas.ts` | Add optional `trainingType` field to EvidenceBodySchema |

## Usage

### Generate a PDF

```bash
curl -X GET \
  http://localhost:3000/api/training/acme/evidence/{sessionId}/pdf \
  -H "x-tenant-id: acme" \
  -H "x-employee-id: emp-123" \
  -H "x-employee-role: admin" \
  -o evidence.pdf
```

### Expected Response

- **Success**: Binary PDF with `Content-Type: application/pdf`
- **Not found**: `404` with `{ error: "not_found", message: "..." }`
- **Not completed**: `409` with `{ error: "conflict", message: "..." }`
- **Auth failure**: `401` with `{ error: "unauthorized", message: "..." }`
- **Generation failure**: `500` with `{ error: "pdf_generation_failed", message: "..." }`

## Testing

```bash
# Run unit tests for PDF renderer
pnpm test:unit -- --grep "pdf-renderer"

# Run contract tests for PDF API
pnpm test -- --grep "pdf-export"

# Run all tests
pnpm test
```
