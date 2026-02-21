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
 * Unit tests for GET /api/training/{tenant}/evidence.
 * All external dependencies are mocked.
 */

const { mockStorage, mockEvidenceRepo } = vi.hoisted(() => {
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
  const mockEvidenceRepo = {
    listByTenant: vi.fn(),
    findBySessionId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
  };
  return { mockStorage, mockEvidenceRepo };
});

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => mockStorage),
}));

vi.mock("@/evidence/evidence-repository", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));

import type { TrainingEvidence } from "@/evidence/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../../app/api/training/[tenant]/evidence/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";

function makeRequest(tenantId = "acme-corp", queryParams = "", role = "admin"): Request {
  const url = `http://localhost:3000/api/training/${tenantId}/evidence${queryParams ? `?${queryParams}` : ""}`;
  const headers: Record<string, string> = {
    "x-tenant-id": tenantId,
    "x-employee-id": "emp-001",
  };
  if (role) {
    headers["x-employee-role"] = role;
  }
  return new Request(url, { method: "GET", headers });
}

function makeParams(tenant = "acme-corp") {
  return { params: Promise.resolve({ tenant }) };
}

function makeEvidence(overrides?: Partial<TrainingEvidence>): TrainingEvidence {
  return {
    id: "ev-uuid-001",
    tenantId: "acme-corp",
    sessionId: "session-uuid-001",
    employeeId: "emp-001",
    schemaVersion: 1,
    evidence: {
      session: {
        sessionId: "session-uuid-001",
        employeeId: "emp-001",
        tenantId: "acme-corp",
        attemptNumber: 1,
        totalAttempts: 1,
        status: "passed",
        createdAt: ISO,
        completedAt: ISO,
      },
      policyAttestation: {
        configHash: "hash-123",
        roleProfileId: "profile-001",
        roleProfileVersion: 1,
        appVersion: "0.1.0",
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
    contentHash: "sha256-abc123",
    generatedAt: ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/training/{tenant}/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [], total: 0 });
  });

  it("returns 200 with paginated results for admin", async () => {
    const items = [
      makeEvidence(),
      makeEvidence({ id: "ev-uuid-002", sessionId: "session-uuid-002" }),
    ];
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items, total: 2 });

    const response = await GET(makeRequest(), makeParams());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  it("returns 200 with paginated results for compliance", async () => {
    const items = [makeEvidence()];
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items, total: 1 });

    const response = await GET(makeRequest("acme-corp", "", "compliance"), makeParams());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("returns 403 for employee role", async () => {
    const response = await GET(makeRequest("acme-corp", "", "employee"), makeParams());
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 403 for default role (no header)", async () => {
    const url = "http://localhost:3000/api/training/acme-corp/evidence";
    const request = new Request(url, {
      method: "GET",
      headers: {
        "x-tenant-id": "acme-corp",
        "x-employee-id": "emp-001",
        // no x-employee-role header
      },
    });

    const response = await GET(request, makeParams());
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("passes employeeId filter to repository", async () => {
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [], total: 0 });

    await GET(makeRequest("acme-corp", "employeeId=emp-001"), makeParams());

    expect(mockEvidenceRepo.listByTenant).toHaveBeenCalledWith(
      "acme-corp",
      expect.objectContaining({ employeeId: "emp-001" }),
    );
  });

  it("passes outcome filter to repository", async () => {
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [], total: 0 });

    await GET(makeRequest("acme-corp", "outcome=passed"), makeParams());

    expect(mockEvidenceRepo.listByTenant).toHaveBeenCalledWith(
      "acme-corp",
      expect.objectContaining({ outcome: "passed" }),
    );
  });

  it("passes date range filters to repository", async () => {
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [], total: 0 });

    await GET(
      makeRequest("acme-corp", "from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z"),
      makeParams(),
    );

    expect(mockEvidenceRepo.listByTenant).toHaveBeenCalledWith(
      "acme-corp",
      expect.objectContaining({
        from: "2026-01-01T00:00:00Z",
        to: "2026-12-31T23:59:59Z",
      }),
    );
  });

  it("passes pagination params to repository", async () => {
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [], total: 0 });

    await GET(makeRequest("acme-corp", "limit=10&offset=5"), makeParams());

    expect(mockEvidenceRepo.listByTenant).toHaveBeenCalledWith(
      "acme-corp",
      expect.objectContaining({ limit: 10, offset: 5 }),
    );
  });

  it("uses default pagination (limit=20, offset=0)", async () => {
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [], total: 0 });

    await GET(makeRequest(), makeParams());

    expect(mockEvidenceRepo.listByTenant).toHaveBeenCalledWith(
      "acme-corp",
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it("maps results to EvidenceSummary format", async () => {
    const evidence = makeEvidence();
    mockEvidenceRepo.listByTenant.mockResolvedValue({ items: [evidence], total: 1 });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    const item = body.items[0];
    // Should have summary fields
    expect(item.id).toBe(evidence.id);
    expect(item.sessionId).toBe(evidence.sessionId);
    expect(item.employeeId).toBe(evidence.employeeId);
    expect(item.schemaVersion).toBe(evidence.schemaVersion);
    expect(item.contentHash).toBe(evidence.contentHash);
    expect(item.generatedAt).toBe(evidence.generatedAt);
    expect(item.outcome.status).toBe("passed");
    expect(item.outcome.aggregateScore).toBe(0.85);
    expect(item.outcome.passed).toBe(true);
    // Should NOT have full evidence body
    expect(item.evidence).toBeUndefined();
    expect(item.modules).toBeUndefined();
  });

  it("returns 401 when headers missing", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/evidence", {
      method: "GET",
      headers: {},
    });

    const response = await GET(request, makeParams());
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });
});
