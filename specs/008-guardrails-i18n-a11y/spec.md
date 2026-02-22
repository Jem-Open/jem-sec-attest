# Feature Specification: Platform Guardrails, Internationalization & Accessibility

**Feature Branch**: `008-guardrails-i18n-a11y`
**Created**: 2026-02-22
**Status**: Draft
**Input**: User description: "Add platform guardrails and audit logging suitable for a security training system that uses AI. The system must redact secrets from stored transcripts, record an immutable audit trail of key actions, and apply retention controls configured per tenant. Add internationalization and accessibility foundations. English must be first-class, and contributors must be able to add additional locales without changing business logic. The UI must support keyboard navigation and screen readers for the full training flow."

## Clarifications

### Session 2026-02-22

- Q: Is audit log viewing/querying in scope or only the write side? → A: Write-only; viewing/querying is a future feature.
- Q: Where is the retention policy configured? → A: Tenant YAML config (static, changed at deploy time).
- Q: What happens when purge encounters a transcript for an active session? → A: Skip active; purge only completed/abandoned session transcripts, retry on next run.
- Q: Should redaction markers indicate the type of secret redacted? → A: Yes, typed markers (e.g., `[REDACTED:API_KEY]`, `[REDACTED:PASSWORD]`).
- Q: Where is the user's locale preference stored? → A: Browser-only (cookie/localStorage); does not persist across devices.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secret Redaction in AI Transcripts (Priority: P1)

A security administrator reviews stored AI training transcripts and sees that any secrets (API keys, passwords, tokens, credentials) that an employee may have accidentally typed during training are automatically redacted before storage. The administrator can trust that no sensitive data persists in the transcript store.

**Why this priority**: Storing unredacted secrets creates a high-severity data exposure risk. This is the most critical guardrail for a system that records AI interactions in a security training context.

**Independent Test**: Can be fully tested by submitting training interactions containing known secret patterns and verifying the stored transcript contains redaction markers instead of the original values.

**Acceptance Scenarios**:

1. **Given** an employee submits a training response containing an API key pattern (e.g., `sk-abc123...`), **When** the system stores the transcript, **Then** the API key is replaced with a typed redaction marker (e.g., `[REDACTED:API_KEY]`) in the stored record.
2. **Given** an employee submits text containing a password in a common format (e.g., `password=hunter2`), **When** the transcript is stored, **Then** the password value is replaced with `[REDACTED:PASSWORD]` while surrounding context is preserved.
3. **Given** an employee submits a response with no secrets, **When** the transcript is stored, **Then** the transcript is stored unchanged.
4. **Given** an AI-generated response contains an example secret for training purposes, **When** the transcript is stored, **Then** the example secret in the AI response is also redacted.

---

### User Story 2 - Immutable Audit Trail (Priority: P1)

The platform records an immutable audit trail of all key actions — authentication events, training completions, evidence exports, and integration pushes. Audit entries cannot be modified or deleted through normal platform operations. Viewing or querying the audit log is out of scope for this feature and will be addressed separately.

**Why this priority**: An immutable audit trail is a foundational compliance requirement. Without it, the platform cannot demonstrate accountability for security training activities.

**Independent Test**: Can be fully tested by performing each auditable action and verifying that a corresponding immutable audit entry exists with the correct metadata.

**Acceptance Scenarios**:

1. **Given** a user authenticates (sign-in or sign-out), **When** the authentication completes, **Then** an audit event is recorded with the user identity, tenant, action type, and timestamp.
2. **Given** a user completes a training module, **When** the completion is recorded, **Then** an audit event captures the user, tenant, module identifier, outcome (pass/fail), and timestamp.
3. **Given** an administrator exports evidence (e.g., PDF export), **When** the export completes, **Then** an audit event records the export action, user, tenant, export type, and timestamp.
4. **Given** the system pushes evidence to a compliance integration (e.g., Sprinto), **When** the push completes or fails, **Then** an audit event records the integration target, status, user, tenant, and timestamp.
5. **Given** an existing audit entry, **When** any attempt is made to modify or delete it through the platform, **Then** the system rejects the operation and the original entry remains intact.

---

### User Story 3 - Per-Tenant Retention Controls (Priority: P2)

A tenant administrator configures transcript retention settings for their organization. They can choose to disable transcript storage entirely, or set a retention period after which transcripts are automatically purged. These settings are independent per tenant and do not affect other tenants.

**Why this priority**: Different organizations have different data retention policies driven by regulatory requirements. Tenant-level control is essential for multi-tenant compliance but builds on the storage and audit infrastructure from P1 stories.

**Independent Test**: Can be fully tested by configuring different retention settings for two tenants and verifying transcripts are handled according to each tenant's policy.

**Acceptance Scenarios**:

1. **Given** a tenant configures "disable transcript storage," **When** a training session completes, **Then** no transcript is persisted for that tenant (audit events are still recorded).
2. **Given** a tenant configures a retention period of 90 days, **When** a transcript is older than 90 days, **Then** the system purges the transcript automatically.
3. **Given** a tenant has no retention setting configured, **When** a training session completes, **Then** transcripts are stored indefinitely (default behavior).
4. **Given** two tenants with different retention settings, **When** purge runs, **Then** only transcripts matching each tenant's policy are affected.

---

### User Story 4 - Externalized UI Text for Translation (Priority: P2)

A contributor wants to add French translations to the platform. They create a new locale file following the established pattern, add translated strings, and the platform renders French text for users who select that locale. No business logic code is modified.

**Why this priority**: Externalized text is the foundation for internationalization. Without it, adding languages requires modifying business logic throughout the codebase.

**Independent Test**: Can be fully tested by adding a sample locale file and verifying the platform renders the new locale's strings when selected.

**Acceptance Scenarios**:

1. **Given** the platform ships with English as the default locale, **When** a user accesses the training flow, **Then** all UI text is rendered from the English locale resource (no hardcoded strings in components).
2. **Given** a contributor creates a new locale file (e.g., French) following the documented pattern, **When** the locale is registered, **Then** the platform renders French text without any changes to business logic code.
3. **Given** a locale file is missing a translation key, **When** the platform renders that key, **Then** it falls back to the English default string.
4. **Given** a user selects a locale, **When** they navigate through the training flow, **Then** all UI text (labels, instructions, error messages, buttons) appears in the selected locale.

---

### User Story 5 - Keyboard Navigation and Screen Reader Support (Priority: P2)

A user who relies on a keyboard and screen reader completes the full training flow — from authentication through module content, quizzes, and scenarios — without needing a mouse. All interactive elements are reachable via keyboard, and screen readers announce content, state changes, and navigation landmarks correctly.

**Why this priority**: Accessibility is a legal requirement in many jurisdictions and a core quality attribute. It must be built into the foundations rather than retrofitted.

**Independent Test**: Can be fully tested by navigating the complete training flow using only a keyboard and verifying screen reader announcements at each step.

**Acceptance Scenarios**:

1. **Given** a user navigates with the Tab key, **When** they move through the training flow, **Then** all interactive elements (buttons, links, form fields, quiz options) receive focus in a logical order.
2. **Given** a screen reader is active, **When** the user enters a training module, **Then** the screen reader announces the module title, instructions, and available actions.
3. **Given** a user submits a quiz answer via keyboard (Enter key), **When** the result is displayed, **Then** the screen reader announces the outcome (correct/incorrect) and next steps.
4. **Given** a user navigates a training scenario, **When** content changes dynamically, **Then** the screen reader announces the new content via a live region.
5. **Given** a focus trap is active (e.g., in a modal dialog), **When** the user presses Tab, **Then** focus cycles within the dialog until it is dismissed.

---

### Edge Cases

- What happens when a secret pattern spans multiple lines in a transcript?
- How does the system handle redaction when the AI model returns a partial or truncated secret?
- What happens if the retention purge job encounters a transcript referenced by an active training session? → Purge skips it; retries on next run after the session completes or is abandoned.
- How does locale fallback work when a nested key exists in the target locale but a parent key does not?
- What happens when a user switches locale mid-training-session?
- How does the audit log handle high-volume concurrent writes (e.g., bulk training completions)?

## Requirements *(mandatory)*

### Functional Requirements

**Guardrails & Audit**

- **FR-001**: System MUST redact common secret patterns (API keys, passwords, tokens, bearer credentials, connection strings) from transcripts before storage.
- **FR-002**: System MUST apply redaction to both user-submitted and AI-generated content in transcripts.
- **FR-003**: System MUST replace redacted values with a typed marker indicating the secret category (e.g., `[REDACTED:API_KEY]`, `[REDACTED:PASSWORD]`, `[REDACTED:TOKEN]`, `[REDACTED:BEARER]`, `[REDACTED:CONNECTION_STRING]`) that preserves surrounding context.
- **FR-004**: System MUST record an audit event for every authentication action (sign-in, sign-out, failed authentication).
- **FR-005**: System MUST record an audit event for every training completion (pass or fail).
- **FR-006**: System MUST record an audit event for every evidence export action.
- **FR-007**: System MUST record an audit event for every compliance integration push (success or failure).
- **FR-008**: Each audit event MUST include: event type, tenant identifier, user identifier, timestamp, and action-specific metadata.
- **FR-009**: Audit entries MUST be immutable — the system MUST NOT provide any mechanism to modify or delete audit records through normal operations.
- **FR-010**: System MUST support a per-tenant configuration option to disable transcript storage entirely.
- **FR-011**: System MUST support a per-tenant configuration option to set a transcript retention period (in days).
- **FR-012**: System MUST automatically purge transcripts that exceed the configured retention period. Purge MUST skip transcripts belonging to active (in-progress) training sessions and retry on the next purge cycle.
- **FR-013**: Audit events MUST NOT be subject to transcript retention controls — audit records are retained independently.

**Internationalization**

- **FR-014**: All user-facing UI text MUST be externalized into locale resource files, with no hardcoded strings in UI components.
- **FR-015**: English MUST be the default locale and MUST be complete (all keys defined).
- **FR-016**: System MUST support adding new locales by creating a new locale resource file without modifying business logic code.
- **FR-017**: System MUST fall back to English when a translation key is missing in the selected locale.
- **FR-018**: System MUST provide a mechanism for users to select their preferred locale. The preference MUST be stored browser-side (cookie or localStorage) and does not persist across devices.

**Accessibility**

- **FR-019**: All interactive elements in the training flow MUST be reachable and operable via keyboard alone.
- **FR-020**: The training flow MUST use appropriate semantic landmarks (navigation, main, complementary) and heading hierarchy.
- **FR-021**: Dynamic content changes (quiz results, scenario progression) MUST be announced to screen readers via ARIA live regions.
- **FR-022**: All form inputs MUST have associated labels or ARIA attributes.
- **FR-023**: Focus management MUST follow a logical tab order and trap focus within modal dialogs.
- **FR-024**: Color MUST NOT be the sole means of conveying information (e.g., pass/fail indicators must also use text or icons).

### Key Entities

- **Audit Event**: A record of a significant platform action. Includes event type, tenant, user, timestamp, and action-specific metadata. Immutable once written.
- **Transcript**: A stored record of the AI interaction during a training session. Subject to redaction before storage and tenant-specific retention controls.
- **Retention Policy**: A per-tenant configuration in the tenant YAML config file controlling whether transcripts are stored and for how long. Static at deploy time. Does not affect audit events.
- **Locale Resource**: A collection of translated UI strings keyed by identifier. One resource per supported language. English is the canonical default.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of known secret patterns (API keys, passwords, tokens, bearer credentials, connection strings) submitted during training are redacted before transcript storage.
- **SC-002**: Every authentication, training completion, evidence export, and integration push action produces a corresponding audit event within 1 second of the action completing.
- **SC-003**: Audit entries remain unmodifiable — no platform operation can alter or remove an existing audit record.
- **SC-004**: Tenants with transcript storage disabled produce zero stored transcripts after training sessions.
- **SC-005**: Transcripts exceeding the configured retention period are purged within 24 hours of expiry.
- **SC-006**: A new locale can be added by a contributor creating a single resource file, with zero changes to business logic code.
- **SC-007**: The English locale covers 100% of UI text in the training flow.
- **SC-008**: A sample second locale (e.g., French) demonstrates the translation workflow end-to-end.
- **SC-009**: All core training flows (authentication, module content, quizzes, scenarios, completion) pass automated accessibility checks (WCAG 2.1 AA compliance).
- **SC-010**: The full training flow can be completed using only keyboard navigation.

## Assumptions

- Secret redaction targets common patterns (API keys matching prefixes like `sk-`, `pk-`, `AKIA`; `password=`, `secret=`, `token=` key-value pairs; bearer tokens; connection strings). Custom secret patterns per tenant are out of scope for this feature.
- Audit events are stored in the same storage layer as other platform data (SQLite via StorageAdapter). A dedicated audit database, external SIEM integration, and audit log viewing/querying UI or API are all out of scope.
- Immutability is enforced at the application layer — the platform does not expose update or delete operations for audit records. Database-level immutability (e.g., append-only storage) is an implementation consideration, not a requirement.
- Retention settings are defined in tenant YAML config files, consistent with existing multi-tenant configuration patterns. Changes require redeployment.
- Retention purge runs as a periodic background process. Real-time purge on exact expiry is not required.
- The locale selection mechanism is a simple user preference (e.g., dropdown or browser language detection) stored browser-side (cookie or localStorage). The preference does not persist across devices. Automatic locale detection from browser settings is a reasonable default when no explicit preference is set.
- Accessibility compliance targets WCAG 2.1 Level AA, which is the widely accepted standard for web applications.
- The sample second locale for demonstrating the translation workflow will be French (fr), as it is a common choice with widely available translation resources.
