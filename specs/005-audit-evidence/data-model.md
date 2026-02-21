# Data Model: Audit-Ready Training Evidence

**Feature**: 005-audit-evidence
**Date**: 2026-02-20

## Entity: TrainingEvidence

The primary audit evidence record. One per completed training session (1:1 with TrainingSession). Stored in the `"evidence"` collection.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID string | Yes | Auto-generated primary key |
| `tenantId` | string | Yes | Tenant scope (matches session.tenantId) |
| `sessionId` | string (UUID) | Yes | Reference to the completed TrainingSession. Unique per tenant — only one evidence record per session. |
| `employeeId` | string | Yes | Employee who completed the training |
| `schemaVersion` | integer | Yes | Evidence schema version (starts at 1). Used for forward-compatible evolution. |
| `evidence` | EvidenceBody (object) | Yes | The canonical evidence payload (see below). This is the content that is hashed. |
| `contentHash` | string | Yes | SHA-256 hex digest computed over the canonical JSON of the `evidence` field |
| `generatedAt` | ISO 8601 datetime string | Yes | When the evidence record was created |

### Uniqueness Constraint

`(tenantId, sessionId)` — enforced at application level via idempotency check before creation.

### Immutability

No update or delete operations are exposed through the repository. Once created, an evidence record is permanent.

---

## Nested Object: EvidenceBody

The canonical payload within `TrainingEvidence.evidence`. All audit-relevant data is contained here.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `session` | SessionSummary | Session-level metadata |
| `policyAttestation` | PolicyAttestation | Configuration and version linkage |
| `modules` | ModuleEvidence[] | Per-module breakdown with questions, answers, scores |
| `outcome` | OutcomeSummary | Final determination |

---

## Nested Object: SessionSummary

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string (UUID) | Training session ID |
| `employeeId` | string | Employee identifier |
| `tenantId` | string | Tenant identifier |
| `attemptNumber` | integer (≥1, tenant-configurable) | Which attempt this terminal state represents |
| `totalAttempts` | integer (≥1, tenant-configurable) | Total attempts made (equals attemptNumber at terminal state) |
| `status` | "passed" \| "exhausted" \| "abandoned" | Terminal status |
| `createdAt` | ISO datetime | Session start time |
| `completedAt` | ISO datetime \| null | Session completion time (null only if abandoned before evaluation) |

---

## Nested Object: PolicyAttestation

Links the evidence to the exact policy configuration that governed the session.

| Field | Type | Description |
|-------|------|-------------|
| `configHash` | string | Hash of tenant configuration at session creation time (from session.configHash) |
| `roleProfileId` | string | Role profile used for curriculum generation |
| `roleProfileVersion` | integer | Version of the role profile |
| `appVersion` | string | Application version that produced the training (from session.appVersion) |
| `passThreshold` | number (0.0-1.0) | Pass threshold applied for evaluation |
| `maxAttempts` | integer | Maximum attempts configured |

---

## Nested Object: ModuleEvidence

Per-module audit trail. One entry per module in the session.

| Field | Type | Description |
|-------|------|-------------|
| `moduleIndex` | integer (0-based) | Module position in curriculum |
| `title` | string | Module title |
| `topicArea` | string | Topic area covered |
| `moduleScore` | number (0.0-1.0) \| null | Final module score (null if not scored, e.g., abandoned) |
| `scenarios` | ScenarioEvidence[] | Scenario prompts and responses |
| `quizQuestions` | QuizQuestionEvidence[] | Quiz questions and answers |
| `completedAt` | ISO datetime \| null | When the module reached "scored" status (from module.updatedAt when status is "scored") |

---

## Nested Object: ScenarioEvidence

| Field | Type | Description |
|-------|------|-------------|
| `scenarioId` | string | Scenario identifier |
| `narrative` | string | Scenario prompt text shown to the employee |
| `responseType` | "multiple-choice" \| "free-text" | Type of response expected |
| `options` | { key: string, text: string }[] \| undefined | MC options shown (without `correct` field) |
| `employeeAnswer` | AnswerEvidence | The employee's response |

---

## Nested Object: QuizQuestionEvidence

| Field | Type | Description |
|-------|------|-------------|
| `questionId` | string | Question identifier |
| `questionText` | string | Question text shown to the employee |
| `responseType` | "multiple-choice" \| "free-text" | Type of response expected |
| `options` | { key: string, text: string }[] \| undefined | MC options shown (without `correct` field) |
| `employeeAnswer` | AnswerEvidence | The employee's response |

---

## Nested Object: AnswerEvidence

| Field | Type | Description |
|-------|------|-------------|
| `selectedOption` | string \| undefined | Selected MC option key (if multiple-choice) |
| `freeTextResponse` | string \| undefined | Free-text answer (if free-text, max 2000 chars) |
| `score` | number (0.0-1.0) | Score awarded |
| `llmRationale` | string \| undefined | Scoring rationale from LLM evaluation (free-text only) |
| `submittedAt` | ISO datetime | When the answer was submitted |

---

## Nested Object: OutcomeSummary

| Field | Type | Description |
|-------|------|-------------|
| `aggregateScore` | number (0.0-1.0) \| null | Final aggregate score (null if abandoned before evaluation) |
| `passed` | boolean \| null | Whether the employee passed (null if abandoned/not evaluated) |
| `passThreshold` | number (0.0-1.0) | Threshold applied |
| `weakAreas` | string[] \| null | Topic areas below threshold (if failed/exhausted) |
| `moduleScores` | { moduleIndex: number, title: string, score: number \| null }[] | Per-module score summary |

---

## Collection: `"evidence"`

Stored using the existing `StorageAdapter` generic collection pattern.

### Query Patterns

| Operation | Method | Filter |
|-----------|--------|--------|
| Find by session | `findMany` | `where: { sessionId }` |
| Find by employee | `findMany` | `where: { employeeId }`, `orderBy: [{ field: "generatedAt", direction: "desc" }]` |
| List for tenant | `findMany` | `orderBy: [{ field: "generatedAt", direction: "desc" }]`, `limit`, `offset` |
| Find by ID | `findById` | Direct ID lookup |

### Filtering (List Endpoint)

Date range filtering (`generatedAt` between start and end) is not natively supported by the `QueryFilter.where` (equality only). Options:
- **Option A**: Post-filter in application code after `findMany` (acceptable for moderate volumes)
- **Option B**: Add range query support to `QueryFilter` (scope creep for this feature)

**Decision**: Use post-filtering in the repository layer for date range and outcome filters. The evidence list endpoint is admin-only with expected low volume per query. Pagination via `limit`/`offset` bounds result size.
