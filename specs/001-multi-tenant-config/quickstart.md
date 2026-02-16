# Quickstart: Multi-Tenant Configuration

**Branch**: `001-multi-tenant-config` | **Date**: 2026-02-16

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

```bash
# Clone and install
git clone <repo-url>
cd jem-sec-attest
pnpm install

# Copy example environment file
cp .env.example .env
```

## Example Environment Variables

```bash
# .env.example
ACME_WEBHOOK_SECRET=replace-with-real-secret
GLOBEX_API_KEY=replace-with-real-key
```

## Example Tenant Configs

The project ships with two example tenants in `config/tenants/`:

### config/defaults.yaml

```yaml
# Base settings inherited by all tenants
defaults:
  branding:
    primaryColor: "#1a1a2e"
  features:
    trainingModules: true
    certificates: true
    advancedReporting: false
  integrations:
    webhookUrl: ""
    ssoProvider: ""
  retention:
    days: 365
```

### config/tenants/acme-corp.yaml

```yaml
name: "Acme Corp"
hostnames:
  - acme.training.example.com
  - acme-legacy.example.com
emailDomains:
  - acme.com
  - acmecorp.com
settings:
  branding:
    logoUrl: "https://acme.com/logo.png"
    primaryColor: "#e94560"
    displayName: "Acme Training Portal"
  features:
    advancedReporting: true
  integrations:
    webhookUrl: "${ACME_WEBHOOK_SECRET}"
```

### config/tenants/globex-inc.yaml

```yaml
name: "Globex Inc"
hostnames:
  - globex.training.example.com
emailDomains:
  - globex.com
settings:
  branding:
    logoUrl: "https://globex.com/logo.png"
    displayName: "Globex Training Hub"
  integrations:
    webhookUrl: "${GLOBEX_API_KEY}"
```

## Run Locally

```bash
# Set required env vars
export ACME_WEBHOOK_SECRET="test-webhook-secret"
export GLOBEX_API_KEY="test-api-key"

# Start the application
pnpm dev
```

Expected startup output:

```
[config] Loaded defaults from config/defaults.yaml
[config] Loaded tenant: acme-corp (acme-corp.yaml)
[config] Loaded tenant: globex-inc (globex-inc.yaml)
[config] All 2 tenant configs validated successfully
[config] Config hash: a3f8b2c1d4e5f6... (SHA-256)
[config] Tenant resolution ready
```

## Verify Tenant Resolution

```bash
# Resolve by hostname
curl -H "Host: acme.training.example.com" http://localhost:3000/api/tenant
# → { "tenantId": "acme-corp", "name": "Acme Corp" }

# Resolve by hostname (second tenant)
curl -H "Host: globex.training.example.com" http://localhost:3000/api/tenant
# → { "tenantId": "globex-inc", "name": "Globex Inc" }

# Unknown hostname → error
curl -H "Host: unknown.example.com" http://localhost:3000/api/tenant
# → 404 { "error": "tenant_not_found" }
```

## Test Invalid Configuration

```bash
# Remove a required field to see fail-fast behaviour
# Edit config/tenants/acme-corp.yaml and remove the "name" field, then restart:
pnpm dev
# → ERROR: Config validation failed
# →   File: config/tenants/acme-corp.yaml
# →   Field: name
# →   Message: Required field "name" is missing
# → Process exited with code 1
```

## Run Tests

```bash
# Unit tests
pnpm test

# With coverage
pnpm test:coverage

# Type check
pnpm type-check

# Lint
pnpm lint
```
