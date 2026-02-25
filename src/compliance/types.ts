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
 * Compliance provider interface and types.
 * Constitution Principle V: Pluggable Architecture — new providers
 * implement ComplianceProvider without modifying orchestration logic.
 */

import type { TrainingEvidence } from "../evidence/schemas";

// ---------------------------------------------------------------------------
// Upload result — discriminated union
// ---------------------------------------------------------------------------

export interface UploadSuccess {
  readonly ok: true;
  readonly providerReferenceId: string | null;
  readonly message: string;
}

export interface UploadFailure {
  readonly ok: false;
  readonly retryable: boolean;
  readonly errorCode: string;
  readonly errorMessage: string;
}

export type UploadResult = UploadSuccess | UploadFailure;

// ---------------------------------------------------------------------------
// Provider configuration (resolved from tenant YAML at runtime)
// ---------------------------------------------------------------------------

export interface ComplianceProviderConfig {
  readonly provider: string;
  readonly apiKey: string;
  readonly workflowCheckId: string;
  readonly region: string;
  readonly retry: {
    readonly maxAttempts: number;
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
  };
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * ComplianceProvider — adapter interface for external compliance platforms.
 *
 * Each implementation encapsulates API authentication, payload formatting,
 * and error classification. Providers do NOT handle retry logic — that is
 * the orchestrator's responsibility.
 */
export interface ComplianceProvider {
  readonly name: string;

  /**
   * Upload a single evidence PDF to the compliance platform.
   * Each call represents a single attempt (no retries).
   */
  uploadEvidence(
    pdfBuffer: Buffer,
    evidence: TrainingEvidence,
    config: ComplianceProviderConfig,
  ): Promise<UploadResult>;
}

// ---------------------------------------------------------------------------
// Compliance upload record (persisted in storage)
// ---------------------------------------------------------------------------

export interface ComplianceUploadRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly evidenceId: string;
  readonly sessionId: string;
  readonly provider: string;
  readonly status: "pending" | "succeeded" | "failed";
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly providerReferenceId: string | null;
  readonly lastError: string | null;
  readonly lastErrorCode: string | null;
  readonly retryable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}
