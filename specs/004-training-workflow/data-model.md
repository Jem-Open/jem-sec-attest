# Data Model: Guided Training Workflow

**Feature**: 004-training-workflow | **Date**: 2026-02-20

## Storage Collections

All entities stored in the existing `records` table via `StorageAdapter`. Each collection is tenant-scoped (all queries include `tenantId`).

---

## Entity: Training Session

**Collection**: `training_sessions`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK, auto-generated | Unique session identifier |
| tenantId | string | Required, indexed | Tenant scope |
| employeeId | string | Required, indexed | Employee who owns this session |
| roleProfileId | string | Required | Role profile used to generate curriculum |
| roleProfileVersion | number | Required | Version of role profile at session creation |
| configHash | string | Required | Config snapshot hash at session creation |
| appVersion | string | Required | Application version at session creation |
| status | enum | Required | `curriculum-generating` \| `in-progress` \| `evaluating` \| `passed` \| `failed` \| `in-remediation` \| `exhausted` \| `abandoned` |
| attemptNumber | number | Required, 1–3 | Current attempt (1 = initial, 2–3 = remediation) |
| curriculum | CurriculumOutline | Required after generation | Array of module outlines (titles, topics, job expectation mappings) |
| aggregateScore | number \| null | 0.0–1.0 | Computed after all modules scored; null while in-progress |
| weakAreas | string[] \| null | | Topic areas below threshold (populated on failure) |
| version | number | Required, starts at 1 | Optimistic concurrency counter, incremented on every write |
| createdAt | string (ISO 8601) | Required | Session creation timestamp |
| updatedAt | string (ISO 8601) | Required | Last modification timestamp |
| completedAt | string (ISO 8601) \| null | | Timestamp of final pass/fail/exhausted/abandoned |

**Uniqueness constraint**: One active session (status not in `passed`, `exhausted`, `abandoned`) per `(tenantId, employeeId)` pair. Enforced in application logic (repository layer).

**State transitions**:

```
                    ┌─────────────────────┐
                    │ curriculum-generating │
                    └──────────┬──────────┘
                               │ outline generated
                               ▼
              ┌──────────── in-progress ◄───────────────┐
              │                │                         │
              │ abandon        │ all modules scored      │ remediation
              │                ▼                         │ modules scored
              │           evaluating                     │
              │           │        │                     │
              │    pass   │        │  fail               │
              │    ┌──────┘        └──────┐              │
              │    ▼                      ▼              │
              │  passed              failed ────────┐    │
              │                      (attempts < 3) │    │
              │                                     ▼    │
              │                              in-remediation
              │                                     │
              │                      fail + attempts = 3│
              │                                     ▼
              │                                 exhausted
              ▼
          abandoned
```

---

## Entity: Training Module

**Collection**: `training_modules`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK, auto-generated | Unique module identifier |
| tenantId | string | Required | Tenant scope |
| sessionId | string | Required, indexed | Parent training session |
| moduleIndex | number | Required, 0-based | Position in curriculum |
| title | string | Required | Module title from curriculum outline |
| topicArea | string | Required | Topic area from curriculum outline |
| jobExpectationIndices | number[] | Required | Indices into role profile's jobExpectations array |
| status | enum | Required | `locked` \| `content-generating` \| `learning` \| `scenario-active` \| `quiz-active` \| `scored` |
| content | ModuleContent \| null | | Generated instructional content, scenarios, quiz (null until generated) |
| scenarioResponses | ScenarioResponse[] | Default: [] | Employee's scenario responses with scores |
| quizAnswers | QuizAnswer[] | Default: [] | Employee's quiz answers with scores |
| moduleScore | number \| null | 0.0–1.0 | Aggregate module score (null until scored) |
| version | number | Required, starts at 1 | Optimistic concurrency counter |
| createdAt | string (ISO 8601) | Required | Module record creation timestamp |
| updatedAt | string (ISO 8601) | Required | Last modification timestamp |

**Module state transitions**:

```
locked → content-generating → learning → scenario-active → quiz-active → scored
```

Sequential, non-reversible. Each module must reach `scored` before the next module unlocks.

---

## Embedded Types (stored as JSON within parent entities)

### CurriculumOutline

```typescript
{
  modules: Array<{
    title: string;             // e.g., "Data Classification and Handling"
    topicArea: string;         // e.g., "information-security"
    jobExpectationIndices: number[];  // indices into role profile jobExpectations
  }>;
  generatedAt: string;        // ISO 8601 timestamp
}
```

### ModuleContent

```typescript
{
  instruction: string;         // Markdown-formatted instructional content
  scenarios: Array<{
    id: string;                // Stable identifier within module
    narrative: string;         // Scenario description
    responseType: "multiple-choice" | "free-text";
    options?: Array<{          // Present only for multiple-choice
      key: string;             // "A", "B", "C", "D"
      text: string;
      correct: boolean;        // Used for server-side scoring, never sent to client
    }>;
    rubric?: string;           // Present only for free-text — evaluation criteria for LLM
  }>;
  quiz: {
    questions: Array<{
      id: string;              // Stable identifier within quiz
      text: string;            // Question text
      responseType: "multiple-choice" | "free-text";
      options?: Array<{        // Present only for multiple-choice
        key: string;
        text: string;
        correct: boolean;      // Never sent to client
      }>;
      rubric?: string;         // Present only for free-text
    }>;
  };
  generatedAt: string;        // ISO 8601 timestamp
}
```

### ScenarioResponse

```typescript
{
  scenarioId: string;          // Matches scenario.id in ModuleContent
  responseType: "multiple-choice" | "free-text";
  selectedOption?: string;     // For MC: "A", "B", etc.
  freeTextResponse?: string;   // For free-text: employee's written response (max 2000 chars)
  score: number;               // 0.0–1.0
  llmRationale?: string;       // Present only for free-text — LLM's evaluation reasoning
  submittedAt: string;         // ISO 8601 timestamp
}
```

### QuizAnswer

```typescript
{
  questionId: string;          // Matches question.id in ModuleContent
  responseType: "multiple-choice" | "free-text";
  selectedOption?: string;     // For MC
  freeTextResponse?: string;   // For free-text (max 2000 chars)
  score: number;               // 0.0–1.0
  llmRationale?: string;       // Present only for free-text
  submittedAt: string;         // ISO 8601 timestamp
}
```

---

## Audit Events

**Collection**: `audit_events` (existing)

| Event Type | Metadata Fields |
|------------|----------------|
| `training-session-started` | sessionId, attemptNumber, roleProfileVersion, configHash |
| `training-module-completed` | sessionId, moduleIndex, moduleTitle, moduleScore |
| `training-quiz-submitted` | sessionId, moduleIndex, questionCount, mcCount, freeTextCount |
| `training-evaluation-completed` | sessionId, attemptNumber, aggregateScore, passed (boolean) |
| `training-remediation-initiated` | sessionId, attemptNumber, weakAreaCount, weakAreas (topic names only) |
| `training-session-abandoned` | sessionId, attemptNumber, modulesCompleted, totalModules |
| `training-session-exhausted` | sessionId, finalScore, totalAttempts |

**Rule**: Audit events MUST NOT contain raw training content, employee free-text responses, or LLM-generated instructional material. Only scores, counts, topic names, and IDs.

---

## Query Patterns

| Operation | Collection | Filter | Usage |
|-----------|-----------|--------|-------|
| Find active session | training_sessions | `{ employeeId, status: NOT IN [passed, exhausted, abandoned] }` | Page load, session guard |
| Find session history | training_sessions | `{ employeeId }`, orderBy `createdAt desc` | Progress/history view |
| Find modules for session | training_modules | `{ sessionId }`, orderBy `moduleIndex asc` | Curriculum display, progress |
| Find specific module | training_modules | `{ sessionId, moduleIndex }` | Module content load |

**Note**: The `NOT IN` filter for active session requires application-level logic since `StorageAdapter.findMany` only supports simple equality in `where`. The repository will use `findMany({ employeeId })` and filter in application code, or use a dedicated method.
