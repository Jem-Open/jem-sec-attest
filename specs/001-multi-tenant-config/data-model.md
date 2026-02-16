# Data Model: Multi-Tenant Configuration-as-Code

**Branch**: `001-multi-tenant-config` | **Date**: 2026-02-16

## Entities

### Tenant

Represents a distinct organisation on the platform.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | string | Required, unique, slug format (`^[a-z0-9-]+$`) | Immutable identifier derived from filename |
| name | string | Required, non-empty | Human-readable display name |
| hostnames | string[] | Optional, each globally unique | Hostnames for request-based resolution |
| emailDomains | string[] | Optional, each globally unique | Email domains for user-based resolution |
| settings | TenantSettings | Required after merge with defaults | Per-tenant configuration overrides |

**Validation rules**:
- At least one of `hostnames` or `emailDomains` must be non-empty (a tenant must be resolvable).
- No hostname or email domain may appear in more than one tenant.
- `id` is derived from the config filename (e.g., `acme-corp.yaml` → `acme-corp`).

### TenantSettings

Per-tenant settings, merged with base defaults.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| branding.logoUrl | string | Optional, valid URL or env ref | Tenant logo |
| branding.primaryColor | string | Optional, hex color | Theme color |
| branding.displayName | string | Optional | Override for UI display |
| features | Record<string, boolean> | Optional | Feature flags |
| integrations.webhookUrl | string | Optional, URL or env ref | Webhook endpoint |
| integrations.ssoProvider | string | Optional | SSO provider identifier |
| retention.days | number | Optional, positive integer | Data retention period |

**Extensibility**: The settings schema is open to new fields as features are added. Each new top-level settings key must be added to the schema with a default value in the base config.

### BaseConfig

Defines default values for all tenant settings.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| defaults | TenantSettings | Required, all fields populated | Base values inherited by all tenants |

### ResolutionRule

Logical entity representing a hostname or email domain mapped to a tenant.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| type | "hostname" \| "emailDomain" | Required | Resolution strategy type |
| value | string | Required, globally unique per type | The hostname or email domain |
| tenantId | string | Required | References owning Tenant.id |

**Uniqueness**: Built as an in-memory index at startup from all tenant configs. Used for O(1) resolution lookups.

### ConfigSnapshot

Represents the validated, merged configuration state at a point in time.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| tenants | Map<string, Tenant> | Non-empty | All loaded tenants keyed by id |
| hostnameIndex | Map<string, string> | — | hostname → tenantId lookup |
| emailDomainIndex | Map<string, string> | — | emailDomain → tenantId lookup |
| configHash | string | SHA-256 hex digest | Deterministic hash of entire config |
| loadedAt | Date | — | Timestamp of config load |

## Relationships

```
BaseConfig (1) ──defaults──> TenantSettings
Tenant (1) ──overrides──> TenantSettings
Tenant (1) ──has many──> ResolutionRule
ConfigSnapshot (1) ──contains many──> Tenant
ConfigSnapshot (1) ──indexes──> ResolutionRule
```

## State Transitions

Configuration loading is a one-shot pipeline (no runtime state changes):

```
Files on Disk
  → Parse YAML/JSON
  → Substitute env vars
  → Validate individual files against schema
  → Merge each tenant with base defaults
  → Validate merged configs
  → Check global uniqueness (hostnames, email domains, tenant IDs)
  → Build resolution indexes
  → Compute config hash
  → Freeze ConfigSnapshot (immutable)
```

If any step fails, the system exits with an error. There is no partial-load state.

## File Layout on Disk

```
config/
├── defaults.yaml          # BaseConfig — default settings for all tenants
├── tenants/
│   ├── acme-corp.yaml     # Tenant config for Acme Corp
│   └── globex-inc.yaml    # Tenant config for Globex Inc
└── schema/
    └── tenant.schema.json # Published JSON Schema (generated from Zod)
```
