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
 * Unit tests for POST /api/training/{tenant}/evidence/{sessionId}/generate.
 * All external dependencies are mocked.
 */

const { mockStorage, mockEvidenceRepo, mockGenerateEvidence } = vi.hoisted(() => {
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
  const mockGenerateEvidence = vi.fn();
  return { mockStorage, mockEvidenceRepo, mockGenerateEvidence };
});

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => mockStorage),
}));

vi.mock("@/evidence/evidence-repository", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));

vi.mock("@/evidence/evidence-generator", () => ({
  generateEvidenceForSession: mockGenerateEvidence,
}));

import type { TrainingEvidence } from "@/evidence/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../../app/api/training/[tenant]/evidence/[sessionId]/generate/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";

function makeRequest(
  tenantId = "acme-corp",
  sessionId = "session-uuid-001",
  role = "admin",
): Request {
  const url = `http://localhost:3000/api/training/${tenantId}/evidence/${sessionId}/generate`;
  const headers: Record<string, string> = {
    "x-tenant-id": tenantId,
    "x-employee-id": "emp-001",
  };
  if (role) {
    headers["x-employee-role"] = role;
  }
  return new Request(url, { method: "POST", headers });
}

function makeParams(tenant = "acme-corp", sessionId = "session-uuid-001") {
  return { params: Promise.resolve({ tenant, sessionId }) };
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

describe("POST /api/training/{tenant}/evidence/{sessionId}/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.findById.mockResolvedValue(null);
    mockEvidenceRepo.findBySessionId.mockResolvedValue(null);
    mockGenerateEvidence.mockResolvedValue(null);
  });

  it("returns 201 for newly generated evidence", async () => {
    const session = { id: "session-uuid-001", status: "passed", tenantId: "acme-corp" };
    mockStorage.findById.mockResolvedValue(session);
    mockEvidenceRepo.findBySessionId.mockResolvedValue(null);
    const evidence = makeEvidence();
    mockGenerateEvidence.mockResolvedValue(evidence);

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.id).toBe(evidence.id);
    expect(body.sessionId).toBe(evidence.sessionId);
  });

  it("returns 200 for idempotent return (existing evidence)", async () => {
    const session = { id: "session-uuid-001", status: "passed", tenantId: "acme-corp" };
    mockStorage.findById.mockResolvedValue(session);
    const existing = makeEvidence();
    mockEvidenceRepo.findBySessionId.mockResolvedValue(existing);

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(existing.id);
    // Should NOT have called generateEvidenceForSession
    expect(mockGenerateEvidence).not.toHaveBeenCalled();
  });

  it("returns 403 for employee role", async () => {
    const response = await POST(
      makeRequest("acme-corp", "session-uuid-001", "employee"),
      makeParams(),
    );
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 404 when session not found", async () => {
    mockStorage.findById.mockResolvedValue(null);

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 409 when session not in terminal state", async () => {
    const session = { id: "session-uuid-001", status: "in-progress", tenantId: "acme-corp" };
    mockStorage.findById.mockResolvedValue(session);

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error).toBe("conflict");
  });

  it("returns 401 when headers missing", async () => {
    const request = new Request(
      "http://localhost:3000/api/training/acme-corp/evidence/session-uuid-001/generate",
      { method: "POST", headers: {} },
    );

    const response = await POST(request, makeParams());
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });
});
