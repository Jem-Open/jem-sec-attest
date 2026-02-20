# Research: Audit-Ready Training Evidence

**Feature**: 005-audit-evidence
**Date**: 2026-02-20

## R1: Content Hash Strategy for Tamper Detection

**Decision**: SHA-256 hash over canonical JSON representation of the evidence body (excluding the `contentHash` and `id` fields themselves).

**Rationale**: SHA-256 is industry-standard for integrity verification, available natively in Node.js via `crypto.createHash("sha256")`. Canonical JSON means sorting keys deterministically before hashing so the same logical content always produces the same hash regardless of property insertion order. Using `JSON.stringify()` with sorted keys achieves this.

**Alternatives considered**:
- **HMAC-SHA256 with secret key**: Provides authentication in addition to integrity, but requires key management infrastructure. Overkill for tamper detection where the verifier has access to the evidence body. Can be added later if needed.
- **Digital signatures (RSA/ECDSA)**: Provides non-repudiation but requires PKI infrastructure. Out of scope per spec assumptions.
- **MD5/SHA-1**: Deprecated for integrity purposes; SHA-256 is the minimum standard.

**Implementation note**: The hash is computed over the `evidence` field of the stored record (containing all audit data). The `contentHash`, `id`, `generatedAt`, and storage metadata fields are excluded from the hash input to avoid circular dependencies.

## R2: Evidence Storage Pattern

**Decision**: Store evidence records in an `"evidence"` collection using the existing `StorageAdapter` interface. One record per session (1:1 relationship enforced by idempotency check on `sessionId`).

**Rationale**: The existing generic collection-based storage pattern (used by `training_sessions`, `training_modules`, `audit_events`) is well-suited. No new storage infrastructure needed. The `findMany` query with `where: { sessionId }` check before creation enforces the 1:1 constraint.

**Alternatives considered**:
- **Embedded in training_sessions record**: Would couple evidence tightly to the session lifecycle and make the session record very large. Also violates immutability requirement since sessions can be updated.
- **Separate SQLite table**: Would require changes to the storage adapter interface. The generic collection pattern is simpler and consistent.

## R3: Role-Based Access Control for Evidence Endpoints

**Decision**: Use an `x-employee-role` header (set by auth middleware from OIDC token claims) to distinguish between `employee` and `compliance`/`admin` roles. Evidence routes check this header alongside existing `x-tenant-id` and `x-employee-id` headers.

**Rationale**: The existing auth pattern uses headers populated by upstream middleware (from OIDC session). Adding a role header follows the same pattern. The OIDC token is expected to contain a role claim that the auth layer can extract. This is the simplest approach that doesn't require a new auth system.

**Alternatives considered**:
- **Separate admin API with different auth**: Over-engineered for current needs. Can be introduced later.
- **Permission-based system**: Fine-grained permissions are unnecessary when only two access levels exist (self vs. tenant-wide).

**Implementation note**: The role check is additive — it doesn't replace tenant validation. A compliance user for tenant A still cannot access tenant B evidence.

## R4: Evidence Generation Trigger Points

**Decision**: Call evidence generation from three existing routes that transition sessions to terminal states:
1. `evaluate/route.ts` — after transitioning to "passed" or "exhausted"
2. `abandon/route.ts` — after transitioning to "abandoned"

Evidence generation is fire-and-forget (same pattern as audit logging): wrapped in try-catch, failures logged to console, never blocks the route response.

**Rationale**: Hooking into existing terminal state transitions is the simplest approach with zero risk of missing a completion event. The fire-and-forget pattern is proven by audit logging.

**Alternatives considered**:
- **Event-driven with pub/sub**: Would require new infrastructure (event bus). Over-engineered for a synchronous SQLite-backed system.
- **Post-response webhook/callback**: Adds complexity and failure modes. Direct in-process call is simpler.
- **Periodic batch job**: Doesn't meet the "within 5 seconds" success criterion.

## R5: Multi-Attempt Evidence Structure

**Decision**: Evidence is generated once at the final terminal state and captures all attempt data retrospectively. The evidence record contains an `attempts` array, each with the modules and scores for that attempt.

**Rationale**: A session can go through up to 3 attempts (1 initial + 2 remediation). Evidence must capture the full history. Since the session and all its modules are still in storage at terminal state, all historical data is available for assembly. A single evidence record per session (not per attempt) keeps the data model simple and matches the 1:1 relationship in the spec.

**Implementation note**: For attempt N, modules from that attempt are identified by the session's `attemptNumber` at the time they were scored. The current codebase stores all modules for the session; module data accumulates across attempts.

## R6: Immutability Enforcement

**Decision**: Enforce immutability at the repository level — the `EvidenceRepository` provides `create` and read methods but no `update` or `delete` methods. The storage adapter's generic `update` and `delete` are not exposed through the repository interface.

**Rationale**: Application-level enforcement is sufficient for this use case. The content hash provides a secondary integrity check. Database-level enforcement (triggers, read-only tables) would require SQLite-specific changes to the generic storage adapter.

**Alternatives considered**:
- **Database-level constraints**: Would require SQLite triggers or a dedicated table, breaking the generic adapter pattern.
- **Soft-delete only**: Unnecessary since we don't allow any modifications at all.
