// Copyright 2026 jem-sec-attest contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Sprinto compliance provider — uploads evidence PDFs via GraphQL multipart.
 * See contracts/sprinto-graphql.md for the full API contract.
 */

import type { TrainingEvidence } from "../../evidence/schemas.js";
import type { ComplianceProvider, ComplianceProviderConfig, UploadResult } from "../types.js";

// ---------------------------------------------------------------------------
// Regional endpoints
// ---------------------------------------------------------------------------

const SPRINTO_ENDPOINTS: Record<string, string> = {
  us: "https://app.sprinto.com/dev-api/graphql",
  eu: "https://eu.sprinto.com/dev-api/graphql",
  india: "https://in.sprinto.com/dev-api/graphql",
};

export function getSprintoEndpoint(region: string): string {
  const url = SPRINTO_ENDPOINTS[region];
  if (!url) {
    throw new Error(`Unknown Sprinto region: ${region}. Expected one of: us, eu, india`);
  }
  return url;
}

// ---------------------------------------------------------------------------
// GraphQL mutation
// ---------------------------------------------------------------------------

const UPLOAD_MUTATION = `mutation UploadWorkflowCheckEvidence(
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
}`;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const NON_RETRYABLE_GRAPHQL_ERRORS = new Set([
  "Incorrect check ID",
  "Check in review",
  "Unsupported file format",
]);

function classifyHttpError(status: number, statusText: string): UploadResult {
  if (status === 401) {
    return {
      ok: false,
      retryable: false,
      errorCode: "AUTH_FAILED",
      errorMessage: `Sprinto returned 401 Unauthorized: ${statusText}`,
    };
  }
  if (status === 429) {
    return {
      ok: false,
      retryable: true,
      errorCode: "RATE_LIMITED",
      errorMessage: `Sprinto returned 429 Too Many Requests: ${statusText}`,
    };
  }
  // 5xx server errors are retryable
  if (status >= 500) {
    return {
      ok: false,
      retryable: true,
      errorCode: "SERVER_ERROR",
      errorMessage: `Sprinto returned ${status}: ${statusText}`,
    };
  }
  // Other client errors (400, 403, 404, etc.) are not retryable
  return {
    ok: false,
    retryable: false,
    errorCode: "CLIENT_ERROR",
    errorMessage: `Sprinto returned ${status}: ${statusText}`,
  };
}

function classifyGraphQLError(errors: Array<{ message: string }>): UploadResult {
  const firstError = errors[0];
  const message = firstError?.message ?? "Unknown GraphQL error";

  const retryable = !NON_RETRYABLE_GRAPHQL_ERRORS.has(message);
  let errorCode = "GRAPHQL_ERROR";

  if (message === "Incorrect check ID") {
    errorCode = "INVALID_CHECK_ID";
  } else if (message === "Check in review") {
    errorCode = "CHECK_LOCKED";
  } else if (message === "Unsupported file format") {
    errorCode = "UNSUPPORTED_FORMAT";
  }

  return {
    ok: false,
    retryable,
    errorCode,
    errorMessage: message,
  };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class SprintoProvider implements ComplianceProvider {
  readonly name = "sprinto";

  async uploadEvidence(
    pdfBuffer: Buffer,
    evidence: TrainingEvidence,
    config: ComplianceProviderConfig,
  ): Promise<UploadResult> {
    const endpoint = getSprintoEndpoint(config.region);
    const evidenceDate = evidence.generatedAt.split("T")[0]; // YYYY-MM-DD
    const filename = `evidence-${evidence.sessionId}.pdf`;

    // Build GraphQL multipart request per spec
    const operations = JSON.stringify({
      query: UPLOAD_MUTATION,
      variables: {
        workflowCheckPk: config.workflowCheckId,
        evidenceRecordDate: evidenceDate,
        evidenceFile: null,
      },
    });

    const map = JSON.stringify({ "0": ["variables.evidenceFile"] });

    const formData = new FormData();
    formData.append("operations", operations);
    formData.append("map", map);
    formData.append(
      "0",
      new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }),
      filename,
    );

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "api-key": config.apiKey },
        body: formData,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        retryable: true,
        errorCode: "NETWORK_ERROR",
        errorMessage: `Network error uploading to Sprinto: ${message}`,
      };
    }

    // HTTP-level errors
    if (!response.ok) {
      return classifyHttpError(response.status, response.statusText);
    }

    // Parse GraphQL response
    let body: {
      data?: {
        uploadWorkflowCheckEvidence?: {
          message: string;
          workflowCheck: { evidenceStatus: string };
        };
      };
      errors?: Array<{ message: string }>;
    };

    try {
      body = (await response.json()) as typeof body;
    } catch {
      return {
        ok: false,
        retryable: true,
        errorCode: "PARSE_ERROR",
        errorMessage: "Failed to parse Sprinto response as JSON",
      };
    }

    // GraphQL application errors
    if (body.errors && body.errors.length > 0) {
      return classifyGraphQLError(body.errors);
    }

    // Success
    const uploadData = body.data?.uploadWorkflowCheckEvidence;
    return {
      ok: true,
      providerReferenceId: uploadData?.workflowCheck?.evidenceStatus ?? null,
      message: uploadData?.message ?? "Evidence uploaded",
    };
  }
}
