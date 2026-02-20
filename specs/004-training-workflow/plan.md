# Implementation Plan: Guided Training Workflow

**Branch**: `004-training-workflow` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-training-workflow/spec.md`

## Summary

Implement a guided, hybrid training workflow where authenticated employees with confirmed role profiles complete LLM-generated training modules, scenarios, and quizzes. The workflow is modeled as an explicit state machine (Constitution II). A curriculum outline is generated upfront via a single `generateObject()` call; detailed module content is generated on-demand as the employee enters each module. Quizzes and scenarios use a dual evaluation model: multiple-choice scored numerically, free-text scored by LLM with numeric values. An aggregate score >= 70% yields a pass; failure triggers targeted remediation (max 3 total attempts). All state is persisted server-side after each interaction for resilience to refresh/retry.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20.9+
**Primary Dependencies**: Next.js 16.x (App Router), React 19.x, `ai` v6.x (Vercel AI SDK), `zod` v4.x, `iron-session` v8.x, `better-sqlite3` v11.x
**Storage**: SQLite via existing `StorageAdapter` — new collections: `training_sessions`, `training_modules`, `audit_events` (existing)
**Testing**: Vitest (unit + integration), contract tests for new API routes
**Target Platform**: Web (server-rendered Next.js + client-side React)
**Project Type**: Web application (Next.js App Router — unified frontend/backend)
**Performance Goals**: Module content generation < 15s per module; page transitions < 500ms; quiz submission + scoring < 5s for multiple-choice, < 10s for LLM-evaluated free-text
**Constraints**: All LLM outputs schema-constrained via `generateObject()` (Constitution II); tenant-scoped data access (Constitution III); no raw training content in audit logs (Constitution IV)
**Scale/Scope**: 50 concurrent employees across multiple tenants (SC-008); max 8 modules per curriculum; max 3 attempts per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Configuration-as-Code Only | PASS | No admin portal. Training workflow config (pass threshold, max attempts, max modules) read from tenant YAML config. No new admin UI. |
| II. Deterministic, Audit-Friendly Behavior | PASS | All LLM outputs constrained by Zod schemas via `generateObject()`. Training workflow modeled as explicit state machine with named states and defined transitions. Session records include configHash + role profile version. |
| III. Security-First & Multi-Tenant Isolation | PASS | All storage queries tenant-scoped via `StorageAdapter`. Auth via existing `x-tenant-id`/`x-employee-id` middleware headers. Employee responses treated as untrusted input in LLM evaluation prompts. |
| IV. Minimal Data Collection | PASS | Audit events log event types, IDs, and scores only — no raw training content or employee free-text answers in audit logs. Generated training content is ephemeral after module completion (only scores persisted in aggregate). |
| V. Pluggable Architecture | PASS | Reuses existing `ai-model-resolver` for provider abstraction. Storage via `StorageAdapter` interface. No hard-coded cloud assumptions. |
| VI. Accessibility & Localization | PASS | All UI strings in externalized `STRINGS` const. WCAG 2.1 AA: keyboard navigation, `aria-live` regions for loading/results, semantic HTML, no color-only indicators. |
| VII. Quality Gates | PASS | State machine transitions tested. API contract tests for all new routes. Module generation, scoring, and evaluation tested with mocked LLM. |
| VIII. Documentation Required | PASS | quickstart.md ships with feature. Tenant config schema for training settings documented with example YAML. |
| IX. Technology Stack | PASS | Next.js App Router for pages + API routes. AI SDK `generateObject()` for all LLM interactions. |

No violations. Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-training-workflow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── training-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── training/
│   ├── index.ts                    # Public exports
│   ├── types.ts                    # TypeScript type re-exports
│   ├── schemas.ts                  # Zod schemas for all training entities
│   ├── state-machine.ts            # Session state machine (states, transitions, guards)
│   ├── curriculum-generator.ts     # LLM: generate curriculum outline
│   ├── module-generator.ts         # LLM: generate module content (instruction, scenarios, quiz)
│   ├── evaluator.ts                # Scoring: MC numeric + LLM free-text evaluation
│   ├── score-calculator.ts         # Aggregate score computation + pass/fail logic
│   ├── remediation-planner.ts      # Identify weak areas + generate remediation curriculum
│   ├── session-repository.ts       # CRUD for training sessions + modules (StorageAdapter)
│   └── audit.ts                    # Training-specific audit event logging
│
app/
├── [tenant]/
│   └── training/
│       └── page.tsx                # Client component — training workflow UI
│
└── api/
    └── training/
        └── [tenant]/
            ├── session/
            │   └── route.ts        # GET current session, POST start new session
            ├── abandon/
            │   └── route.ts        # POST abandon session
            ├── module/
            │   └── [moduleIndex]/
            │       ├── content/
            │       │   └── route.ts    # POST generate module content
            │       ├── scenario/
            │       │   └── route.ts    # POST submit scenario response
            │       └── quiz/
            │           └── route.ts    # POST submit quiz answers
            └── evaluate/
                └── route.ts        # POST trigger final evaluation

tests/
├── unit/
│   └── training/
│       ├── state-machine.spec.ts
│       ├── score-calculator.spec.ts
│       ├── curriculum-generator.spec.ts
│       ├── module-generator.spec.ts
│       ├── evaluator.spec.ts
│       └── remediation-planner.spec.ts
├── integration/
│   └── training/
│       ├── session-repository.spec.ts
│       └── workflow.spec.ts
└── contract/
    └── training/
        └── api-routes.spec.ts
```

**Structure Decision**: Follows established single-project structure with `src/training/` module mirroring `src/intake/` patterns. API routes follow Next.js App Router conventions under `app/api/training/[tenant]/`. Client page at `app/[tenant]/training/page.tsx`.
