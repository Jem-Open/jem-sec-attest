# Research: 008 Platform Guardrails, i18n & Accessibility

**Date**: 2026-02-22

## R1: Secret Redaction Patterns

**Decision**: Regex-based pattern matching applied as a pipeline before transcript storage.

**Rationale**: The system already stores responses inline in `training_modules` (as `scenarioResponses[]` and `quizAnswers[]`) and copies them into `evidence` records. A redaction function applied at the point of storage — before `storage.create()` or `storage.update()` — ensures no unredacted secrets persist. Regex is sufficient for known patterns (API keys, passwords, tokens) and avoids the overhead of ML-based detection.

**Patterns to detect**:
- API keys: `sk-[a-zA-Z0-9]{20,}`, `pk-[a-zA-Z0-9]{20,}`, `AKIA[A-Z0-9]{16}`
- Password assignments: `password\s*[=:]\s*\S+`, `secret\s*[=:]\s*\S+`, `token\s*[=:]\s*\S+`
- Bearer tokens: `Bearer\s+[A-Za-z0-9\-._~+/]+=*`
- Connection strings: `(mongodb|postgres|mysql|redis):\/\/[^\s]+`
- Generic high-entropy strings (optional, lower priority): base64 blocks >40 chars adjacent to key-like labels

**Alternatives considered**:
- ML-based secret detection (e.g., TruffleHog patterns): Too heavyweight for real-time inline redaction; better suited for CI scanning.
- Post-storage redaction job: Leaves a window where unredacted secrets are stored; violates FR-001's "before storage" requirement.

## R2: Audit Event Storage & Immutability

**Decision**: Continue using the existing `audit_events` collection via `StorageAdapter.create()`. Immutability enforced at the application layer — no `update()` or `delete()` calls exposed for `audit_events`.

**Rationale**: Auth audit events already use `audit_events` collection (see `src/auth/audit.ts`). Training audit events also write to `audit_events` (see `src/training/audit.ts`). Extending this pattern for new event types (export, integration) is consistent and requires no storage changes.

**Immutability approach**: Create an `AuditLogger` service that wraps `storage.create()` for `audit_events` and explicitly does NOT expose update/delete. Route-level code calls the logger, never raw `storage.update/delete` on audit records.

**Alternatives considered**:
- Separate SQLite database for audit: Adds operational complexity with no functional benefit at current scale.
- WAL-mode append-only table: SQLite doesn't natively support append-only tables; would require custom triggers that complicate the StorageAdapter abstraction.

## R3: Transcript Retention & Purge

**Decision**: Add `retention.transcripts` config to tenant YAML with `enabled: boolean` (default `true`) and `retentionDays: number | null` (default `null` = indefinite). Purge runs as a utility function callable from a cron endpoint or CLI.

**Rationale**: Tenant YAML config is the established pattern (clarified in spec). A purge function that queries `training_modules` by `tenantId` and `updatedAt` older than retention window, skipping modules belonging to non-terminal sessions, aligns with FR-012.

**What gets purged**: The `freeTextResponse` and `llmRationale` fields within `scenarioResponses[]` and `quizAnswers[]` on `training_modules` records. When `enabled: false`, these fields are never stored (set to `null` at write time).

**Alternatives considered**:
- Purge entire module records: Too aggressive — loses score data needed for evidence integrity.
- Soft-delete with TTL: Constitution IV mandates hard purge, not soft-delete.

## R4: i18n Architecture

**Decision**: JSON locale files in `src/i18n/locales/` (e.g., `en.json`, `fr.json`). A `useTranslation()` hook (client) and `getTranslation()` function (server) load the appropriate locale. Keys are dot-notation paths (e.g., `training.quiz.submitButton`).

**Rationale**: The training page already centralizes strings in a `STRINGS` constant. Extracting these to JSON files with a lookup function is minimal effort. JSON files are easy for translators to work with. No external i18n library is needed given the app's scope — a lightweight custom implementation (~50 lines) avoids adding a dependency.

**Locale resolution order**: (1) Explicit cookie/localStorage value, (2) Browser `Accept-Language` header, (3) English default.

**Alternatives considered**:
- `next-intl` or `react-i18next`: Full i18n frameworks add significant complexity (routing, middleware, SSR hydration). The app has a small number of pages — a lightweight approach is sufficient and avoids constitution V complexity concerns.
- Per-tenant locale config: Tenants don't need to restrict locales. User-level preference is simpler.

## R5: Accessibility Audit of Existing UI

**Decision**: Retrofit existing pages (signin, dashboard) with semantic HTML and ARIA attributes. Training page already has strong a11y foundations — focus on gaps.

**Findings**:
- `app/[tenant]/training/page.tsx`: Already uses `aria-live`, `aria-label`, `aria-labelledby`, `role="progressbar"`, `role="alert"`, focus management via `firstFocusRef`. Strong baseline.
- `app/[tenant]/auth/signin/page.tsx`: Missing form labels, no landmark roles, no skip-nav.
- `app/[tenant]/dashboard/page.tsx`: Missing landmark roles, heading hierarchy unclear.
- `app/layout.tsx`: `lang="en"` hardcoded — needs to be dynamic based on selected locale.

**Alternatives considered**:
- Headless UI component library (Radix, Headless UI): The app uses inline styles and no component library. Adding one for a11y would be inconsistent. Native HTML semantics + ARIA attributes are sufficient.
