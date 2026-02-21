# Sprinto GraphQL Contract

**Mutation**: `UploadWorkflowCheckEvidence`

## Request

**Endpoint** (by region):

| Region | URL |
|--------|-----|
| us | `https://app.sprinto.com/dev-api/graphql` |
| eu | `https://eu.sprinto.com/dev-api/graphql` |
| india | `https://in.sprinto.com/dev-api/graphql` |

**Headers**:

```
api-key: <resolved from tenant config apiKeyRef>
content-type: multipart/form-data
```

**GraphQL Mutation**:

```graphql
mutation UploadWorkflowCheckEvidence(
  $workflowCheckPk: UUID!,
  $evidenceRecordDate: DateTime!,
  $evidenceFile: Upload!
) {
  uploadWorkflowCheckEvidence(
    workflowCheckPk: $workflowCheckPk,
    evidenceRecordDate: $evidenceRecordDate,
    evidenceFile: $evidenceFile
  ) {
    message
    workflowCheck {
      evidenceStatus
    }
  }
}
```

**Variables mapping**:

| Variable | Source | Format |
|----------|--------|--------|
| `workflowCheckPk` | `config.workflowCheckId` | UUID string |
| `evidenceRecordDate` | `evidence.generatedAt` | `YYYY-MM-DD` (date only) |
| `evidenceFile` | `renderEvidencePdf(evidence, tenantName)` | PDF buffer, filename: `evidence-{sessionId}.pdf` |

**Multipart body** (GraphQL multipart request spec):

```
Part 1: "operations" → JSON: { query, variables: { ..., evidenceFile: null } }
Part 2: "map" → JSON: { "0": ["variables.evidenceFile"] }
Part 3: "0" → File: evidence PDF with Content-Type: application/pdf
```

## Success Response

```json
{
  "data": {
    "uploadWorkflowCheckEvidence": {
      "message": "Evidence uploaded for this check",
      "workflowCheck": {
        "evidenceStatus": "UPLOAD_COMPLETE"
      }
    }
  }
}
```

**Map to UploadSuccess**:

```typescript
{
  ok: true,
  providerReferenceId: "UPLOAD_COMPLETE",  // evidenceStatus value
  message: response.data.uploadWorkflowCheckEvidence.message
}
```

## Error Responses

### HTTP-level errors (non-200)

| HTTP Code | Retryable | Map to |
|-----------|-----------|--------|
| 401 | No | `{ ok: false, retryable: false, errorCode: "AUTH_FAILED", errorMessage: "..." }` |
| 429 | Yes | `{ ok: false, retryable: true, errorCode: "RATE_LIMITED", errorMessage: "..." }` |
| 5xx | Yes | `{ ok: false, retryable: true, errorCode: "SERVER_ERROR", errorMessage: "..." }` |

### GraphQL application errors (HTTP 200 with errors array)

| Error message | Retryable | Map to |
|---------------|-----------|--------|
| "Incorrect check ID" | No | `{ ok: false, retryable: false, errorCode: "INVALID_CHECK_ID", errorMessage: "..." }` |
| "Check in review" | No | `{ ok: false, retryable: false, errorCode: "CHECK_LOCKED", errorMessage: "..." }` |
| "Unsupported file format" | No | `{ ok: false, retryable: false, errorCode: "UNSUPPORTED_FORMAT", errorMessage: "..." }` |

### Network errors

| Error | Retryable | Map to |
|-------|-----------|--------|
| ECONNREFUSED / ETIMEDOUT / fetch abort | Yes | `{ ok: false, retryable: true, errorCode: "NETWORK_ERROR", errorMessage: "..." }` |

## Tenant YAML Config Example

```yaml
# tenants/acme.yaml
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
      workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      region: "us"
      retry:
        maxAttempts: 5
        initialDelayMs: 5000
        maxDelayMs: 300000
```
