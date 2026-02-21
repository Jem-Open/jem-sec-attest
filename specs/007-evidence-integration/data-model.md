# Data Model: Compliance Evidence Integration

**Branch**: `007-evidence-integration`
**Date**: 2026-02-21

## Entities

### ComplianceUpload

Tracks the outcome of uploading an evidence record to an external compliance provider. One record per evidence-provider pair.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK, auto-generated | Storage adapter assigns |
| tenantId | string | required | Tenant isolation scope |
| evidenceId | UUID | required, FK → TrainingEvidence.id | The evidence record that was uploaded |
| sessionId | UUID | required | Denormalized from evidence for query convenience |
| provider | string | required, enum: "sprinto" | Discriminator — extensible for future providers |
| status | string | required, enum: "pending", "succeeded", "failed" | Terminal states: succeeded, failed |
| attemptCount | number | required, default 0 | Total upload attempts (initial + retries) |
| maxAttempts | number | required | From tenant config at time of first attempt |
| providerReferenceId | string | nullable | Provider-assigned ID on success (e.g., Sprinto evidence status) |
| lastError | string | nullable | Error message from most recent failed attempt |
| lastErrorCode | string | nullable | HTTP status or GraphQL error code |
| retryable | boolean | required, default true | Whether the last error was retryable |
| createdAt | string (ISO datetime) | required, auto-set | When the upload record was created |
| updatedAt | string (ISO datetime) | required, auto-set | When the upload record was last modified |
| completedAt | string (ISO datetime) | nullable | When the upload reached terminal state |

**Storage collection**: `"compliance_uploads"`

**Identity & uniqueness**: One ComplianceUpload per (tenantId, evidenceId, provider) tuple. The orchestrator checks for existing records before creating a new one (idempotency).

**State transitions**:

```
pending → succeeded     (upload succeeded on any attempt)
pending → failed        (all retries exhausted or non-retryable error)
```

No intermediate "retrying" state is persisted — retries happen in-process. The `attemptCount` field tracks progress.

### ComplianceIntegrationConfig (configuration entity — not stored in DB)

Parsed from tenant YAML settings. Lives in the `ConfigSnapshot` at runtime.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| provider | string | required, enum: "sprinto" | Provider discriminator |
| apiKeyRef | string | required, env var reference `${VAR}` | Resolved at config load time |
| workflowCheckId | UUID string | required | Provider-specific check identifier |
| region | string | required, enum: "us", "eu", "india" | Determines API endpoint URL |
| retry.maxAttempts | number | optional, default 5, range 1-10 | Max upload attempts |
| retry.initialDelayMs | number | optional, default 5000, range 1000-60000 | First retry delay |
| retry.maxDelayMs | number | optional, default 300000, range 5000-600000 | Max retry delay cap |

## Relationships

```
Tenant (config)
  └── ComplianceIntegrationConfig (0..1, from YAML settings)

TrainingEvidence (1)
  └── ComplianceUpload (0..1 per provider)
        ├── references evidenceId → TrainingEvidence.id
        └── references tenantId for isolation
```

## Existing Entities Affected

### TrainingEvidence (read-only)

No schema changes. The compliance integration reads evidence records via `EvidenceRepository.findBySessionId()` and passes them to the provider. The `ComplianceUpload` entity references evidence by ID.

### TenantSettings.integrations (config schema extension)

The `integrations` block in `TenantSettingsSchema` gains a new optional `compliance` field:

```
integrations:
  webhookUrl?: string        # existing
  ssoProvider?: string       # existing
  compliance?:               # NEW
    provider: "sprinto"
    apiKeyRef: "${VAR}"
    workflowCheckId: UUID
    region: "us" | "eu" | "india"
    retry?:
      maxAttempts?: number
      initialDelayMs?: number
      maxDelayMs?: number
```

## Data Volume Assumptions

- One `ComplianceUpload` per completed training session per tenant (only for tenants with compliance enabled).
- Expected volume: low — tens to hundreds per month per tenant, not thousands.
- No archival or purge strategy needed initially. Records are small (~500 bytes each).
