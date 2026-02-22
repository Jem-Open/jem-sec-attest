# Contract: Transcript Retention

## Tenant Config Extension

```yaml
# In tenant YAML config file
settings:
  retention:
    days: 365             # existing
    transcripts:
      enabled: true       # default true; false = never store free-text content
      retentionDays: 90   # default null (indefinite); days before purge
```

## Internal Contract: TranscriptPurger

```typescript
interface TranscriptPurger {
  purge(tenantId: string): Promise<PurgeResult>;
  purgeAll(): Promise<PurgeResult[]>; // iterates all tenants
}

interface PurgeResult {
  tenantId: string;
  modulesProcessed: number;
  modulesPurged: number;
  modulesSkipped: number; // active sessions
}
```

## Purge API Endpoint (optional cron trigger)

```
POST /api/admin/purge-transcripts
Authorization: Internal/cron secret
Response: { results: PurgeResult[] }
```

## Purge Rules

1. Only process tenants with `retention.transcripts.retentionDays` set (non-null)
2. For each tenant, find `training_modules` where `updatedAt` < now - retentionDays
3. Skip modules belonging to sessions NOT in terminal states (`passed`, `exhausted`, `abandoned`)
4. For eligible modules: set `freeTextResponse` and `llmRationale` fields to `null` in all `scenarioResponses[]` and `quizAnswers[]`
5. Preserve all other fields (scores, selectedOption, timestamps)
