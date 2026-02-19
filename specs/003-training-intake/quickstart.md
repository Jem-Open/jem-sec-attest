# Quickstart: Employee Training Intake (003)

**Branch**: `003-training-intake` | **Date**: 2026-02-19

## Prerequisites

- Node.js 20.9+
- Running instance with feature 001 (config) and 002 (SSO auth) configured
- An AI provider API key (Anthropic, OpenAI, or Azure OpenAI)

## Setup

### 1. Configure AI Provider

Add to `.env`:

```bash
# AI provider API key (required for role profile generation)
ANTHROPIC_API_KEY=your-api-key-here
# Or: OPENAI_API_KEY=your-api-key-here

# Optional: Vercel AI Gateway URL (defaults to gateway if not set)
# AI_GATEWAY_URL=https://gateway.ai.vercel.app/v1

# Optional: Application version for evidence stamping
# APP_VERSION=1.0.0
```

Add AI settings to `config/defaults.yaml`:

```yaml
settings:
  ai:
    provider: "anthropic"              # or "openai", "azure-openai"
    model: "claude-sonnet-4-20250514"  # model identifier
    temperature: 0                     # deterministic extraction
    maxRetries: 2                      # retry on transient failures
    # gatewayUrl: "https://gateway.ai.vercel.app/v1"  # Vercel AI Gateway (default)
```

### 2. Verify Configuration

```bash
npm run dev
```

The config loader will validate the AI settings at startup.

### 3. Test the Intake Flow

1. Sign in as an employee via SSO at `http://localhost:3000/{tenant}/auth/signin`
2. Navigate to `http://localhost:3000/{tenant}/intake`
3. Paste a job description into the textbox
4. Click "Generate Profile"
5. Review the inferred job expectations (key responsibilities and duties)
6. Edit any inaccuracies (add, remove, or modify expectations)
7. Click "Confirm"

### 4. Run Tests

```bash
# All tests
npm test

# Unit tests only (fast, mocked AI)
npm run test:unit

# Integration tests (requires AI provider key)
npm run test:integration
```

## Key Files

| File | Purpose |
|------|---------|
| `src/intake/schemas.ts` | Zod schemas for RoleProfile and intake validation |
| `src/intake/profile-generator.ts` | AI SDK integration — `generateObject()` with prompt injection mitigation |
| `src/intake/profile-repository.ts` | CRUD for role profiles via StorageAdapter |
| `src/intake/sanitizer.ts` | Input sanitization (XSS, HTML stripping) |
| `src/intake/ai-model-resolver.ts` | Resolves tenant config to AI SDK model (with gateway support) |
| `app/api/intake/[tenant]/generate/route.ts` | POST endpoint — generate profile from job text |
| `app/api/intake/[tenant]/confirm/route.ts` | POST endpoint — confirm and persist profile |
| `app/api/intake/[tenant]/profile/route.ts` | GET endpoint — retrieve confirmed profile |
| `app/[tenant]/intake/page.tsx` | Intake UI page (textbox, preview, confirm) |

## Architecture Notes

- **Raw job text never persisted**: Processed in the API route handler, passed to `generateObject()`, discarded after response.
- **Preview state is client-side**: The generated job expectations list lives in React state until confirmation. No server-side session or cache.
- **Prompt injection defense**: Three layers — HTML sanitization, structured prompt boundaries (`<job_description>` tags with untrusted-data prefix), and schema-constrained output via `generateObject()`.
- **Tenant-scoped storage**: Role profiles stored in the existing SQLite `records` table, collection `"role_profiles"`, filtered by `tenant_id`.
- **Vercel AI Gateway**: Default routing layer for AI requests. Provides unified proxy across providers with caching and rate limiting.

## Security

### AI API Key Management

- Store AI provider API keys exclusively in environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
- Never commit API keys to configuration files. Tenant YAML configs reference keys via `${VAR}` substitution only.
- Rotate API keys regularly per your organization's secret rotation policy.
- In production, use a secret manager (e.g., Vault, AWS Secrets Manager) and inject keys at deploy time.

### Vercel AI Gateway

- The `gatewayUrl` in AI config controls where AI requests are routed. In production, restrict network access to the gateway endpoint only.
- If using direct provider access (no gateway), ensure the provider's API endpoint is allowlisted in your network policy.
- Monitor gateway usage for anomalous request patterns that could indicate abuse.

### Verifying Raw Text Non-Persistence

To audit that raw job descriptions are not stored:

1. Run the intake flow for a test employee.
2. Query the SQLite database directly:
   ```bash
   sqlite3 data/jem.db "SELECT data FROM records WHERE collection IN ('role_profiles', 'audit_events');" | grep -i "paste your test job description snippet here"
   ```
3. The grep should return **no results**. If any match is found, it indicates a persistence leak that must be investigated.

### Tenant Isolation Verification

1. Create profiles for employees in two different tenants.
2. Verify via API that a session for tenant A cannot access tenant B's profile endpoint.
3. Query the database directly to confirm `tenant_id` scoping on all `role_profiles` records.
