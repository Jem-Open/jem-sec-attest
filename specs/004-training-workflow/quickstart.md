# Quickstart: Guided Training Workflow

**Feature**: 004-training-workflow | **Date**: 2026-02-20

## Prerequisites

1. **Features 001–003 deployed**: Multi-tenant config, SSO auth, and training intake must be functional.
2. **At least one employee** with a confirmed role profile (completed the intake flow).
3. **AI provider configured**: Tenant must have `settings.ai` configured (or defaults to Anthropic Claude).
4. **Environment variables**: `ANTHROPIC_API_KEY` (or equivalent for chosen provider), `APP_VERSION`, `DB_PATH` (optional, defaults to `data/jem.db`).

## Tenant Configuration

Add a `training` section to the tenant's YAML configuration:

```yaml
# config/tenants/acme.yaml
name: "Acme Corp"
hostnames: ["acme.example.com"]
emailDomains: ["acme.com"]
settings:
  ai:
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    temperature: 0
  training:
    passThreshold: 0.70     # Score required to pass (0.0–1.0). Default: 0.70
    maxAttempts: 3           # Max total attempts (initial + remediation). Default: 3
    maxModules: 8            # Maximum modules per curriculum. Default: 8
    enableRemediation: true  # Allow remediation cycles on failure. Default: true
```

All `training` fields are optional — defaults apply when omitted.

## Employee Workflow

### 1. Navigate to Training

```
GET /{tenant}/training
```

The training page loads and checks for an existing session:
- **No session**: Shows "Start Training" button.
- **Active session**: Resumes from where the employee left off.
- **No role profile**: Redirects to `/{tenant}/intake`.

### 2. Start a Session

Employee clicks "Start Training". The system:
1. Fetches the employee's confirmed role profile.
2. Calls the LLM to generate a curriculum outline (1–8 modules based on role complexity).
3. Creates the training session and module records.
4. Displays the curriculum with module titles and progress indicators.

### 3. Complete Modules

For each module in order:
1. **Instructional content** — Employee reads the generated material.
2. **Scenarios** — Employee responds to workplace scenarios (multiple-choice or free-text).
3. **Quiz** — Employee answers assessment questions (multiple-choice or free-text).
4. Module is scored and the next module unlocks.

### 4. Final Evaluation

After all modules are scored:
- Aggregate score is computed (mean of module scores).
- **Pass** (>= 70%): Training complete. Employee is marked as trained.
- **Fail** (< 70%): Weak areas identified. Remediation offered (if attempts remain).

### 5. Remediation (if needed)

On failure, the employee can start a remediation cycle:
1. System generates targeted modules for weak areas only.
2. Employee completes remediation modules.
3. New aggregate score computed (original passing areas retained).
4. Up to 2 remediation cycles (3 total attempts).

### 6. Abandon (optional)

Employee can abandon an in-progress session at any time:
- Counts as one attempt toward the 3-attempt limit.
- Requires confirmation dialog.
- Partial progress is preserved for audit.

## API Endpoints Summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/training/{tenant}/session` | Get current session state |
| POST | `/api/training/{tenant}/session` | Start new training session |
| POST | `/api/training/{tenant}/abandon` | Abandon current session |
| POST | `/api/training/{tenant}/module/{index}/content` | Generate module content |
| POST | `/api/training/{tenant}/module/{index}/scenario` | Submit scenario response |
| POST | `/api/training/{tenant}/module/{index}/quiz` | Submit quiz answers |
| POST | `/api/training/{tenant}/evaluate` | Compute final evaluation |

All endpoints require `x-tenant-id` and `x-employee-id` headers (set by auth middleware).

## State Resilience

All training state is persisted server-side. The workflow is resilient to:
- **Browser refresh**: Page reloads and fetches current state from API.
- **Tab closure**: Return later and resume exactly where you left off.
- **Session expiry**: Re-authenticate via SSO; training state is independent of auth session.
- **Multi-tab conflicts**: Optimistic concurrency prevents data loss; conflicting tab receives 409 and reloads.

## Security Notes

- Employee free-text responses are treated as untrusted input in LLM evaluation prompts.
- Generated training content and employee responses are not included in audit logs — only scores, IDs, and counts.
- All data is tenant-scoped; cross-tenant access is prevented at the storage layer.
- The curriculum, module content, and scores are server-side only — the client never sees correct answers for unanswered questions.
