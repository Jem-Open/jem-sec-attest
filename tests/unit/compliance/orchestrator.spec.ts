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
 * Unit tests for the compliance upload orchestrator (dispatchUpload).
 * All external dependencies are mocked via vi.hoisted().
 */

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede all imports.
// ---------------------------------------------------------------------------

const {
  mockGetSnapshot,
  mockEvidenceRepo,
  mockUploadRepo,
  mockSprintoProvider,
  mockRenderEvidencePdf,
} = vi.hoisted(() => {
  const mockGetSnapshot = vi.fn();

  const mockEvidenceRepo = {
    findById: vi.fn(),
    findBySessionId: vi.fn(),
    create: vi.fn(),
    listByTenant: vi.fn(),
  };

  const mockUploadRepo = {
    create: vi.fn(),
    findByEvidenceId: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    listByTenant: vi.fn(),
  };

  const mockSprintoProvider = {
    name: "sprinto",
    uploadEvidence: vi.fn(),
  };

  const mockRenderEvidencePdf = vi.fn();

  return {
    mockGetSnapshot,
    mockEvidenceRepo,
    mockUploadRepo,
    mockSprintoProvider,
    mockRenderEvidencePdf,
  };
});

vi.mock("@/config/index", () => ({
  getSnapshot: mockGetSnapshot,
}));

vi.mock("@/evidence/evidence-repository", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));

vi.mock("@/evidence/pdf-renderer", () => ({
  renderEvidencePdf: mockRenderEvidencePdf,
}));

vi.mock("@/compliance/upload-repository", () => ({
  ComplianceUploadRepository: vi.fn().mockImplementation(() => mockUploadRepo),
}));

vi.mock("@/compliance/providers/sprinto", () => ({
  SprintoProvider: vi.fn().mockImplementation(() => mockSprintoProvider),
}));

// ---------------------------------------------------------------------------
// Imports (after all vi.mock calls)
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";

import { dispatchUpload } from "../../../src/compliance/orchestrator.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = "test-tenant";
const EVIDENCE_ID = "ev-uuid-001";
const ISO = "2026-02-21T10:00:00.000Z";

/** A mock StorageAdapter — the orchestrator only passes it to repo constructors. */
const mockStorage = {
  initialize: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  getMetadata: vi.fn(),
  close: vi.fn(),
};

function makeSnapshotWithCompliance() {
  return {
    tenants: new Map([
      [
        TENANT_ID,
        {
          name: "Test",
          settings: {
            integrations: {
              compliance: {
                provider: "sprinto",
                apiKeyRef: "${TEST_KEY}",
                workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                region: "us",
                retry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100 },
              },
            },
          },
        },
      ],
    ]),
  };
}

function makeSnapshotWithoutCompliance() {
  return {
    tenants: new Map([
      [
        TENANT_ID,
        {
          name: "Test",
          settings: {
            integrations: {},
          },
        },
      ],
    ]),
  };
}

function makeEvidence() {
  return {
    id: EVIDENCE_ID,
    tenantId: TENANT_ID,
    sessionId: "sess-uuid-001",
    employeeId: "emp-001",
    schemaVersion: 1,
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    evidence: {} as any,
    contentHash: "abc123",
    generatedAt: ISO,
  };
}

function makePendingUploadRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "upload-uuid-001",
    tenantId: TENANT_ID,
    evidenceId: EVIDENCE_ID,
    sessionId: "sess-uuid-001",
    provider: "sprinto",
    status: "pending",
    attemptCount: 0,
    maxAttempts: 3,
    providerReferenceId: null,
    lastError: null,
    lastErrorCode: null,
    retryable: true,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatchUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Safe defaults
    mockGetSnapshot.mockReturnValue(makeSnapshotWithCompliance());
    mockEvidenceRepo.findById.mockResolvedValue(makeEvidence());
    mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
    mockUploadRepo.create.mockResolvedValue(makePendingUploadRecord());
    mockUploadRepo.update.mockImplementation(
      (_tenantId: string, _id: string, data: Record<string, unknown>) =>
        Promise.resolve({ ...makePendingUploadRecord(), ...data }),
    );
    mockRenderEvidencePdf.mockResolvedValue(Buffer.from("fake-pdf"));
    mockSprintoProvider.uploadEvidence.mockResolvedValue({
      ok: true,
      providerReferenceId: "APPROVED",
      message: "Evidence uploaded",
    });
  });

  // -------------------------------------------------------------------------
  // Skip when no compliance config
  // -------------------------------------------------------------------------

  it("returns without uploading when tenant has no compliance config", async () => {
    mockGetSnapshot.mockReturnValue(makeSnapshotWithoutCompliance());

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockUploadRepo.findByEvidenceId).not.toHaveBeenCalled();
    expect(mockSprintoProvider.uploadEvidence).not.toHaveBeenCalled();
  });

  it("returns without uploading when tenant is not found in snapshot", async () => {
    mockGetSnapshot.mockReturnValue({ tenants: new Map() });

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockUploadRepo.findByEvidenceId).not.toHaveBeenCalled();
  });

  it("returns without uploading when snapshot is null", async () => {
    mockGetSnapshot.mockReturnValue(null);

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockUploadRepo.findByEvidenceId).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it("returns without uploading when upload record already exists (idempotency)", async () => {
    const existing = makePendingUploadRecord({ status: "succeeded" });
    mockUploadRepo.findByEvidenceId.mockResolvedValue(existing);

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockRenderEvidencePdf).not.toHaveBeenCalled();
    expect(mockSprintoProvider.uploadEvidence).not.toHaveBeenCalled();
    expect(mockUploadRepo.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("creates a pending upload record before attempting upload", async () => {
    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockUploadRepo.create).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        tenantId: TENANT_ID,
        evidenceId: EVIDENCE_ID,
        provider: "sprinto",
        status: "pending",
        attemptCount: 0,
      }),
    );
  });

  it("updates upload record to succeeded on successful upload", async () => {
    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    // At least one update call should set status to succeeded
    const updateCalls = mockUploadRepo.update.mock.calls as Array<
      [string, string, Record<string, unknown>]
    >;
    const succeededCall = updateCalls.find(([, , data]) => data.status === "succeeded");
    expect(succeededCall).toBeDefined();
    expect(succeededCall?.[2]).toMatchObject({
      status: "succeeded",
      providerReferenceId: "APPROVED",
    });
  });

  it("passes the rendered PDF buffer to the provider", async () => {
    const pdfBuffer = Buffer.from("rendered-pdf-bytes");
    mockRenderEvidencePdf.mockResolvedValue(pdfBuffer);

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockSprintoProvider.uploadEvidence).toHaveBeenCalledWith(
      pdfBuffer,
      expect.objectContaining({ id: EVIDENCE_ID }),
      expect.objectContaining({ provider: "sprinto" }),
    );
  });

  // -------------------------------------------------------------------------
  // Missing evidence
  // -------------------------------------------------------------------------

  it("creates a failed upload record and returns when evidence is not found", async () => {
    mockEvidenceRepo.findById.mockResolvedValue(null);

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockUploadRepo.create).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        status: "failed",
        lastErrorCode: "EVIDENCE_NOT_FOUND",
      }),
    );
    expect(mockRenderEvidencePdf).not.toHaveBeenCalled();
    expect(mockSprintoProvider.uploadEvidence).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Non-retryable failure
  // -------------------------------------------------------------------------

  it("does not retry on non-retryable failure and marks record as failed", async () => {
    mockSprintoProvider.uploadEvidence.mockResolvedValue({
      ok: false,
      retryable: false,
      errorCode: "AUTH_FAILED",
      errorMessage: "Sprinto returned 401 Unauthorized",
    });

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    // Provider should only have been called once (no retries)
    expect(mockSprintoProvider.uploadEvidence).toHaveBeenCalledTimes(1);

    // Upload record must be marked failed
    const updateCalls = mockUploadRepo.update.mock.calls as Array<
      [string, string, Record<string, unknown>]
    >;
    const failedCall = updateCalls.find(([, , data]) => data.status === "failed");
    expect(failedCall).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Retryable failure with eventual success
  // -------------------------------------------------------------------------

  it("retries on retryable failure and succeeds on second attempt", async () => {
    mockSprintoProvider.uploadEvidence
      .mockResolvedValueOnce({
        ok: false,
        retryable: true,
        errorCode: "SERVER_ERROR",
        errorMessage: "Sprinto returned 503",
      })
      .mockResolvedValueOnce({
        ok: true,
        providerReferenceId: "APPROVED",
        message: "Evidence uploaded",
      });

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockSprintoProvider.uploadEvidence).toHaveBeenCalledTimes(2);

    const updateCalls = mockUploadRepo.update.mock.calls as Array<
      [string, string, Record<string, unknown>]
    >;
    const succeededCall = updateCalls.find(([, , data]) => data.status === "succeeded");
    expect(succeededCall).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Exhausted retries
  // -------------------------------------------------------------------------

  it("marks upload as failed after exhausting all retry attempts", async () => {
    // Always fail with a retryable error; maxAttempts is 3 in fixture config
    mockSprintoProvider.uploadEvidence.mockResolvedValue({
      ok: false,
      retryable: true,
      errorCode: "RATE_LIMITED",
      errorMessage: "Sprinto returned 429 Too Many Requests",
    });

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    // Should have attempted exactly maxAttempts times (3)
    expect(mockSprintoProvider.uploadEvidence).toHaveBeenCalledTimes(3);

    // Final update should set status to failed
    const updateCalls = mockUploadRepo.update.mock.calls as Array<
      [string, string, Record<string, unknown>]
    >;
    const failedCall = updateCalls.find(([, , data]) => data.status === "failed");
    expect(failedCall).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // PDF render failure
  // -------------------------------------------------------------------------

  it("marks upload as failed with PDF_RENDER_FAILED when PDF rendering throws", async () => {
    mockRenderEvidencePdf.mockRejectedValue(new Error("Out of memory"));

    await dispatchUpload(TENANT_ID, EVIDENCE_ID, mockStorage);

    expect(mockSprintoProvider.uploadEvidence).not.toHaveBeenCalled();

    const updateCalls = mockUploadRepo.update.mock.calls as Array<
      [string, string, Record<string, unknown>]
    >;
    const failedCall = updateCalls.find(([, , data]) => data.lastErrorCode === "PDF_RENDER_FAILED");
    expect(failedCall).toBeDefined();
    expect(failedCall?.[2]).toMatchObject({
      status: "failed",
      lastErrorCode: "PDF_RENDER_FAILED",
      retryable: false,
    });
  });
});
