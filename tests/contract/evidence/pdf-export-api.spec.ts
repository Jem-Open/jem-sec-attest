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
 * Contract tests for GET /api/training/{tenant}/evidence/{sessionId}/pdf
 * Validates HTTP status codes, content types, and response format.
 */

import type { TrainingEvidence } from "@/evidence/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted pattern for module-scope singletons)
// ---------------------------------------------------------------------------

const { mockStorage, mockEvidenceRepo, mockRenderPdf, mockGetSnapshot } = vi.hoisted(() => {
  const mockStorage = {
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation((_t: string, fn: () => unknown) => fn()),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
    close: vi.fn(),
  };
  const mockEvidenceRepo = {
    create: vi.fn(),
    findBySessionId: vi.fn(),
    findById: vi.fn(),
    listByTenant: vi.fn(),
  };
  const mockRenderPdf = vi.fn();
  const mockGetSnapshot = vi.fn();
  return { mockStorage, mockEvidenceRepo, mockRenderPdf, mockGetSnapshot };
});

vi.mock("@/storage/factory", () => ({
  getStorage: vi.fn().mockResolvedValue(mockStorage),
}));
vi.mock("@/evidence/evidence-repository", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));
vi.mock("@/evidence/pdf-renderer", () => ({
  renderEvidencePdf: mockRenderPdf,
}));
vi.mock("@/config/index", () => ({
  getSnapshot: mockGetSnapshot,
  ensureConfigLoaded: vi.fn().mockImplementation(() => Promise.resolve(mockGetSnapshot())),
}));

import { GET } from "../../../app/api/training/[tenant]/evidence/[sessionId]/pdf/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  sessionId: string,
  tenantId?: string,
  employeeId?: string,
  role = "admin",
): Request {
  const url = `http://localhost:3000/api/training/${tenantId ?? "acme"}/evidence/${sessionId}/pdf`;
  const headers = new Headers();
  if (tenantId) headers.set("x-tenant-id", tenantId);
  if (employeeId) headers.set("x-employee-id", employeeId);
  headers.set("x-employee-role", role);
  return new Request(url, { method: "GET", headers });
}

function makeParams(
  tenant: string,
  sessionId: string,
): { params: Promise<{ tenant: string; sessionId: string }> } {
  return { params: Promise.resolve({ tenant, sessionId }) };
}

function makeEvidence(overrides?: Partial<TrainingEvidence>): TrainingEvidence {
  return {
    id: "evi-0001",
    tenantId: "acme",
    sessionId: "sess-0001",
    employeeId: "emp-100",
    schemaVersion: 1,
    evidence: {
      session: {
        sessionId: "sess-0001",
        employeeId: "emp-100",
        tenantId: "acme",
        attemptNumber: 1,
        totalAttempts: 3,
        status: "passed",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T01:00:00.000Z",
      },
      policyAttestation: {
        configHash: "cfg-hash-abc123",
        roleProfileId: "rp-001",
        roleProfileVersion: 1,
        appVersion: "1.0.0",
        passThreshold: 0.7,
        maxAttempts: 3,
      },
      modules: [],
      outcome: {
        aggregateScore: 0.85,
        passed: true,
        passThreshold: 0.7,
        weakAreas: null,
        moduleScores: [],
      },
    },
    contentHash: "sha256-abc",
    generatedAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

function mockTenantSnapshot(tenantId: string, displayName?: string) {
  const tenant = {
    id: tenantId,
    name: displayName ?? tenantId,
    hostnames: [],
    emailDomains: [],
    settings: {
      branding: { displayName: displayName ?? tenantId },
    },
  };
  mockGetSnapshot.mockReturnValue({
    tenants: new Map([[tenantId, tenant]]),
    hostnameIndex: new Map(),
    emailDomainIndex: new Map(),
    configHash: "test-hash",
    loadedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/training/[tenant]/evidence/[sessionId]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantSnapshot("acme", "Acme Corp");
  });

  it("returns 200 with application/pdf content-type for completed session", async () => {
    const evidence = makeEvidence();
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content");
    mockRenderPdf.mockResolvedValue(pdfBuffer);

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("includes Content-Disposition header with correct filename", async () => {
    const evidence = makeEvidence();
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);
    mockRenderPdf.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100"),
      makeParams("acme", "sess-0001"),
    );

    const disposition = response.headers.get("content-disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("evidence-acme-emp-100-sess-0001.pdf");
  });

  it("returns 401 when not authenticated", async () => {
    const url = "http://localhost:3000/api/training/acme/evidence/sess-0001/pdf";
    const request = new Request(url, { method: "GET" });

    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 when tenant mismatch", async () => {
    const response = await GET(
      makeRequest("sess-0001", "other-tenant", "emp-100"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 404 when no evidence exists", async () => {
    mockEvidenceRepo.findBySessionId.mockResolvedValue(null);

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 403 when employee accesses another employee's evidence", async () => {
    const evidence = makeEvidence({ employeeId: "emp-other" });
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100", "employee"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("allows employee to access their own evidence", async () => {
    const evidence = makeEvidence({ employeeId: "emp-100" });
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);
    mockRenderPdf.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100", "employee"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("returns 500 when PDF generation fails", async () => {
    const evidence = makeEvidence();
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);
    mockRenderPdf.mockRejectedValue(new Error("PDF rendering exploded"));

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("pdf_generation_failed");
    expect(body.message).toContain("PDF rendering exploded");
  });

  it("returns 409 when session is not in terminal state", async () => {
    const evidence = makeEvidence();
    // Simulate corrupted/non-terminal status in evidence
    evidence.evidence.session.status = "in-progress" as "passed";
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);

    const response = await GET(
      makeRequest("sess-0001", "acme", "emp-100"),
      makeParams("acme", "sess-0001"),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("conflict");
  });
});
