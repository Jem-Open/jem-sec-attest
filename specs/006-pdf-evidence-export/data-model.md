# Data Model: PDF Evidence Export

**Branch**: `006-pdf-evidence-export` | **Date**: 2026-02-21

## Entities

### TrainingEvidence (existing — no changes)

The PDF is generated from the existing `TrainingEvidence` entity. No schema modifications are required for the core evidence record.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique evidence record identifier |
| tenantId | string | Tenant scope |
| sessionId | UUID | Reference to training session |
| employeeId | string | Employee who completed training |
| schemaVersion | number | Evidence schema version (currently 1) |
| evidence | EvidenceBody | Nested evidence content |
| contentHash | string | SHA-256 of canonical JSON body |
| generatedAt | ISO datetime | When evidence was generated |

### EvidenceBody (existing — additive change)

| Field | Type | Description |
|-------|------|-------------|
| session | SessionSummary | Session metadata |
| policyAttestation | PolicyAttestation | Config and version attestation |
| modules | ModuleEvidence[] | Per-module evidence |
| outcome | OutcomeSummary | Final pass/fail and scores |
| trainingType | string (optional, new) | "onboarding" \| "annual" \| "other" |

**Note**: `trainingType` is an additive optional field. Existing evidence records without it remain valid. The PDF renderer displays "Not specified" when absent.

### SessionSummary (existing — no changes)

| Field | Type | Description |
|-------|------|-------------|
| sessionId | UUID | Session identifier |
| employeeId | string | Employee identifier |
| tenantId | string | Tenant scope |
| attemptNumber | number (1-3) | Current attempt |
| totalAttempts | number | Max attempts configured |
| status | "passed" \| "exhausted" \| "abandoned" | Terminal status |
| createdAt | ISO datetime | Session start |
| completedAt | ISO datetime | Session end |

### PolicyAttestation (existing — no changes)

| Field | Type | Description |
|-------|------|-------------|
| configHash | string | Tenant config snapshot hash |
| roleProfileId | string | Role profile identifier |
| roleProfileVersion | number | Role profile version |
| appVersion | string | Application version |
| passThreshold | number (0-1) | Pass threshold |
| maxAttempts | number | Configured max attempts |

### OutcomeSummary (existing — no changes)

| Field | Type | Description |
|-------|------|-------------|
| aggregateScore | number (0-1) \| null | Overall score |
| passed | boolean \| null | Pass/fail (null if abandoned) |
| passThreshold | number (0-1) | Threshold for passing |
| weakAreas | string[] \| null | Identified weak areas |
| moduleScores | { moduleIndex, title, score }[] | Per-module breakdown |

### ModuleEvidence (existing — no changes)

| Field | Type | Description |
|-------|------|-------------|
| moduleIndex | number (0-19) | Position in curriculum |
| title | string | Module title |
| topicArea | string | Topic area |
| moduleScore | number (0-1) \| null | Module score |
| scenarios | ScenarioEvidence[] | Scenario responses |
| quizQuestions | QuizQuestionEvidence[] | Quiz responses |
| completedAt | ISO datetime \| null | Module completion time |

### QuizQuestionEvidence (existing — no changes)

| Field | Type | Description |
|-------|------|-------------|
| questionId | string | Question identifier |
| questionText | string | The question |
| responseType | "multiple-choice" \| "free-text" | Response type |
| options | { key, text }[] \| undefined | Answer options (MC only) |
| employeeAnswer | AnswerEvidence | Employee's response (score, rationale, etc.) |

## New Entity: PDF Generation Context (runtime only, not persisted)

This is an in-memory object assembled at render time — it is NOT stored in the database.

| Field | Type | Description |
|-------|------|-------------|
| evidence | TrainingEvidence | The evidence record to render |
| tenantDisplayName | string | From tenant config branding |
| generatedAt | ISO datetime | PDF generation timestamp |

## Relationships

```
TrainingEvidence (1) --renders--> (1) PDF Document (not persisted)
TrainingEvidence.tenantId --resolves--> Tenant.id (for display name)
```

## State Transitions

No state transitions. PDF generation is a read-only operation on immutable evidence records.
