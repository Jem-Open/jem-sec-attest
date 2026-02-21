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
 * Integration tests for the compliance evidence upload orchestrator.
 * External HTTP calls (fetch) and storage are mocked; the orchestrator
 * logic under test runs without modification.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports that transitively
// reference them, because vi.mock() factories are hoisted to the top of the
// compiled output.
// ---------------------------------------------------------------------------

const { mockFetch, mockStorage, mockUploadRepo, mockEvidenceRepo, mockRenderPdf } = vi.hoisted(
  () => {
    const mockFetch = vi.fn();

    const mockStorage = {
      initialize: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn().mockImplementation((_t: string, fn: () => Promise<unknown>) => fn()),
      getMetadata: vi.fn(),
      close: vi.fn(),
    };

    const mockUploadRepo = {
      create: vi.fn(),
      findByEvidenceId: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      listByTenant: vi.fn(),
    };

    const mockEvidenceRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      listByTenant: vi.fn(),
    };

    const mockRenderPdf = vi.fn();

    return { mockFetch, mockStorage, mockUploadRepo, mockEvidenceRepo, mockRenderPdf };
  },
);

vi.stubGlobal("fetch", mockFetch);

vi.mock("../../../src/config/index.js", () => ({
  getSnapshot: vi.fn().mockReturnValue({
    tenants: new Map([
      [
        "test-tenant",
        {
          name: "Test Corp",
          settings: {
            integrations: {
              compliance: {
                provider: "sprinto",
                apiKeyRef: "${TEST_KEY}",
                workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                region: "us",
                retry: { maxAttempts: 2, initialDelayMs: 10, maxDelayMs: 50 },
              },
            },
          },
        },
      ],
      [
        "no-compliance",
        {
          name: "Plain Corp",
          settings: {},
        },
      ],
    ]),
  }),
}));

vi.mock("../../../src/compliance/upload-repository.js", () => ({
  ComplianceUploadRepository: vi.fn().mockImplementation(() => mockUploadRepo),
}));

vi.mock("../../../src/evidence/evidence-repository.js", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));

vi.mock("../../../src/evidence/pdf-renderer.js", () => ({
  renderEvidencePdf: mockRenderPdf,
}));

// Import under test — must come after vi.mock() declarations.
import { dispatchUpload } from "../../../src/compliance/orchestrator.js";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-21T10:00:00.000Z";
const EVIDENCE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const SESSION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UPLOAD_ID = "c0ffee00-beef-dead-cafe-000000000001";

function makeEvidence() {
  return {
    id: EVIDENCE_ID,
    tenantId: "test-tenant",
    sessionId: SESSION_ID,
    employeeId: "emp-001",
    schemaVersion: 1,
    contentHash: "sha256-abcdef1234567890",
    generatedAt: ISO,
    evidence: {
      session: {
        sessionId: SESSION_ID,
        employeeId: "emp-001",
        tenantId: "test-tenant",
        attemptNumber: 1,
        totalAttempts: 1,
        status: "passed",
        createdAt: ISO,
        completedAt: ISO,
      },
      policyAttestation: {
        configHash: "sha256-cfg-001",
        roleProfileId: "rp-001",
        roleProfileVersion: 1,
        appVersion: "1.0.0",
        passThreshold: 0.7,
        maxAttempts: 3,
      },
      modules: [],
      outcome: {
        aggregateScore: 0.9,
        passed: true,
        passThreshold: 0.7,
        weakAreas: null,
        moduleScores: [],
      },
    },
  };
}

function makePendingUploadRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: UPLOAD_ID,
    tenantId: "test-tenant",
    evidenceId: EVIDENCE_ID,
    sessionId: SESSION_ID,
    provider: "sprinto",
    status: "pending",
    attemptCount: 0,
    maxAttempts: 2,
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

function makeSuccessfulFetchResponse() {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      data: {
        uploadWorkflowCheckEvidence: {
          message: "Evidence uploaded",
          workflowCheck: { evidenceStatus: "accepted" },
        },
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatchUpload — compliance upload orchestrator", () => {
  // Reset all mocks between tests so state does not bleed across cases.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Happy path: tenant with compliance config, upload succeeds
  // -------------------------------------------------------------------------

  describe("tenant with compliance config — successful upload", () => {
    it("finds evidence, renders PDF, calls Sprinto, and records succeeded status", async () => {
      const evidence = makeEvidence();
      const pendingRecord = makePendingUploadRecord();
      const succeededRecord = makePendingUploadRecord({ status: "succeeded", attemptCount: 1 });

      mockUploadRepo.findByEvidenceId.mockResolvedValue(null); // no existing upload
      mockEvidenceRepo.findById.mockResolvedValue(evidence);
      mockUploadRepo.create.mockResolvedValue(pendingRecord);
      mockRenderPdf.mockResolvedValue(Buffer.from("%PDF-1.4 stub content"));
      mockFetch.mockResolvedValue(makeSuccessfulFetchResponse());
      mockUploadRepo.update.mockResolvedValue(succeededRecord);

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      // Evidence repository was queried for the evidence record
      expect(mockEvidenceRepo.findById).toHaveBeenCalledWith("test-tenant", EVIDENCE_ID);

      // PDF renderer was called with the evidence and tenant display name
      expect(mockRenderPdf).toHaveBeenCalledWith(evidence, "Test Corp");

      // Sprinto endpoint was called via fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [fetchUrl, fetchOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(fetchUrl).toBe("https://app.sprinto.com/dev-api/graphql");
      expect(fetchOptions.method).toBe("POST");

      // Upload record was created as pending, then updated to succeeded
      expect(mockUploadRepo.create).toHaveBeenCalledOnce();
      expect(mockUploadRepo.update).toHaveBeenCalledWith(
        "test-tenant",
        UPLOAD_ID,
        expect.objectContaining({ status: "succeeded", attemptCount: 1 }),
      );
    });

    it("passes api-key header resolved from env var reference", async () => {
      process.env.TEST_KEY = "resolved-api-key-value";

      mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
      mockEvidenceRepo.findById.mockResolvedValue(makeEvidence());
      mockUploadRepo.create.mockResolvedValue(makePendingUploadRecord());
      mockRenderPdf.mockResolvedValue(Buffer.from("%PDF stub"));
      mockFetch.mockResolvedValue(makeSuccessfulFetchResponse());
      mockUploadRepo.update.mockResolvedValue(
        makePendingUploadRecord({ status: "succeeded", attemptCount: 1 }),
      );

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      const [, fetchOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers["api-key"]).toBe("resolved-api-key-value");

      process.env.TEST_KEY = undefined;
    });
  });

  // -------------------------------------------------------------------------
  // 2. Tenant without compliance config — no-op
  // -------------------------------------------------------------------------

  describe("tenant without compliance config", () => {
    it("returns immediately without touching any repository or fetch", async () => {
      await dispatchUpload("no-compliance", EVIDENCE_ID, mockStorage as never);

      expect(mockEvidenceRepo.findById).not.toHaveBeenCalled();
      expect(mockUploadRepo.create).not.toHaveBeenCalled();
      expect(mockRenderPdf).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Idempotency — existing upload record skips re-upload
  // -------------------------------------------------------------------------

  describe("idempotency", () => {
    it("does not re-upload if a ComplianceUpload record already exists", async () => {
      const existingRecord = makePendingUploadRecord({ status: "succeeded" });
      mockUploadRepo.findByEvidenceId.mockResolvedValue(existingRecord);

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      expect(mockEvidenceRepo.findById).not.toHaveBeenCalled();
      expect(mockRenderPdf).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUploadRepo.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Evidence not found — records failed upload
  // -------------------------------------------------------------------------

  describe("evidence not found", () => {
    it("creates a failed upload record when evidence cannot be loaded", async () => {
      mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
      mockEvidenceRepo.findById.mockResolvedValue(null);
      mockUploadRepo.create.mockResolvedValue(makePendingUploadRecord({ status: "failed" }));

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      expect(mockUploadRepo.create).toHaveBeenCalledWith(
        "test-tenant",
        expect.objectContaining({
          evidenceId: EVIDENCE_ID,
          status: "failed",
          lastErrorCode: "EVIDENCE_NOT_FOUND",
          retryable: false,
        }),
      );

      expect(mockRenderPdf).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. PDF rendering failure — records failed upload
  // -------------------------------------------------------------------------

  describe("PDF rendering failure", () => {
    it("records a failed upload when PDF rendering throws", async () => {
      const pendingRecord = makePendingUploadRecord();
      const failedRecord = makePendingUploadRecord({ status: "failed" });

      mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
      mockEvidenceRepo.findById.mockResolvedValue(makeEvidence());
      mockUploadRepo.create.mockResolvedValue(pendingRecord);
      mockRenderPdf.mockRejectedValue(new Error("PDFKit internal error"));
      mockUploadRepo.update.mockResolvedValue(failedRecord);

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockUploadRepo.update).toHaveBeenCalledWith(
        "test-tenant",
        UPLOAD_ID,
        expect.objectContaining({
          status: "failed",
          lastErrorCode: "PDF_RENDER_FAILED",
          retryable: false,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Non-retryable upload failure — fails immediately without retrying
  // -------------------------------------------------------------------------

  describe("non-retryable provider error", () => {
    it("stops retrying immediately on AUTH_FAILED (HTTP 401)", async () => {
      const pendingRecord = makePendingUploadRecord();

      mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
      mockEvidenceRepo.findById.mockResolvedValue(makeEvidence());
      mockUploadRepo.create.mockResolvedValue(pendingRecord);
      mockRenderPdf.mockResolvedValue(Buffer.from("%PDF stub"));
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      mockUploadRepo.update.mockResolvedValue(
        makePendingUploadRecord({ status: "failed", lastErrorCode: "AUTH_FAILED" }),
      );

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      // Should only call fetch once — no retries for 401
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Final update must mark status as failed
      const updateCalls = mockUploadRepo.update.mock.calls as Array<[string, string, unknown]>;
      const lastUpdate = updateCalls[updateCalls.length - 1]?.[2];
      expect(lastUpdate).toMatchObject({ status: "failed" });
    });
  });

  // -------------------------------------------------------------------------
  // 7. Retryable failure exhausts max attempts
  // -------------------------------------------------------------------------

  describe("retryable provider error exhausts all attempts", () => {
    it("retries up to maxAttempts times then records failed status", async () => {
      const pendingRecord = makePendingUploadRecord();

      mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
      mockEvidenceRepo.findById.mockResolvedValue(makeEvidence());
      mockUploadRepo.create.mockResolvedValue(pendingRecord);
      mockRenderPdf.mockResolvedValue(Buffer.from("%PDF stub"));
      // maxAttempts is 2 for "test-tenant" — return 500 for every attempt
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      mockUploadRepo.update.mockResolvedValue(
        makePendingUploadRecord({ status: "failed", lastErrorCode: "SERVER_ERROR" }),
      );

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      // Exactly 2 fetch calls (maxAttempts: 2)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Final update marks status as failed
      const updateCalls = mockUploadRepo.update.mock.calls as Array<[string, string, unknown]>;
      const lastUpdate = updateCalls[updateCalls.length - 1]?.[2];
      expect(lastUpdate).toMatchObject({ status: "failed" });
    });
  });

  // -------------------------------------------------------------------------
  // 8. Network-level error is treated as retryable
  // -------------------------------------------------------------------------

  describe("network error", () => {
    it("treats fetch network errors as retryable and exhausts all attempts", async () => {
      const pendingRecord = makePendingUploadRecord();

      mockUploadRepo.findByEvidenceId.mockResolvedValue(null);
      mockEvidenceRepo.findById.mockResolvedValue(makeEvidence());
      mockUploadRepo.create.mockResolvedValue(pendingRecord);
      mockRenderPdf.mockResolvedValue(Buffer.from("%PDF stub"));
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      mockUploadRepo.update.mockResolvedValue(
        makePendingUploadRecord({ status: "failed", lastErrorCode: "NETWORK_ERROR" }),
      );

      await dispatchUpload("test-tenant", EVIDENCE_ID, mockStorage as never);

      // maxAttempts is 2 — fetch is called twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Unknown tenant — no-op (getSnapshot returns no match)
  // -------------------------------------------------------------------------

  describe("unknown tenant", () => {
    it("returns immediately without side effects for an unrecognised tenant", async () => {
      await dispatchUpload("ghost-tenant", EVIDENCE_ID, mockStorage as never);

      expect(mockEvidenceRepo.findById).not.toHaveBeenCalled();
      expect(mockUploadRepo.create).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
