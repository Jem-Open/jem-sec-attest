/**
 * Compliance Provider Interface Contract
 *
 * This file defines the interface that all compliance provider adapters must implement.
 * It is a design artifact — not production code. The actual implementation will live
 * in src/compliance/.
 */

// === Input Types ===

/** Evidence record to upload (mirrors TrainingEvidence from src/evidence/schemas.ts) */
export interface EvidenceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly sessionId: string;
  readonly employeeId: string;
  readonly schemaVersion: number;
  readonly contentHash: string;
  readonly generatedAt: string;
  // evidence body is used to render PDF, not sent directly
}

/** Provider-specific configuration resolved from tenant YAML */
export interface ProviderConfig {
  readonly provider: string;
  readonly apiKey: string; // Resolved from env var reference at config load
  readonly workflowCheckId: string;
  readonly region: string;
  readonly retry: {
    readonly maxAttempts: number;
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
  };
}

// === Output Types ===

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

// === Provider Interface ===

/**
 * ComplianceProvider — adapter interface for external compliance platforms.
 *
 * Each provider implementation encapsulates:
 * - API authentication
 * - Payload formatting (GraphQL multipart, REST JSON, etc.)
 * - Error classification (retryable vs non-retryable)
 *
 * Providers do NOT handle retry logic — that is the orchestrator's responsibility.
 * Each call to uploadEvidence() represents a single attempt.
 */
export interface ComplianceProvider {
  /** Provider identifier (e.g., "sprinto", "drata", "vanta") */
  readonly name: string;

  /**
   * Upload a single evidence PDF to the compliance platform.
   *
   * @param pdfBuffer - The rendered PDF evidence file
   * @param evidence - Evidence metadata (for the record date and filename)
   * @param config - Resolved provider configuration for this tenant
   * @returns UploadResult indicating success or failure with error classification
   */
  uploadEvidence(
    pdfBuffer: Buffer,
    evidence: EvidenceRecord,
    config: ProviderConfig,
  ): Promise<UploadResult>;
}

// === Orchestrator Interface ===

/**
 * ComplianceUploadOrchestrator — coordinates the upload lifecycle.
 *
 * Responsibilities:
 * - Check if tenant has compliance integration enabled
 * - Resolve the correct provider from config
 * - Render evidence to PDF
 * - Execute upload with retry logic
 * - Record ComplianceUpload status to storage
 *
 * Called from generateEvidenceForSession() after evidence is persisted.
 */
export interface ComplianceUploadOrchestrator {
  /**
   * Dispatch evidence to the tenant's configured compliance provider.
   * Handles retry logic, status recording, and idempotency.
   *
   * @param tenantId - Tenant identifier
   * @param evidenceId - ID of the persisted evidence record
   * @returns void — fire-and-forget; errors are logged and recorded
   */
  dispatchUpload(tenantId: string, evidenceId: string): Promise<void>;
}
