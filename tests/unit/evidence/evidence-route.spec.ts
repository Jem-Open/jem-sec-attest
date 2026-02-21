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
 * Unit tests for GET /api/training/{tenant}/evidence/{sessionId}
 * T011: Returns evidence for a given session
 * T012: Role-based access control (employee, compliance, admin)
 */

import type { TrainingEvidence } from "@/evidence/schemas";

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted pattern for module-scope singletons)
// ---------------------------------------------------------------------------

const { mockStorage, mockEvidenceRepo } = vi.hoisted(() => {
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
  return { mockStorage, mockEvidenceRepo };
});

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => mockStorage),
}));
vi.mock("@/evidence/evidence-repository", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));

import { GET } from "../../../app/api/training/[tenant]/evidence/[sessionId]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  sessionId: string,
  tenantId?: string,
  employeeId?: string,
  role = "employee",
): Request {
  const url = `http://localhost:3000/api/training/${tenantId ?? "acme"}/evidence/${sessionId}`;
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
        configHash: "abc123",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/training/[tenant]/evidence/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with evidence for own session (employee)", async () => {
    const evidence = makeEvidence();
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);

    const request = makeRequest("sess-0001", "acme", "emp-100", "employee");
    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("evi-0001");
    expect(body.sessionId).toBe("sess-0001");
    expect(mockEvidenceRepo.findBySessionId).toHaveBeenCalledWith("acme", "sess-0001");
  });

  it("returns 200 for any session (compliance role)", async () => {
    const evidence = makeEvidence({ employeeId: "emp-other" });
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);

    const request = makeRequest("sess-0001", "acme", "emp-100", "compliance");
    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.employeeId).toBe("emp-other");
  });

  it("returns 200 for any session (admin role)", async () => {
    const evidence = makeEvidence({ employeeId: "emp-other" });
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);

    const request = makeRequest("sess-0001", "acme", "emp-100", "admin");
    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.employeeId).toBe("emp-other");
  });

  it("returns 403 when employee accesses another employee's evidence", async () => {
    const evidence = makeEvidence({ employeeId: "emp-other" });
    mockEvidenceRepo.findBySessionId.mockResolvedValue(evidence);

    const request = makeRequest("sess-0001", "acme", "emp-100", "employee");
    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 404 when no evidence exists", async () => {
    mockEvidenceRepo.findBySessionId.mockResolvedValue(null);

    const request = makeRequest("sess-0001", "acme", "emp-100", "employee");
    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 401 when headers missing", async () => {
    const url = "http://localhost:3000/api/training/acme/evidence/sess-0001";
    const request = new Request(url, { method: "GET" });

    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 when tenant mismatch", async () => {
    const request = makeRequest("sess-0001", "other-tenant", "emp-100", "employee");
    const response = await GET(request, makeParams("acme", "sess-0001"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("closes storage in finally block", async () => {
    mockEvidenceRepo.findBySessionId.mockRejectedValue(new Error("boom"));

    const request = makeRequest("sess-0001", "acme", "emp-100", "employee");
    await expect(GET(request, makeParams("acme", "sess-0001"))).rejects.toThrow("boom");

    expect(mockStorage.close).toHaveBeenCalled();
  });
});
