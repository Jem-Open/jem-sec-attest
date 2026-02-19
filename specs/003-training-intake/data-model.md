# Data Model: Employee Training Intake (003)

**Branch**: `003-training-intake` | **Date**: 2026-02-19

## Entities

### RoleProfile

Stored in SQLite `records` table, collection: `"role_profiles"`.

| Field            | Type                    | Constraints                       | Description                                                 |
|------------------|-------------------------|-----------------------------------|-------------------------------------------------------------|
| id               | string (UUID)           | Primary key, auto-generated       | Unique profile identifier                                   |
| tenantId         | string                  | Required, indexed                 | Tenant scope (from session)                                 |
| employeeId       | string                  | Required, unique per tenant       | Link to Employee record                                     |
| jobExpectations  | string[] (1–15 items)   | Min 1, Max 15                     | Free-text descriptions of key job responsibilities and duties |
| status           | "confirmed"             | Always "confirmed" when persisted | Only confirmed profiles are stored                          |
| confirmedAt      | string (ISO 8601)       | Required                          | Timestamp of employee confirmation                          |
| version          | number                  | Starts at 1, increments on update | Profile version for audit trail                             |
| configHash       | string                  | Required                          | SHA-256 of config snapshot at time of generation (Constitution II) |
| appVersion       | string                  | Required                          | Application version that produced this profile (Constitution II) |
| createdAt        | string (ISO 8601)       | Auto-set                          | Record creation time                                        |
| updatedAt        | string (ISO 8601)       | Auto-set on update                | Last modification time                                      |

### AuditEvent (existing collection, new event types)

New `eventType` values for this feature:

| eventType                | Description                          | metadata fields                                   |
|--------------------------|--------------------------------------|---------------------------------------------------|
| `role-profile-confirmed` | Employee confirmed a new profile     | `{ profileId, version, expectationCount }`        |
| `role-profile-updated`   | Employee re-did intake and confirmed | `{ profileId, previousVersion, newVersion }`      |

**Note**: Audit events MUST NOT include raw job text or job expectation text content — only counts.

## Relationships

```
Employee (1) ──── (0..1) RoleProfile
    │                        │
    └── tenantId ────────────┘ (scoped)

RoleProfile (1) ──── (N) AuditEvent
    │                        │
    └── profileId ───────────┘ (via metadata)
```

## State Transitions

```
[No Profile] ──submit──> [Preview] ──confirm──> [Confirmed]
                  │                      │
                  └──edit──> [Preview]   └──re-intake──> [Preview] ──confirm──> [Confirmed]
                  │
                  └──cancel/navigate away──> [No Profile]
```

- **[No Profile]**: Employee has no role profile. Cannot proceed to training (FR-012).
- **[Preview]**: Transient client-side state. Not persisted. AI-generated job expectations held in React state.
- **[Confirmed]**: Persisted in `role_profiles` collection. Employee can proceed to training.

Only **[Confirmed]** profiles exist in the database. Preview state is ephemeral.

## Zod Schemas

```typescript
import { z } from "zod";

// Schema used by generateObject() — what the AI produces
export const RoleProfileExtractionSchema = z.object({
  jobExpectations: z
    .array(z.string().min(10).max(500))
    .min(1)
    .max(15)
    .describe("Key job responsibilities and duties extracted from the job description"),
});

// Full persisted schema — extraction + metadata
export const RoleProfileSchema = RoleProfileExtractionSchema.extend({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  employeeId: z.string().min(1),
  status: z.literal("confirmed"),
  confirmedAt: z.string().datetime(),
  version: z.number().int().positive(),
  configHash: z.string().min(1),
  appVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Input validation for the POST endpoint
export const IntakeSubmissionSchema = z.object({
  jobText: z.string().min(50).max(10_000),
});

// Confirmation payload (employee may have edited expectations)
export const ProfileConfirmationSchema = z.object({
  jobExpectations: z
    .array(z.string().min(10).max(500))
    .min(1)
    .max(15),
});

export type RoleProfileExtraction = z.infer<typeof RoleProfileExtractionSchema>;
export type RoleProfile = z.infer<typeof RoleProfileSchema>;
export type IntakeSubmission = z.infer<typeof IntakeSubmissionSchema>;
export type ProfileConfirmation = z.infer<typeof ProfileConfirmationSchema>;
```
