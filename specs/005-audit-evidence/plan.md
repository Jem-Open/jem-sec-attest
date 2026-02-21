# Implementation Plan: Audit-Ready Training Evidence

**Branch**: `005-audit-evidence` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-audit-evidence/spec.md`

## Summary

Add audit-ready evidence generation for completed training sessions. When a session reaches a terminal state (passed, exhausted, or abandoned), the system automatically assembles a comprehensive evidence record containing quiz questions, employee answers, scoring rationales, pass/fail determination, and policy attestations with timestamps. Evidence is versioned (schema version 1), includes a SHA-256 content hash for tamper detection, and is immutable once created. Three API endpoints provide retrieval (by session ID), listing (with filters, admin-only), and manual generation (for retry after failure, admin-only). Role-based access control ensures employees see only their own evidence while compliance/admin users have tenant-wide access.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20.9+
**Primary Dependencies**: Next.js 16.x (App Router), Zod v4.x, `better-sqlite3`, `crypto` (Node.js built-in)
**Storage**: SQLite via `StorageAdapter` interface — new `"evidence"` collection
**Testing**: Vitest with projects: unit, integration, contract
**Target Platform**: Node.js server (Next.js App Router)
**Project Type**: Web application (Next.js)
**Performance Goals**: Evidence generation < 5 seconds; retrieval < 2 seconds (SC-001, SC-003)
**Constraints**: No new infrastructure (no background jobs, event buses, or external services). Fire-and-forget pattern for generation. Immutable records (no update/delete).
**Scale/Scope**: One evidence record per completed session. Admin list queries expected low volume (< 1000 records per tenant query).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Configuration-as-Code Only | PASS | No admin portal. Evidence config uses existing tenant YAML settings (passThreshold, maxAttempts, retention). |
| II. Deterministic, Audit-Friendly Behavior | PASS | Evidence is the core of this feature. Schema-constrained via Zod. Version hashes for config, role profile, and app version included per constitution requirement. |
| III. Security-First and Multi-Tenant Isolation | PASS | Tenant scoping on all queries. Role-based access control (employee self-access vs. compliance/admin). No secrets or PII beyond what's strictly necessary in evidence. |
| IV. Minimal Data Collection | PASS | Evidence stores question text and employee answers (necessary for audit). Does NOT store correct answers, rubrics, or raw LLM prompts. Follows tenant retention policy. |
| V. Pluggable Architecture | PASS | Uses existing StorageAdapter interface. No hard-coded hosting assumptions. |
| VI. Accessibility and Localization | N/A | No user-facing UI in this feature (API endpoints only). |
| VII. Quality Gates | PASS | Unit, integration, and contract tests planned. Evidence integrity verification tests included. |
| VIII. Documentation Required | PASS | Quickstart.md, data-model.md, and OpenAPI contract included. |
| IX. Technology Stack | PASS | Next.js App Router for API routes. No AI SDK usage needed (evidence assembly is deterministic). |

**Post-Phase 1 Re-check**: All principles still pass. No design changes introduced violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-audit-evidence/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: implementation overview
├── contracts/
│   └── evidence-api.yaml  # Phase 1: OpenAPI contract
├── checklists/
│   └── requirements.md    # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
  evidence/
    schemas.ts              # Zod schemas: TrainingEvidence, EvidenceBody, nested types
    evidence-repository.ts  # Repository: create, findBySessionId, findById, listByTenant
    evidence-generator.ts   # Assembly: session + modules → evidence record + content hash
    hash.ts                 # SHA-256 canonical JSON hashing utility

app/
  api/
    training/[tenant]/
      evidence/
        route.ts            # GET: list evidence (compliance/admin only)
        [sessionId]/
          route.ts          # GET: retrieve evidence by session ID
          generate/
            route.ts        # POST: manual generation trigger (compliance/admin only)

tests/
  unit/
    evidence/
      evidence-generator.spec.ts
      evidence-repository.spec.ts
      evidence-route.spec.ts
      evidence-list-route.spec.ts
      evidence-generate-route.spec.ts
      hash.spec.ts
  integration/
    evidence/
      evidence-workflow.spec.ts
  contract/
    evidence/
      evidence-schema.spec.ts
```

**Structure Decision**: Follows existing project convention — domain logic in `src/evidence/`, API routes in `app/api/training/[tenant]/evidence/`, tests mirroring source structure. This is consistent with `src/training/` and `app/api/training/[tenant]/` patterns.

## Complexity Tracking

No constitution violations to justify. The design uses existing patterns (StorageAdapter, repository, fire-and-forget audit-style calls) without introducing new infrastructure or abstractions.
