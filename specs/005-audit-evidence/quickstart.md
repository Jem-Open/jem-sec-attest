# Quickstart: Audit-Ready Training Evidence

**Feature**: 005-audit-evidence
**Date**: 2026-02-20

## Overview

This feature adds audit-ready evidence generation for completed training sessions. When a session reaches a terminal state (passed, exhausted, or abandoned), an evidence record is automatically created containing the full audit trail: questions, answers, scores, rationales, policy attestation, and integrity hashes.

## New Source Files

```text
src/
  evidence/
    schemas.ts              # Zod schemas for TrainingEvidence, EvidenceBody, nested types
    evidence-repository.ts  # Repository wrapping StorageAdapter for evidence CRUD (no update/delete)
    evidence-generator.ts   # Assembles evidence from session + modules data, computes content hash
    hash.ts                 # SHA-256 canonical hashing utility

app/
  api/
    training/[tenant]/
      evidence/
        route.ts            # GET: list evidence (admin only)
        [sessionId]/
          route.ts          # GET: retrieve evidence by session ID
          generate/
            route.ts        # POST: manual evidence generation trigger (admin only)

tests/
  unit/
    evidence/
      evidence-generator.spec.ts   # Evidence assembly and hashing logic
      evidence-repository.spec.ts  # Repository CRUD operations
      evidence-route.spec.ts       # GET /evidence/:sessionId route
      evidence-list-route.spec.ts  # GET /evidence list route
      evidence-generate-route.spec.ts  # POST generate route
  integration/
    evidence/
      evidence-workflow.spec.ts    # End-to-end: complete session → evidence generated
```

## Key Patterns

### Evidence Generation (fire-and-forget)

Called from existing terminal state routes after the session transition succeeds:

```typescript
// In evaluate/route.ts, after session update succeeds:
generateEvidenceForSession(storage, tenantId, sessionId).catch((err) =>
  console.error("Evidence generation failed:", err)
);
```

### Content Hash Computation

```typescript
// Canonical JSON: sorted keys, then SHA-256
const canonical = JSON.stringify(evidenceBody, Object.keys(evidenceBody).sort());
const hash = crypto.createHash("sha256").update(canonical).digest("hex");
```

### Role-Based Access

```typescript
const role = request.headers.get("x-employee-role") ?? "employee";
// List endpoint: require compliance or admin
// Get endpoint: employees can access own evidence, compliance/admin can access all
```

### Idempotency

```typescript
// Before creating evidence, check if one already exists for this session
const existing = await evidenceRepo.findBySessionId(tenantId, sessionId);
if (existing) return existing; // Return existing, don't create duplicate
```

## Integration Points

1. **evaluate/route.ts** — Add fire-and-forget evidence generation call after "passed" or "exhausted" transitions
2. **abandon/route.ts** — Add fire-and-forget evidence generation call after "abandoned" transition
3. **Storage** — New `"evidence"` collection in existing StorageAdapter
4. **Auth** — New `x-employee-role` header check in evidence routes

## Configuration

No new configuration required. Evidence uses existing:
- Tenant config (passThreshold, maxAttempts from `tenant.settings.training`)
- Session data (configHash, appVersion, roleProfileId/Version)
- Retention settings (follows `tenant.settings.retention.days`)

## Testing Strategy

- **Unit tests**: Mock StorageAdapter and SessionRepository; test evidence assembly, hashing, route handlers, access control
- **Integration tests**: Real SQLite; complete a training session through to evidence generation; verify evidence content and hash integrity
- **Contract tests**: Validate evidence JSON schema against OpenAPI contract
