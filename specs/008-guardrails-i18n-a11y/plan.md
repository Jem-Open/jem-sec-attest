# Implementation Plan: Platform Guardrails, i18n & Accessibility

**Branch**: `008-guardrails-i18n-a11y` | **Date**: 2026-02-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-guardrails-i18n-a11y/spec.md`

## Summary

Add platform guardrails (secret redaction in AI transcripts, immutable audit trail, per-tenant retention controls), internationalization foundations (externalized locale files with English default and French sample), and accessibility improvements (keyboard navigation, screen reader support, semantic HTML) across the training flow.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict mode), Node.js 20.9+
**Primary Dependencies**: Next.js 16.x (App Router), React 19.x, Vercel AI SDK v6, Zod v4.x
**Storage**: SQLite via `better-sqlite3` through `StorageAdapter` interface
**Testing**: Vitest with projects: `unit`, `integration`, `contract`
**Target Platform**: Node.js server (self-hosted or cloud), modern browsers
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Redaction adds <10ms per transcript write; audit events written within 1s of action
**Constraints**: No new runtime dependencies for i18n (lightweight custom implementation); no component library for a11y (native HTML + ARIA)
**Scale/Scope**: Multi-tenant, existing ~3 pages, ~7 API route groups

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Configuration-as-Code Only | PASS | Retention config in tenant YAML. No admin portal. |
| II. Deterministic, Audit-Friendly | PASS | Audit events are structured records with typed metadata. |
| III. Security-First, Multi-Tenant | PASS | All audit events tenant-scoped. Redaction removes secrets before storage. |
| IV. Minimal Data Collection | PASS | Transcripts redacted, retention purge hard-deletes content. `enabled: false` prevents storage entirely. |
| V. Pluggable Architecture | PASS | SecretRedactor and AuditLogger are interfaces. No cloud-specific assumptions. |
| VI. Accessibility & Localization | PASS | Core feature — externalized strings, WCAG 2.1 AA, keyboard nav, screen readers. |
| VII. Quality Gates | PASS | Unit tests for redactor patterns, contract tests for audit events, integration tests for purge. |
| VIII. Documentation Required | PASS | quickstart.md, config examples, security guidance included. |
| IX. Technology Stack | PASS | Next.js App Router, no new frameworks. |

**Gate result**: ALL PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/008-guardrails-i18n-a11y/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 developer quickstart
├── contracts/
│   ├── audit-events.md  # Audit event internal contract
│   ├── redaction.md     # Secret redaction internal contract
│   ├── retention.md     # Transcript retention contract
│   └── i18n.md          # Internationalization contract
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── guardrails/
│   ├── secret-redactor.ts      # SecretRedactor implementation
│   └── secret-patterns.ts      # Regex patterns per secret category
├── audit/
│   ├── audit-logger.ts         # AuditLogger service (immutable writes)
│   └── audit-types.ts          # Event types, metadata schemas
├── i18n/
│   ├── index.ts                # useTranslation hook + getTranslation
│   └── locales/
│       ├── en.json             # English (canonical, complete)
│       └── fr.json             # French (sample)
├── retention/
│   └── transcript-purger.ts    # Purge logic for expired transcripts
├── config/
│   └── schema.ts               # Extended with transcripts retention fields
├── auth/
│   └── audit.ts                # Existing — refactor to use AuditLogger
├── training/
│   └── audit.ts                # Existing — refactor to use AuditLogger

app/
├── layout.tsx                   # Dynamic lang attribute from locale
├── [tenant]/
│   ├── auth/signin/page.tsx    # A11y improvements (labels, landmarks)
│   ├── dashboard/page.tsx      # A11y improvements (landmarks, headings)
│   └── training/page.tsx       # Extract STRINGS to i18n, a11y audit
├── api/
│   ├── training/[tenant]/
│   │   └── evidence/[sessionId]/pdf/route.ts  # Add export audit event
│   └── admin/
│       └── purge-transcripts/route.ts         # New: cron-triggered purge

tests/
├── unit/
│   ├── guardrails/             # SecretRedactor pattern tests
│   ├── audit/                  # AuditLogger tests
│   ├── i18n/                   # Translation lookup, fallback tests
│   └── retention/              # Purge logic tests
├── integration/
│   └── retention/              # Purge with real SQLite
└── contract/
    └── audit/                  # Audit event schema validation
```

**Structure Decision**: Extends the existing `src/` structure with new domain modules (`guardrails/`, `audit/`, `i18n/`, `retention/`). Follows the established pattern of domain-scoped directories under `src/`.

## Complexity Tracking

No constitution violations to justify.

## Implementation Phases

### Phase A: Secret Redaction (P1 — FR-001, FR-002, FR-003)

1. Create `src/guardrails/secret-patterns.ts` — regex patterns for each secret category with typed marker mapping
2. Create `src/guardrails/secret-redactor.ts` — `SecretRedactor` class that applies all patterns, returns `RedactionResult`
3. Integrate redactor into training module write paths:
   - `app/api/training/[tenant]/` quiz and scenario submission routes — redact `freeTextResponse` before `storage.update()`
   - Redact `llmRationale` from AI responses before storage
4. Unit tests: pattern matching for each secret type, edge cases (multiline, partial, no-match)

### Phase B: Immutable Audit Trail (P1 — FR-004 through FR-009)

1. Create `src/audit/audit-types.ts` — unified `AuditEventType` union, metadata schemas per event type
2. Create `src/audit/audit-logger.ts` — `AuditLogger` wrapping `storage.create()` for `audit_events`, no update/delete
3. Refactor `src/auth/audit.ts` to delegate to `AuditLogger` (preserve existing event factories)
4. Refactor `src/training/audit.ts` to delegate to `AuditLogger`
5. Add `evidence-exported` event to PDF export route
6. Add `integration-push-success` / `integration-push-failure` events to compliance orchestrator
7. Contract tests: validate all event types produce correct schema
8. Unit tests: verify AuditLogger rejects update/delete attempts

### Phase C: Tenant Retention Controls (P2 — FR-010 through FR-013)

1. Extend `src/config/schema.ts` — add `transcripts` to `RetentionSchema` with `enabled` and `retentionDays`
2. Update `config/defaults.yaml` with default retention settings
3. Create `src/retention/transcript-purger.ts` — purge function that queries modules by age, skips active sessions
4. Integrate `enabled: false` check into training module write paths — null out free-text fields before storage
5. Create `app/api/admin/purge-transcripts/route.ts` — cron-triggered endpoint
6. Integration tests: purge with real SQLite, verify active sessions skipped, verify hard delete

### Phase D: Internationalization (P2 — FR-014 through FR-018)

1. Create `src/i18n/locales/en.json` — extract all strings from existing pages
2. Create `src/i18n/index.ts` — `useTranslation()` hook and `getTranslation()` server function
3. Create `src/i18n/locales/fr.json` — sample French translations (partial)
4. Refactor `app/[tenant]/training/page.tsx` — replace `STRINGS` constant with `useTranslation()` calls
5. Refactor `app/[tenant]/auth/signin/page.tsx` — externalize hardcoded strings
6. Refactor `app/[tenant]/dashboard/page.tsx` — externalize hardcoded strings
7. Update `app/layout.tsx` — dynamic `<html lang={locale}>` based on cookie/header
8. Unit tests: key lookup, fallback to English, interpolation, missing key handling

### Phase E: Accessibility (P2 — FR-019 through FR-024)

1. Audit and fix `app/[tenant]/auth/signin/page.tsx` — add form labels, landmarks, heading hierarchy
2. Audit and fix `app/[tenant]/dashboard/page.tsx` — add landmarks, heading hierarchy, focus management
3. Audit and verify `app/[tenant]/training/page.tsx` — verify existing ARIA attributes are correct, add any missing landmarks
4. Add skip-navigation link to layout
5. Verify color contrast and non-color indicators for pass/fail states
6. Unit/integration tests: render components and assert ARIA attributes, landmark roles, heading hierarchy
