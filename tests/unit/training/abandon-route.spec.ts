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
 * Unit tests for POST /api/training/{tenant}/abandon.
 * All external dependencies are mocked.
 */

// vi.mock calls are hoisted — place them before imports for clarity.
// vi.hoisted is also hoisted and can be referenced inside vi.mock factories.

const mockSessionRepo = vi.hoisted(() => ({
  findActiveSession: vi.fn(),
  findModulesBySession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("@/storage/factory", () => ({
  getStorage: vi.fn().mockResolvedValue({
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation((_t: string, fn: () => Promise<unknown>) => fn()),
    getMetadata: vi.fn(),
  }),
}));

vi.mock("@/training/session-repository", () => ({
  SessionRepository: vi.fn().mockImplementation(() => mockSessionRepo),
  VersionConflictError: class VersionConflictError extends Error {
    constructor(entity: string, id: string) {
      super(`Version conflict: ${entity} '${id}' was modified by another request`);
      this.name = "VersionConflictError";
    }
  },
}));

vi.mock("@/training/audit", () => ({
  logSessionAbandoned: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/audit/audit-logger", () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/training/state-machine", () => ({
  transitionSession: vi.fn(),
  StateTransitionError: class StateTransitionError extends Error {
    constructor(
      public readonly currentState: string,
      public readonly event: string,
    ) {
      super(`Invalid transition: cannot apply event '${event}' in state '${currentState}'`);
      this.name = "StateTransitionError";
    }
  },
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { logSessionAbandoned } from "@/training/audit";
import { VersionConflictError } from "@/training/session-repository";
import { transitionSession } from "@/training/state-machine";
import type { TrainingModule, TrainingSession } from "@/training/types";

import { POST } from "../../../app/api/training/[tenant]/abandon/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";

function makeRequest(tenantId = "acme-corp", employeeId = "emp-001"): Request {
  return new Request("http://localhost:3000/api/training/acme-corp/abandon", {
    method: "POST",
    headers: {
      "x-tenant-id": tenantId,
      "x-employee-id": employeeId,
    },
  });
}

function makeParams(tenant = "acme-corp") {
  return { params: Promise.resolve({ tenant }) };
}

function makeSession(overrides?: Partial<TrainingSession>): TrainingSession {
  return {
    id: "session-uuid-001",
    tenantId: "acme-corp",
    employeeId: "emp-001",
    roleProfileId: "profile-uuid-001",
    roleProfileVersion: 1,
    configHash: "test-hash-123",
    appVersion: "0.1.0",
    status: "in-progress",
    attemptNumber: 1,
    curriculum: {
      modules: [
        { title: "Security Basics", topicArea: "Security Awareness", jobExpectationIndices: [0] },
        { title: "Phishing", topicArea: "Threat Awareness", jobExpectationIndices: [1] },
      ],
      generatedAt: ISO,
    },
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
    ...overrides,
  };
}

function makeModule(overrides?: Partial<TrainingModule>): TrainingModule {
  return {
    id: "module-uuid-001",
    tenantId: "acme-corp",
    sessionId: "session-uuid-001",
    moduleIndex: 0,
    title: "Security Basics",
    topicArea: "Security Awareness",
    jobExpectationIndices: [0],
    status: "scored",
    content: null,
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: 0.85,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/training/{tenant}/abandon", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish defaults on the shared mock repo after clearAllMocks
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
    mockSessionRepo.updateSession.mockResolvedValue({});

    // Default state-machine: returns "abandoned"
    vi.mocked(transitionSession).mockReturnValue("abandoned");
  });

  // Test 1: Returns 401 if missing auth headers
  it("returns 401 if x-tenant-id header is missing", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/abandon", {
      method: "POST",
      headers: { "x-employee-id": "emp-001" },
    });
    const response = await POST(request, makeParams());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 if x-employee-id header is missing", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/abandon", {
      method: "POST",
      headers: { "x-tenant-id": "acme-corp" },
    });
    const response = await POST(request, makeParams());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 if tenantId does not match tenant slug", async () => {
    const request = makeRequest("other-tenant", "emp-001");
    const response = await POST(request, makeParams("acme-corp"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  // Test 2: Returns 404 if no active session
  it("returns 404 if no active session found", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("not_found");
  });

  // Test 3: Returns 409 if session not in in-progress or in-remediation
  it("returns 409 if session is in evaluating state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession({ status: "evaluating" }));
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("conflict");
  });

  it("returns 409 if session is in curriculum-generating state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(
      makeSession({ status: "curriculum-generating" }),
    );
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("conflict");
  });

  // Test 4: Returns 200 on successful abandonment (in-progress)
  it("returns 200 on successful abandonment when session is in-progress", async () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [makeModule({ status: "scored" }), makeModule({ status: "locked" })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    mockSessionRepo.updateSession.mockResolvedValue({ ...session, status: "abandoned" });

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toBeDefined();
  });

  it("returns 200 on successful abandonment when session is in-remediation", async () => {
    const session = makeSession({ status: "in-remediation", attemptNumber: 2 });
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
    mockSessionRepo.updateSession.mockResolvedValue({ ...session, status: "abandoned" });

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toBeDefined();
  });

  // Test 5: Sets completedAt on the session
  it("sets completedAt when abandoning the session", async () => {
    const session = makeSession({ status: "in-progress" });
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
    mockSessionRepo.updateSession.mockResolvedValue({ ...session, status: "abandoned" });

    await POST(makeRequest(), makeParams());

    expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
      "acme-corp",
      session.id,
      expect.objectContaining({
        status: "abandoned",
        completedAt: expect.any(String),
      }),
      session.version,
    );
  });

  // Test 6: Logs session-abandoned audit event
  it("logs session-abandoned audit event", async () => {
    const session = makeSession({ status: "in-progress", attemptNumber: 1 });
    const modules = [
      makeModule({ status: "scored" }),
      makeModule({ moduleIndex: 1, status: "locked", moduleScore: null }),
    ];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    mockSessionRepo.updateSession.mockResolvedValue({ ...session, status: "abandoned" });

    await POST(makeRequest(), makeParams());

    expect(logSessionAbandoned).toHaveBeenCalledWith(
      expect.any(Object),
      "acme-corp",
      "emp-001",
      session.id,
      1,
      1, // 1 module with status "scored"
      2, // 2 total modules
    );
  });

  // Test 7: Handles VersionConflictError → 409
  it("returns 409 when VersionConflictError is thrown during session update", async () => {
    const session = makeSession({ status: "in-progress" });
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
    mockSessionRepo.updateSession.mockRejectedValue(
      new VersionConflictError("TrainingSession", session.id),
    );

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("conflict");
  });
});
