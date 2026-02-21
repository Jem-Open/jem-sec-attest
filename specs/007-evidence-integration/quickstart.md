# Quickstart: Compliance Evidence Integration

**Branch**: `007-evidence-integration`

## Prerequisites

- Existing `jem-sec-attest` development environment running
- A Sprinto account with admin access (to generate an API key)
- A workflow check created in Sprinto (to get the `workflowCheckPk` UUID)

## 1. Get Sprinto Credentials

1. Log into Sprinto as an administrator
2. Generate an API key from the developer settings
3. Find the UUID of the workflow check you want evidence uploaded to (via Sprinto's API explorer or the workflow checks page)

## 2. Set Environment Variables

Add to your `.env` file:

```bash
# Sprinto API key for ACME tenant
ACME_SPRINTO_API_KEY=sk-sprinto-xxxxxxxxxxxxxxxx
```

## 3. Configure Tenant YAML

Edit `config/tenants/acme.yaml` to add the compliance integration block:

```yaml
name: "ACME Corp"
hostnames:
  - "acme.example.com"
emailDomains:
  - "acme.com"
settings:
  integrations:
    compliance:
      provider: "sprinto"
      apiKeyRef: "${ACME_SPRINTO_API_KEY}"
      workflowCheckId: "your-workflow-check-uuid-here"
      region: "us"     # or "eu" or "india"
```

Optional retry overrides (defaults shown):

```yaml
      retry:
        maxAttempts: 5
        initialDelayMs: 5000
        maxDelayMs: 300000
```

## 4. Verify Configuration

Restart the dev server. Valid configuration is checked at startup. If the compliance block is malformed, you'll see a validation error in the console.

```bash
pnpm dev
```

## 5. Test the Integration

Complete a training session for the configured tenant. When the session reaches "passed" or "exhausted" status:

1. Evidence is generated (existing behavior)
2. A PDF is rendered from the evidence
3. The PDF is uploaded to Sprinto via the `UploadWorkflowCheckEvidence` mutation
4. Upload status is recorded in the `compliance_uploads` collection

Check the evidence list endpoint for upload status:

```bash
curl -H "x-tenant-id: acme" -H "x-employee-id: admin" \
  http://localhost:3000/api/training/acme/evidence
```

## 6. Tenants Without Compliance

Tenants that omit the `integrations.compliance` block from their YAML config are completely unaffected. No upload is attempted, no compliance records are created.

## File Locations

| File | Purpose |
|------|---------|
| `src/compliance/types.ts` | Provider interface and config types |
| `src/compliance/orchestrator.ts` | Upload orchestration with retry logic |
| `src/compliance/providers/sprinto.ts` | Sprinto GraphQL adapter |
| `src/compliance/upload-repository.ts` | ComplianceUpload storage |
| `src/config/schema.ts` | Extended with compliance config validation |
| `src/evidence/evidence-generator.ts` | Modified to dispatch compliance upload |
