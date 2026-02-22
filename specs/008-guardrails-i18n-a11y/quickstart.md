# Quickstart: 008 Platform Guardrails, i18n & Accessibility

## Prerequisites

- Node.js 20.9+
- pnpm installed
- `.env` configured (see `.env.example`)
- At least one tenant config in `config/tenants/`

## New Configuration

Add transcript retention settings to your tenant YAML config:

```yaml
# config/tenants/acme-corp.yaml
settings:
  retention:
    days: 365
    transcripts:
      enabled: true        # set to false to disable transcript storage
      retentionDays: 90    # set to null for indefinite retention
```

## New Source Files

```
src/
  guardrails/
    secret-redactor.ts      # SecretRedactor — regex-based pattern matching
    secret-patterns.ts      # Pattern definitions per secret category
  audit/
    audit-logger.ts         # AuditLogger — immutable event writer
    audit-types.ts          # Event type definitions and metadata schemas
  i18n/
    index.ts                # getTranslation server fn + shared helpers
    client.ts               # useTranslation client hook
    locales/
      en.json               # English (canonical, complete)
      fr.json               # French (sample, partial)
  retention/
    transcript-purger.ts    # TranscriptPurger — periodic purge logic
```

## Development Workflow

```bash
# Run all tests
pnpm test

# Run only unit tests (fastest feedback)
pnpm test:unit

# Lint check
pnpm lint

# Type check
pnpm type-check

# Development server
pnpm dev
```

## Testing the Features

### Secret Redaction
Submit a training response containing a test secret (e.g., `sk-test1234567890abcdef`). Verify the stored module record shows `[REDACTED:API_KEY]` instead.

### Audit Events
Perform a sign-in, complete a training module, export a PDF. Check `audit_events` collection for corresponding entries.

### Retention
Configure a tenant with `transcripts.retentionDays: 0` and trigger the purge endpoint. Verify free-text fields are nulled on completed session modules.

### i18n
Set a `locale=fr` cookie in the browser. Navigate to the training page. Verify French strings render where translations exist, English for missing keys.

### Accessibility
Navigate the full training flow using only Tab, Enter, and arrow keys. Enable VoiceOver (macOS) and verify announcements at each state transition.

## Security Guidance for Deployers

### Verifying Redaction is Active
Secret redaction is applied automatically in the scenario and quiz submission routes. To verify:
1. Submit a training response containing a known pattern (e.g., `sk-test1234567890abcdef`)
2. Query `training_modules` in the database and confirm `freeTextResponse` shows `[REDACTED:API_KEY]`

### Configuring Retention
- Set `retention.transcripts.enabled: false` in tenant config to prevent free-text storage entirely (scores are always preserved)
- Set `retention.transcripts.retentionDays: 90` to auto-purge transcripts older than 90 days
- Set `retentionDays: null` for indefinite retention (purge job skips the tenant)

### Securing the Purge Endpoint
The `POST /api/admin/purge-transcripts` endpoint requires a `PURGE_SECRET` environment variable:
- Set `PURGE_SECRET` to a strong random value (32+ characters)
- Pass it as a Bearer token: `Authorization: Bearer <PURGE_SECRET>`
- In production, call this endpoint from a cron job or scheduled task — do not expose it publicly

### Audit Event Retention
Audit events are append-only through `AuditLogger` — no update or delete methods are exposed. The underlying `audit_events` collection can be queried for compliance reporting. Consider:
- Backing up the SQLite database on a regular schedule
- Exporting audit events to external SIEM or log aggregation systems for long-term retention
- The audit trail covers: authentication, training completions, evidence exports, and integration pushes
