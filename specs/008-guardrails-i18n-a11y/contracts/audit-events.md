# Contract: Audit Events

No new API endpoints are added for audit events (write-only scope). Audit events are recorded internally via the `AuditLogger` service.

## Internal Contract: AuditLogger

```typescript
interface AuditLogger {
  log(tenantId: string, event: AuditEventInput): Promise<void>;
}

interface AuditEventInput {
  eventType: AuditEventType;
  employeeId: string | null;
  timestamp: string; // ISO 8601
  metadata: Record<string, unknown>;
}

type AuditEventType =
  // Auth events (existing)
  | "sign-in"
  | "sign-out"
  | "auth-failure"
  | "auth-config-error"
  // Training events (existing)
  | "training-session-started"
  | "training-module-completed"
  | "training-quiz-submitted"
  | "training-evaluation-completed"
  | "training-remediation-initiated"
  | "training-session-abandoned"
  | "training-session-exhausted"
  // Evidence & integration events (new in 008)
  | "evidence-exported"
  | "integration-push-success"
  | "integration-push-failure";
```

## Hook Points (existing routes, no new endpoints)

| Route | Event | When |
|-------|-------|------|
| `POST /api/training/[tenant]/evidence/[sessionId]/pdf` | `evidence-exported` | After PDF is generated and returned |
| `src/compliance/orchestrator.ts` (internal) | `integration-push-success` | After successful Sprinto upload |
| `src/compliance/orchestrator.ts` (internal) | `integration-push-failure` | After failed Sprinto upload (all retries exhausted) |
