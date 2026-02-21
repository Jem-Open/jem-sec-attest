# Implementation Plan: Compliance Evidence Integration

**Branch**: `007-evidence-integration` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-evidence-integration/spec.md`

## Summary

Integrate automatic compliance evidence upload to Sprinto (and future providers) when training sessions complete. The system renders evidence as PDF, uploads via Sprinto's GraphQL multipart API, retries transient failures in-process with exponential backoff, and records upload outcomes. Configured per-tenant via YAML with a pluggable provider architecture.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20.9+
**Primary Dependencies**: Next.js 16.x (App Router), pdfkit (existing), node `fetch` (native)
**Storage**: SQLite via `better-sqlite3` through `StorageAdapter` interface — new `compliance_uploads` collection
**Testing**: Vitest with projects: unit, integration, contract
**Target Platform**: Node.js server (Next.js)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Upload completes within 10 minutes of evidence generation under normal conditions (SC-001)
**Constraints**: In-process retries only (no persistent job queue); max ~5 min retry window; fire-and-forget from training flow
**Scale/Scope**: Low volume — tens to hundreds of uploads per month per tenant

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Configuration-as-Code Only | PASS | Compliance config in tenant YAML; secrets via `${VAR}` env var references; no admin portal |
| II. Deterministic, Audit-Friendly | PASS | Upload status recorded with timestamps, attempt counts, error details; evidence includes version hashes |
| III. Security-First & Multi-Tenant | PASS | All queries scoped by tenantId; API keys stored as env var references, never in config files; ComplianceUpload records tenant-isolated |
| IV. Minimal Data Collection | PASS | Only upload metadata stored (status, errors, timestamps); no additional PII persisted |
| V. Pluggable Architecture | PASS | `ComplianceProvider` interface with `SprintoProvider` as first implementation; new providers added without orchestrator changes |
| VI. Accessibility & Localization | N/A | Backend-only feature; no new UI components |
| VII. Quality Gates | PASS | Contract tests for provider interface; unit tests for orchestrator retry logic; integration tests for end-to-end flow |
| VIII. Documentation Required | PASS | Quickstart guide, example YAML config, contract documentation all generated |
| IX. Technology Stack | PASS | Uses Next.js App Router conventions; no new framework dependencies |
| Licensing | PASS | Apache 2.0 headers on all new source files; no new dependencies with incompatible licenses |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-evidence-integration/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Sprinto API research, config decisions
├── data-model.md        # Phase 1: ComplianceUpload entity, config schema
├── quickstart.md        # Phase 1: Setup and verification guide
├── contracts/
│   ├── compliance-provider.ts  # Provider interface contract
│   └── sprinto-graphql.md      # Sprinto API contract details
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── compliance/                    # NEW — compliance integration module
│   ├── types.ts                   # ComplianceProvider interface, UploadResult, config types
│   ├── schemas.ts                 # Zod schemas for ComplianceUpload and config validation
│   ├── orchestrator.ts            # Upload orchestration with retry logic
│   ├── upload-repository.ts       # ComplianceUpload CRUD via StorageAdapter
│   └── providers/
│       └── sprinto.ts             # Sprinto GraphQL multipart upload adapter
├── config/
│   └── schema.ts                  # MODIFIED — extend integrations with compliance block
├── evidence/
│   └── evidence-generator.ts      # MODIFIED — dispatch compliance upload after create
└── ...

tests/
├── unit/
│   └── compliance/
│       ├── orchestrator.test.ts   # Retry logic, error classification, idempotency
│       ├── sprinto-provider.test.ts # GraphQL request formatting, response parsing
│       └── upload-repository.test.ts # CRUD operations
├── integration/
│   └── compliance/
│       └── evidence-upload.test.ts # End-to-end: evidence → PDF → mock Sprinto → status
└── contract/
    └── compliance/
        └── provider-contract.test.ts # ComplianceProvider interface compliance
```

**Structure Decision**: New `src/compliance/` module follows the existing pattern of domain modules (`src/evidence/`, `src/training/`, `src/auth/`). Provider implementations are nested under `providers/` for extensibility. Tests mirror the source structure under existing test tier directories.

## Complexity Tracking

> No constitution violations to justify.

N/A — all gates passed without violations.
