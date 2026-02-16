# Security Guidance

This document outlines security best practices and built-in protections for the jem-sec-attest multi-tenant configuration system.

## Environment Variable Management

The configuration system uses environment variables to inject secrets at runtime without hardcoding sensitive values in configuration files.

### Best Practices

- **Use variable syntax**: Reference secrets using `${VAR}` or `${VAR:-default}` syntax in your configuration files
- **Never commit secrets**: Add `.env` files to `.gitignore` to prevent accidental commits
- **Use templates**: Maintain `.env.example` as a template showing required variables without actual secrets
- **Scope appropriately**: Use distinct variable names per environment (dev, staging, prod)
- **Rotate regularly**: Implement periodic rotation schedules for sensitive credentials

### Syntax

```yaml
# Simple reference
apiKey: ${API_KEY}

# With default fallback
timeout: ${REQUEST_TIMEOUT:-30}
```

Variables are resolved at startup. Missing required variables will cause validation failures and prevent system startup.

## Sensitive Variable Denylist

The system automatically detects and protects sensitive variables based on naming patterns.

### Protected Patterns

Variables matching these patterns are considered sensitive:

- `*_SECRET`
- `*_KEY`
- `*_PASSWORD`
- `*_TOKEN`

### Behavior

- **Runtime resolution**: Values are fully resolved and available for application use
- **Log redaction**: Variable values are redacted in all log output (shown as `[REDACTED]`)
- **Audit safety**: Configuration hashes are logged for audit purposes, but the hash input (containing resolved secrets) is never logged

### Example

```yaml
# Configuration file
smtp:
  password: ${SMTP_PASSWORD}
  host: ${SMTP_HOST}

# Log output
# ✓ SMTP_HOST: mail.example.com
# ✓ SMTP_PASSWORD: [REDACTED]
```

## Tenant Isolation

The multi-tenant architecture enforces strict isolation between tenant data.

### Storage Scoping

- **All operations scoped**: Every storage operation is automatically scoped to a `tenantId`
- **Interface enforcement**: The `StorageAdapter` interface prevents cross-tenant access
- **No data leakage**: It is impossible to read or modify another tenant's configuration through the API

### Global Uniqueness Constraints

The system enforces global uniqueness for resolution rules to prevent conflicts and tenant impersonation:

- **Hostnames**: No two tenants can claim the same hostname in their resolution rules
- **Email domains**: No two tenants can claim the same email domain in their resolution rules

These constraints are validated during configuration updates and will reject attempts to create duplicate claims.

### Example

```typescript
// Every StorageAdapter method requires tenantId — no cross-tenant access is possible
await storage.findById("tenant-a", "settings", recordId); // ✓ Scoped to tenant-a
await storage.findMany("tenant-a", "settings", { where: {} }); // ✓ Only tenant-a records

// Attempting to read tenant-b data requires passing "tenant-b" explicitly.
// The adapter enforces WHERE tenant_id = ? on every query.
```

## Network Exposure

The configuration system is designed to minimize attack surface.

### Startup-Only Execution

- **Load time**: Configuration is loaded and validated at application startup
- **No runtime endpoints**: No HTTP endpoints expose raw configuration data during runtime
- **Read-only after load**: Configuration becomes read-only after initial validation

### Audit Trail

- **Configuration hash**: A hash of the resolved configuration is logged for audit purposes
- **Secret protection**: The hash input (which contains resolved secrets) is never logged
- **Change detection**: Hash changes indicate configuration modifications

### Example Log Output

```
[INFO] Configuration loaded for tenant: acme-corp
[INFO] Configuration hash: sha256:a3f8b9c2d1e4...
[INFO] Validation passed: 12 rules, 3 tenants
```

## Configuration Validation

Strict validation prevents misconfigurations and security issues.

### Schema Validation

- **Strict mode**: Unknown fields in configuration files are rejected
- **Type checking**: All fields are validated against expected types
- **Format validation**: URLs, emails, and patterns are validated for correct format

### Required Fields

- **Fail-fast**: Missing required fields cause immediate startup failure
- **Clear errors**: Validation errors include field names and expected values
- **No partial loads**: System will not start with invalid configuration

### Cross-Tenant Validation

- **Uniqueness enforcement**: Hostnames and email domains must be globally unique
- **Conflict detection**: Duplicate claims are detected and rejected
- **Atomic updates**: Configuration updates are atomic per tenant

### Example Validation Error

```
[ERROR] Configuration validation failed:
  - Missing required field: tenantId
  - Duplicate hostname claim: app.example.com (already claimed by tenant-a)
  - Invalid email domain format: @invalid..com
```

## Secret Reference Roadmap

The configuration system's secret management capabilities are evolving.

### Current Implementation

- **Environment variables**: The `${VAR}` syntax is the current mechanism for secret injection
- **Runtime resolution**: Secrets are resolved at startup from environment variables
- **Denylist protection**: Automatic detection and redaction of sensitive variables

### Planned Features

- **Vault integration**: Support for HashiCorp Vault via `secretRef:` syntax
- **KMS support**: Integration with cloud KMS services (AWS KMS, GCP KMS, Azure Key Vault)
- **Secret rotation**: Automatic secret rotation without application restart
- **Dynamic resolution**: Runtime secret resolution for long-running processes

### Future Syntax (Planned)

```yaml
# Proposed secretRef syntax (not yet implemented)
smtp:
  password:
    secretRef:
      provider: vault
      path: secret/data/smtp
      key: password
```

Stay tuned for updates in future releases.

## Reporting Security Issues

If you discover a security vulnerability in jem-sec-attest, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Contact the maintainers privately via the project's security contact
3. Provide detailed information about the vulnerability
4. Allow time for a fix to be developed and released

We are committed to addressing security issues promptly and transparently.
