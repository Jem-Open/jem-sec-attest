# Feature Specification: PostgreSQL Database Support

**Feature Branch**: `009-postgres-support`
**Created**: 2026-02-22
**Status**: Draft
**Input**: User description: "add postgres database support"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy with PostgreSQL in Production (Priority: P1)

A platform operator deploying jem-sec-attest to a production environment wants to use PostgreSQL instead of SQLite for durability, concurrent access, and operational familiarity. They configure a PostgreSQL connection string in the environment and the application connects, initializes its schema, and operates identically to the SQLite deployment.

**Why this priority**: SQLite is not suitable for multi-server production deployments. PostgreSQL support is the core value proposition — without it, the remaining stories have no foundation.

**Independent Test**: Can be fully tested by configuring a PostgreSQL connection string, starting the application, and running the existing training workflow end-to-end against PostgreSQL. Delivers production-grade database support.

**Acceptance Scenarios**:

1. **Given** a PostgreSQL database is available and a connection string is configured, **When** the application starts, **Then** the required schema is created automatically and the application serves requests.
2. **Given** the application is running with PostgreSQL, **When** a user completes a full training session (create session, answer quizzes, evaluate), **Then** all data is persisted and retrievable identically to the SQLite deployment.
3. **Given** PostgreSQL is configured, **When** multiple concurrent requests arrive for different tenants, **Then** all requests are handled correctly with proper tenant isolation.

---

### User Story 2 - Seamless Adapter Selection via Configuration (Priority: P2)

An operator wants to choose between SQLite and PostgreSQL by setting a single environment variable, without changing any application code. The system automatically selects the correct storage adapter based on configuration.

**Why this priority**: Without a clean selection mechanism, operators would need to modify code to switch databases, which defeats the purpose of the pluggable adapter pattern already in place.

**Independent Test**: Can be tested by toggling the database configuration between SQLite and PostgreSQL connection strings and verifying the application starts correctly with each.

**Acceptance Scenarios**:

1. **Given** a PostgreSQL connection string is set in the environment, **When** the application starts, **Then** the PostgreSQL adapter is used automatically.
2. **Given** no PostgreSQL connection string is set and a SQLite path is configured (or defaulted), **When** the application starts, **Then** the SQLite adapter is used, preserving backward compatibility.
3. **Given** an invalid or unreachable database connection string is configured, **When** the application starts, **Then** a clear error message indicates the connection failure.

---

### User Story 3 - Maintain Tenant Isolation with PostgreSQL (Priority: P1)

A multi-tenant operator needs assurance that the same tenant isolation guarantees enforced in SQLite are maintained in PostgreSQL — no tenant can read, modify, or delete another tenant's data.

**Why this priority**: Tenant isolation is a security-critical requirement. Any regression in isolation when switching databases would be a severe vulnerability.

**Independent Test**: Can be tested by creating data for two separate tenants and verifying that queries scoped to one tenant never return the other tenant's data.

**Acceptance Scenarios**:

1. **Given** data exists for tenants A and B, **When** a query is made for tenant A's training sessions, **Then** only tenant A's sessions are returned.
2. **Given** a transaction is in progress for tenant A, **When** an update targets a record belonging to tenant B using tenant A's context, **Then** the update fails or returns no rows.

---

### User Story 4 - Connection Resilience and Pooling (Priority: P2)

An operator running the platform under production load needs the PostgreSQL connection to handle concurrent requests efficiently and recover gracefully from transient connection failures.

**Why this priority**: Unlike SQLite (which is file-based and local), PostgreSQL is network-accessed and requires connection management to perform well under load.

**Independent Test**: Can be tested by simulating concurrent requests and verifying no connection exhaustion or errors occur under normal load.

**Acceptance Scenarios**:

1. **Given** the application is running with PostgreSQL, **When** 50 concurrent requests arrive, **Then** all requests complete successfully without connection errors.
2. **Given** a transient database connection failure occurs, **When** the next request arrives after the database recovers, **Then** the request succeeds without requiring an application restart.
3. **Given** the application is shutting down, **When** the shutdown signal is received, **Then** all active database connections are closed cleanly.

---

### Edge Cases

- What happens when the PostgreSQL server is unreachable at application startup?
- How does the system behave when a connection is dropped mid-transaction?
- What happens when the schema already exists from a previous deployment (idempotent initialization)?
- How does the system handle PostgreSQL connection strings with SSL/TLS requirements?
- What happens when the `records` table exists but is missing expected indexes?
- How does JSON data stored differ between SQLite (`json_extract`) and PostgreSQL (`jsonb` operators) — is behavior identical for all query patterns?

## Clarifications

### Session 2026-02-22

- Q: How should the adapter factory manage the adapter lifecycle (singleton vs per-request)? → A: Shared singleton — factory creates one adapter instance with a connection pool at startup, shared by all routes.
- Q: How should PostgreSQL be made available in the test environment? → A: Testcontainers — tests automatically spin up a disposable PostgreSQL container (requires Docker).
- Q: Should the adapter expose observability signals (health checks, pool metrics)? → A: None — no observability in this feature; operators rely on PostgreSQL's own monitoring tools.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a PostgreSQL implementation of the existing `StorageAdapter` interface that passes all the same behavioral contracts as the SQLite adapter.
- **FR-002**: System MUST automatically select the appropriate storage adapter (SQLite or PostgreSQL) based on environment configuration, with SQLite as the default for backward compatibility.
- **FR-003**: System MUST create the required database schema (tables and indexes) automatically on first connection, using idempotent operations that are safe to run on an existing schema.
- **FR-004**: System MUST enforce tenant isolation in PostgreSQL identically to the SQLite adapter — every query MUST filter by `tenant_id`.
- **FR-005**: System MUST support transactions in PostgreSQL with the same semantics as the SQLite adapter, including optimistic concurrency via version checks.
- **FR-006**: System MUST manage a connection pool for PostgreSQL to handle concurrent requests efficiently.
- **FR-007**: System MUST handle connection failures gracefully, providing clear error messages without exposing internal connection details.
- **FR-008**: System MUST close all database connections cleanly on application shutdown.
- **FR-009**: System MUST support PostgreSQL connection strings with SSL/TLS parameters.
- **FR-010**: System MUST use the same JSON document-store pattern used by the SQLite adapter (single `records` table with JSON data column) to ensure behavioral parity and data portability.
- **FR-011**: System MUST support all existing `QueryFilter` operations (`where`, `orderBy`, `limit`, `offset`) using PostgreSQL-native JSON query capabilities.

### Key Entities

- **StorageAdapter (existing)**: The interface contract that both SQLite and PostgreSQL adapters implement. Defines `create`, `findById`, `findMany`, `update`, `delete`, `transaction`, `initialize`, `close`, and `getMetadata`.
- **PostgreSQL Adapter (new)**: A new implementation of `StorageAdapter` that connects to PostgreSQL, manages a connection pool, and translates the document-store operations into PostgreSQL queries using the `jsonb` column type.
- **Adapter Factory (new)**: A component that reads environment configuration and returns the appropriate `StorageAdapter` implementation as a shared singleton, replacing direct per-request adapter instantiation in route files. For PostgreSQL, the singleton holds the connection pool; for SQLite, it holds the single database connection. Routes no longer manage adapter lifecycle (no per-request `close()`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing tests pass when run against the PostgreSQL adapter with no test modifications (adapter-level behavioral parity). PostgreSQL test instances are provisioned automatically via Testcontainers (requires Docker).
- **SC-002**: The application starts and serves its first request within 5 seconds when connected to a local PostgreSQL instance.
- **SC-003**: The system handles 50 concurrent requests without connection errors or data corruption.
- **SC-004**: Switching between SQLite and PostgreSQL requires changing only environment variables — zero code changes in route files or business logic.
- **SC-005**: Tenant isolation is maintained under all query patterns with no cross-tenant data leakage.
- **SC-006**: Existing deployments using SQLite continue to work without any configuration changes (full backward compatibility).

## Assumptions

- PostgreSQL 14+ is the minimum supported version (for `jsonb` improvements and performance).
- The existing single-table document-store pattern (JSON blobs in a `records` table) will be preserved for PostgreSQL to maintain adapter parity; a future feature may introduce a relational schema.
- Connection pooling will use standard pool sizes (default ~10 connections) suitable for typical web application workloads.
- SSL/TLS configuration follows standard PostgreSQL connection string parameters (`sslmode`, `sslcert`, etc.).
- No data migration tooling between SQLite and PostgreSQL is included in this feature; that is a separate concern.
- The existing `QueryFilter` interface is sufficient — no new query operators are needed for PostgreSQL support.
- Integration and contract tests requiring PostgreSQL use Testcontainers to provision disposable instances; Docker must be available in the test environment (local dev and CI).
- No health-check endpoint or pool metrics are included in this feature; PostgreSQL observability is handled by external tooling (e.g., `pg_stat_activity`, cloud provider dashboards).
