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
 * Compliance upload orchestrator — coordinates the evidence upload lifecycle.
 *
 * Responsibilities:
 * - Check if tenant has compliance integration enabled
 * - Idempotency check (no duplicate uploads)
 * - Render evidence to PDF
 * - Execute upload with in-process retry (exponential backoff + jitter)
 * - Record ComplianceUpload status to storage
 */

import { AuditLogger } from "../audit/audit-logger.js";
import { getSnapshot } from "../config/index.js";
import { EvidenceRepository } from "../evidence/evidence-repository.js";
import { renderEvidencePdf } from "../evidence/pdf-renderer.js";
import type { StorageAdapter } from "../storage/adapter.js";
import { SprintoProvider } from "./providers/sprinto.js";
import type { ComplianceConfig } from "./schemas.js";
import type {
  ComplianceProvider,
  ComplianceProviderConfig,
  ComplianceUploadRecord,
} from "./types.js";
import { ComplianceUploadRepository } from "./upload-repository.js";

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers: Record<string, ComplianceProvider> = {
  sprinto: new SprintoProvider(),
};

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function computeDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelayMs * 2 ** attempt;
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Add jitter: random value between 0 and 50% of the delay
  const jitter = Math.random() * cappedDelay * 0.5;
  return Math.floor(cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function resolveProviderConfig(complianceConfig: ComplianceConfig): ComplianceProviderConfig {
  // Resolve the env var reference for apiKeyRef.
  // Supports two modes:
  // - ${VAR_NAME} pattern (when loaded via loadConfig without text substitution)
  // - Already-resolved value (when loaded via loadConfigFromFiles with env substitution)
  const envVarMatch = complianceConfig.apiKeyRef.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  const envVarName = envVarMatch?.[1];
  const apiKey = envVarName ? (process.env[envVarName] ?? "") : complianceConfig.apiKeyRef;

  return {
    provider: complianceConfig.provider,
    apiKey,
    workflowCheckId: complianceConfig.workflowCheckId,
    region: complianceConfig.region,
    retry: {
      maxAttempts: complianceConfig.retry.maxAttempts,
      initialDelayMs: complianceConfig.retry.initialDelayMs,
      maxDelayMs: complianceConfig.retry.maxDelayMs,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch evidence to the tenant's configured compliance provider.
 * Handles retry logic, status recording, and idempotency.
 *
 * Fire-and-forget safe — all errors are caught, logged, and recorded.
 */
export async function dispatchUpload(
  tenantId: string,
  evidenceId: string,
  storage: StorageAdapter,
): Promise<void> {
  // 1. Check if tenant has compliance integration enabled
  const snapshot = getSnapshot();
  const tenant = snapshot?.tenants.get(tenantId);
  const complianceConfig = tenant?.settings?.integrations?.compliance as
    | ComplianceConfig
    | undefined;

  if (!complianceConfig) {
    return; // No compliance integration — nothing to do
  }

  const uploadRepo = new ComplianceUploadRepository(storage);
  const evidenceRepo = new EvidenceRepository(storage);
  const providerConfig = resolveProviderConfig(complianceConfig);

  // 2. Resolve provider
  const provider = providers[complianceConfig.provider];
  if (!provider) {
    console.error(
      `[compliance] Unknown provider "${complianceConfig.provider}" for tenant "${tenantId}"`,
    );
    return;
  }

  // 3. Idempotency check
  const existing = await uploadRepo.findByEvidenceId(tenantId, evidenceId, provider.name);
  if (existing) {
    console.info(
      `[compliance] Upload already exists for evidence "${evidenceId}" (status: ${existing.status})`,
    );
    return;
  }

  // 4. Load evidence record
  const evidence = await evidenceRepo.findById(tenantId, evidenceId);
  if (!evidence) {
    console.error(`[compliance] Evidence "${evidenceId}" not found for tenant "${tenantId}"`);
    await uploadRepo.create(tenantId, {
      tenantId,
      evidenceId,
      sessionId: "",
      provider: provider.name,
      status: "failed",
      attemptCount: 0,
      maxAttempts: providerConfig.retry.maxAttempts,
      providerReferenceId: null,
      lastError: "Evidence record not found",
      lastErrorCode: "EVIDENCE_NOT_FOUND",
      retryable: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    return;
  }

  // 5. Create pending upload record
  const now = new Date().toISOString();
  const uploadRecord = await uploadRepo.create(tenantId, {
    tenantId,
    evidenceId,
    sessionId: evidence.sessionId,
    provider: provider.name,
    status: "pending",
    attemptCount: 0,
    maxAttempts: providerConfig.retry.maxAttempts,
    providerReferenceId: null,
    lastError: null,
    lastErrorCode: null,
    retryable: true,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });

  // 6. Render PDF
  const tenantDisplayName = tenant?.name ?? tenantId;
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderEvidencePdf(evidence, tenantDisplayName);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[compliance] PDF rendering failed for evidence "${evidenceId}": ${message}`);
    await updateUploadStatus(uploadRepo, tenantId, uploadRecord, {
      status: "failed",
      lastError: `PDF rendering failed: ${message}`,
      lastErrorCode: "PDF_RENDER_FAILED",
      retryable: false,
    });
    return;
  }

  // 7. Execute upload with retry loop
  const { maxAttempts, initialDelayMs, maxDelayMs } = providerConfig.retry;
  let lastResult = uploadRecord;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = computeDelay(attempt - 1, initialDelayMs, maxDelayMs);
      console.info(
        `[compliance] Retry ${attempt}/${maxAttempts - 1} for evidence "${evidenceId}" ` +
          `(provider: ${provider.name}, delay: ${delay}ms)`,
      );
      await sleep(delay);
    }

    const result = await provider.uploadEvidence(pdfBuffer, evidence, providerConfig);

    if (result.ok) {
      console.info(
        `[compliance] Upload succeeded for evidence "${evidenceId}" ` +
          `(provider: ${provider.name}, attempts: ${attempt + 1})`,
      );
      const auditLogger = new AuditLogger(storage);
      await auditLogger.log(tenantId, {
        eventType: "integration-push-success",
        employeeId: null,
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId: evidence.sessionId,
          provider: provider.name,
          uploadId: uploadRecord.id,
          evidenceId,
        },
      });
      await updateUploadStatus(uploadRepo, tenantId, lastResult, {
        status: "succeeded",
        attemptCount: attempt + 1,
        providerReferenceId: result.providerReferenceId,
        lastError: null,
        lastErrorCode: null,
        retryable: false,
      });
      return;
    }

    // Update with failure details
    lastResult = await updateUploadStatus(uploadRepo, tenantId, lastResult, {
      attemptCount: attempt + 1,
      lastError: result.errorMessage,
      lastErrorCode: result.errorCode,
      retryable: result.retryable,
    });

    console.error(
      `[compliance] Upload attempt ${attempt + 1}/${maxAttempts} failed for evidence "${evidenceId}" ` +
        `(provider: ${provider.name}, errorCode: ${result.errorCode}, retryable: ${result.retryable})`,
    );

    // Non-retryable error — fail immediately
    if (!result.retryable) {
      await updateUploadStatus(uploadRepo, tenantId, lastResult, {
        status: "failed",
      });
      return;
    }
  }

  // All retries exhausted
  console.error(
    `[compliance] All ${maxAttempts} attempts exhausted for evidence "${evidenceId}" ` +
      `(provider: ${provider.name})`,
  );
  const auditLoggerFail = new AuditLogger(storage);
  await auditLoggerFail.log(tenantId, {
    eventType: "integration-push-failure",
    employeeId: null,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId: evidence.sessionId,
      provider: provider.name,
      error: lastResult.lastError ?? "All retries exhausted",
      evidenceId,
    },
  });
  await updateUploadStatus(uploadRepo, tenantId, lastResult, {
    status: "failed",
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateUploadStatus(
  repo: ComplianceUploadRepository,
  tenantId: string,
  current: ComplianceUploadRecord,
  updates: Partial<ComplianceUploadRecord>,
): Promise<ComplianceUploadRecord> {
  const now = new Date().toISOString();
  const completedAt =
    updates.status === "succeeded" || updates.status === "failed" ? now : current.completedAt;

  return repo.update(tenantId, current.id, {
    ...updates,
    updatedAt: now,
    completedAt,
  });
}
