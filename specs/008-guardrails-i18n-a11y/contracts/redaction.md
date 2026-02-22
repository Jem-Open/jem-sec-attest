# Contract: Secret Redaction

No new API endpoints. Redaction is an internal pipeline applied before storage.

## Internal Contract: SecretRedactor

```typescript
interface SecretRedactor {
  redact(text: string): RedactionResult;
}

interface RedactionResult {
  text: string;           // redacted text
  redactionCount: number; // number of secrets found and redacted
  redactionTypes: string[]; // e.g., ["API_KEY", "PASSWORD"]
}
```

## Redaction Categories & Markers

| Category | Marker | Example Patterns |
|----------|--------|------------------|
| API_KEY | `[REDACTED:API_KEY]` | `sk-...`, `pk-...`, `AKIA...` |
| PASSWORD | `[REDACTED:PASSWORD]` | `password=...`, `secret=...` |
| TOKEN | `[REDACTED:TOKEN]` | `token=...` |
| BEARER | `[REDACTED:BEARER]` | `Bearer eyJ...` |
| CONNECTION_STRING | `[REDACTED:CONNECTION_STRING]` | `mongodb://...`, `postgres://...` |

## Application Points

| Location | Field | When |
|----------|-------|------|
| Training module scenario submission | `freeTextResponse` | Before `storage.update()` on module |
| Training module quiz submission | `freeTextResponse` | Before `storage.update()` on module |
| LLM rationale storage | `llmRationale` | Before `storage.update()` on module |
