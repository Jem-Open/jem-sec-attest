# Feature Specification: Multi-Tenant Configuration-as-Code

**Feature Branch**: `001-multi-tenant-config`
**Created**: 2026-02-16
**Status**: Draft
**Input**: User description: "Build a multi-tenant configuration-as-code system for the training platform. Tenants must be defined via YAML/JSON files, including tenant resolution rules (hostnames and/or email domains) and per-tenant settings. The application must validate configs against a schema at startup, fail fast on invalid configuration, and expose a clear error message for misconfiguration. Configs must support environment variable substitution for secrets and must never require secrets to be committed to source control. Acceptance criteria: Can run locally with two example tenants; tenant is correctly resolved; invalid config prevents startup; config hash is produced for audit evidence."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define and Load Tenant Configuration (Priority: P1)

A platform operator creates YAML or JSON configuration files that define tenants for the training platform. Each tenant file specifies the tenant's identity, resolution rules (hostnames and email domains), and per-tenant settings such as branding, feature flags, and integration endpoints. When the application starts, it reads all tenant configuration files from a designated directory, validates them against a known schema, and makes tenant definitions available for resolution at runtime.

**Why this priority**: Without the ability to define and load tenant configuration, no other multi-tenant functionality is possible. This is the foundational capability.

**Independent Test**: Can be fully tested by placing two example tenant configuration files in the config directory, starting the application, and confirming both tenants are loaded without errors.

**Acceptance Scenarios**:

1. **Given** two valid tenant configuration files exist in the config directory, **When** the application starts, **Then** both tenants are loaded and available for resolution.
2. **Given** a tenant configuration file uses YAML format, **When** the application starts, **Then** the file is parsed and loaded identically to a JSON equivalent.
3. **Given** a tenant configuration file includes an environment variable reference for a secret value, **When** the application starts with that environment variable set, **Then** the secret is substituted into the configuration without the secret appearing in source-controlled files.

---

### User Story 2 - Resolve Tenant from Request Context (Priority: P1)

When a user accesses the training platform, the system determines which tenant they belong to by matching the incoming request's hostname or the user's email domain against the tenant resolution rules defined in configuration. The correct tenant's settings are then applied for that session.

**Why this priority**: Tenant resolution is the core runtime behaviour that makes the system multi-tenant. It is equally critical to loading configuration.

**Independent Test**: Can be fully tested by sending requests with different hostnames or providing user emails with different domains and verifying the correct tenant is resolved each time.

**Acceptance Scenarios**:

1. **Given** tenant "Acme Corp" is configured with hostname `acme.training.example.com`, **When** a request arrives with that hostname, **Then** the system resolves the tenant as "Acme Corp" and applies Acme Corp's settings.
2. **Given** tenant "Globex Inc" is configured with email domain `globex.com`, **When** a user with email `user@globex.com` authenticates, **Then** the system resolves the tenant as "Globex Inc".
3. **Given** a request arrives with a hostname that matches no configured tenant, **When** tenant resolution is attempted, **Then** the system returns a clear "tenant not found" response rather than falling back silently to a default.

---

### User Story 3 - Fail Fast on Invalid Configuration (Priority: P1)

When the application starts and encounters a tenant configuration file that does not conform to the expected schema (missing required fields, invalid data types, duplicate resolution rules, etc.), it must refuse to start and display a clear, actionable error message identifying which file and which field caused the failure.

**Why this priority**: Fail-fast behaviour prevents the platform from running in a broken state, which could cause data leakage between tenants or silent misconfiguration. This is a safety-critical requirement.

**Independent Test**: Can be fully tested by introducing a deliberately invalid configuration file, attempting to start the application, and verifying it exits with a descriptive error.

**Acceptance Scenarios**:

1. **Given** a tenant configuration file is missing a required field (e.g., tenant name), **When** the application starts, **Then** it exits with an error message identifying the file and the missing field.
2. **Given** two tenant configuration files claim the same hostname, **When** the application starts, **Then** it exits with an error message identifying the conflict.
3. **Given** a configuration file references an environment variable that is not set, **When** the application starts, **Then** it exits with an error message identifying the unresolved variable.

---

### User Story 4 - Produce Configuration Hash for Audit Evidence (Priority: P2)

After successfully loading and validating all tenant configurations, the system produces a deterministic hash of the combined configuration. This hash serves as audit evidence, allowing operators to verify that the running configuration matches an expected baseline.

**Why this priority**: Audit hashing is important for compliance and governance but is not required for the core tenant resolution functionality to work.

**Independent Test**: Can be fully tested by loading the same configuration twice and verifying the hash is identical, then changing a single setting and verifying the hash changes.

**Acceptance Scenarios**:

1. **Given** all tenant configurations are valid and loaded, **When** the application completes startup, **Then** a configuration hash is logged to standard output.
2. **Given** the same set of configuration files, **When** the application starts on two separate occasions, **Then** the produced hash is identical both times.
3. **Given** a single setting is changed in one tenant's configuration, **When** the application restarts, **Then** the produced hash differs from the previous run.

---

### User Story 5 - Environment Variable Substitution for Secrets (Priority: P2)

Platform operators need to include secrets (API keys, database credentials, webhook URLs) in tenant configuration without committing those secrets to source control. Configuration files support a substitution syntax that references environment variables, and the system resolves these at startup.

**Why this priority**: Secrets management is essential for production security, but for local development with example tenants, placeholder values suffice. It builds on the configuration loading story.

**Independent Test**: Can be fully tested by defining a configuration value as an environment variable reference, setting the variable, starting the application, and verifying the resolved value is used.

**Acceptance Scenarios**:

1. **Given** a tenant configuration contains `${DATABASE_URL}` as a value, **When** the environment variable `DATABASE_URL` is set to `postgres://localhost/acme`, **Then** the resolved configuration contains `postgres://localhost/acme`.
2. **Given** a tenant configuration references `${MISSING_VAR}` and no default is specified, **When** the application starts without that variable set, **Then** the application fails to start with a clear error identifying the unresolved variable.
3. **Given** a configuration file is committed to source control, **When** inspected, **Then** no secret values are present — only environment variable references.

---

### Edge Cases

- What happens when a tenant configuration directory is empty (no tenant files)? The system should fail fast with a clear message indicating no tenants were found.
- What happens when a hostname matches one tenant but the user's email domain matches a different tenant? The system should use a defined precedence order (hostname takes precedence over email domain) and document this rule.
- What happens when a configuration file is valid YAML/JSON syntax but contains unexpected additional fields not in the schema? The system should reject unknown fields to prevent silent misconfiguration.
- What happens when two configuration files define the same tenant ID? The system should reject the duplicate and fail fast.
- What happens when environment variable values contain special characters (e.g., `$`, `{`, `}`)? The substitution mechanism should handle literal values correctly after resolution.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load tenant definitions from YAML and/or JSON files in a designated configuration directory.
- **FR-002**: System MUST validate all tenant configuration files against a defined schema at startup.
- **FR-003**: System MUST refuse to start and display a clear, actionable error message when any configuration file is invalid.
- **FR-004**: System MUST resolve the current tenant from an incoming request's hostname, matching against configured hostname rules.
- **FR-005**: System MUST resolve the current tenant from a user's email domain, matching against configured email domain rules.
- **FR-006**: System MUST apply a defined precedence order when hostname and email domain resolve to different tenants (hostname takes precedence).
- **FR-007**: System MUST support environment variable substitution in configuration values using `${VARIABLE_NAME}` syntax.
- **FR-008**: System MUST fail to start when a referenced environment variable is not set and no default value is provided.
- **FR-009**: System MUST reject configuration files that contain fields not defined in the schema (strict validation).
- **FR-010**: System MUST detect and reject duplicate resolution rules (e.g., two tenants claiming the same hostname) at startup.
- **FR-011**: System MUST produce a deterministic hash of the loaded configuration after successful validation and log it to standard output at startup.
- **FR-012**: System MUST include at least two example tenant configurations that demonstrate the full feature set for local development.
- **FR-013**: System MUST return a clear "tenant not found" response when no tenant matches the resolution criteria, rather than falling back silently.
- **FR-014**: System MUST never require secret values to be stored directly in configuration files committed to source control.
- **FR-015**: System MUST support a base/default configuration that defines default values for all tenant settings.
- **FR-016**: System MUST allow individual tenants to override any default setting; unoverridden settings inherit the base default value.
- **FR-017**: System MUST validate the merged (defaults + overrides) configuration for each tenant, not just the override fragment.
- **FR-018**: System MUST support `${VAR:-default}` syntax for optional environment variables with fallback values, in addition to the required `${VAR}` syntax.

### Key Entities

- **Tenant**: Represents a distinct organisation or customer on the platform. Key attributes: unique identifier, display name, resolution rules (one or more hostnames and/or one or more email domains), and per-tenant settings (branding, feature flags, integration endpoints).
- **Resolution Rule**: A matching criterion used to associate an incoming request or user with a tenant. Types: hostname match and email domain match. A single tenant may have multiple hostnames and multiple email domains. Each individual hostname and email domain must be unique across all tenants (no two tenants may claim the same hostname or email domain).
- **Base/Default Configuration**: A YAML or JSON file defining default values for all tenant settings. Tenants inherit these defaults and may override any subset of them.
- **Tenant Configuration File**: A YAML or JSON file defining one tenant's configuration, including identity, resolution rules, and any setting overrides. Located in a designated configuration directory. Merged with base defaults and validated against a schema at startup.
- **Configuration Hash**: A deterministic fingerprint of the entire loaded configuration set. Used for audit evidence and change detection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Platform operators can define a new tenant by adding a single configuration file, with no code changes required.
- **SC-002**: The application starts successfully with two example tenants in under 10 seconds on a standard development machine.
- **SC-003**: An invalid configuration file causes the application to exit within 5 seconds of startup with an error message that identifies the specific file and field causing the failure.
- **SC-004**: Tenant resolution correctly identifies the tenant for 100% of requests where hostname or email domain matches a configured rule.
- **SC-005**: The configuration hash is identical across repeated startups with the same configuration files and environment variables.
- **SC-006**: No secret values appear in any source-controlled configuration file; all secrets are provided exclusively through environment variables.
- **SC-007**: A platform operator with no prior knowledge of the system can set up and run the two example tenants locally by following the provided documentation.

## Clarifications

### Session 2026-02-16

- Q: Can a single tenant have multiple hostnames and/or multiple email domains? → A: Yes, a tenant can have multiple hostnames AND multiple email domains.
- Q: Should tenants inherit from default/base settings or define all settings explicitly? → A: Defaults-plus-override: a base config defines defaults; tenants override only what differs.
- Q: How should the configuration hash be surfaced for audit purposes? → A: Logged to standard output at startup only.
- Q: How many tenants should the system be designed to support? → A: Small scale: 2-20 tenants (typical internal/enterprise training platform).

## Assumptions

- The training platform is a web-based application that receives HTTP requests with identifiable hostnames.
- Each tenant configuration is defined in its own file (one file per tenant) rather than a single monolithic configuration file.
- The configuration directory path is itself configurable (e.g., via an environment variable or command-line argument), defaulting to a conventional location in the project.
- Environment variable substitution uses the `${VARIABLE_NAME}` syntax, consistent with common conventions (e.g., Docker Compose, Spring Boot).
- The configuration hash algorithm does not need to be cryptographically secure for production attestation purposes — a standard hash (e.g., SHA-256) suffices for change detection and audit evidence.
- Hostname-based resolution takes precedence over email-domain-based resolution when both are available and conflict.
- The system does not support hot-reloading of configuration changes; a restart is required to pick up changes (standard for configuration-as-code patterns).
- The system is designed for small scale (2-20 tenants), typical of an internal/enterprise training platform. Linear scanning of tenant resolution rules is acceptable at this scale.
- The constitution also references `secretRef:` syntax for secret-manager integration. This is deferred to a future feature; environment variable substitution (`${VAR}`) is sufficient for the initial release per the constitution's allowance.
