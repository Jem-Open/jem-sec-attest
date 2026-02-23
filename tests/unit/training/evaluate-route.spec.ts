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
 * Unit tests for POST /api/training/{tenant}/evaluate.
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
  logEvaluationCompleted: vi.fn().mockResolvedValue(undefined),
  logSessionExhausted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/training/score-calculator", () => ({
  computeAggregateScore: vi.fn(),
  identifyWeakAreas: vi.fn(),
  isPassing: vi.fn(),
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

vi.mock("@/audit/audit-logger", () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/config/index", () => ({
  getSnapshot: vi.fn().mockReturnValue({
    tenants: new Map([
      [
        "acme-corp",
        {
          id: "acme-corp",
          name: "Acme Corp",
          settings: {
            training: { passThreshold: 0.7, maxAttempts: 3 },
          },
        },
      ],
    ]),
    configHash: "test-hash-123",
  }),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { logEvaluationCompleted, logSessionExhausted } from "@/training/audit";
import { computeAggregateScore, identifyWeakAreas, isPassing } from "@/training/score-calculator";
import { VersionConflictError } from "@/training/session-repository";
import { transitionSession } from "@/training/state-machine";
import type { TrainingModule, TrainingSession } from "@/training/types";

import { POST } from "../../../app/api/training/[tenant]/evaluate/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";

function makeRequest(tenantId = "acme-corp", employeeId = "emp-001"): Request {
  return new Request("http://localhost:3000/api/training/acme-corp/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    status: "evaluating",
    attemptNumber: 1,
    curriculum: {
      modules: [
        { title: "Security Basics", topicArea: "Security Awareness", jobExpectationIndices: [0] },
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

describe("POST /api/training/{tenant}/evaluate", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish defaults on the shared mock repo after clearAllMocks
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
    mockSessionRepo.updateSession.mockResolvedValue({});

    // Default score-calculator behavior: passing
    vi.mocked(computeAggregateScore).mockReturnValue(0.85);
    vi.mocked(isPassing).mockReturnValue(true);
    vi.mocked(identifyWeakAreas).mockReturnValue([]);
    vi.mocked(transitionSession).mockReturnValue("passed");
  });

  // Test 1: Returns 401 if missing auth headers
  it("returns 401 if x-tenant-id header is missing", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/evaluate", {
      method: "POST",
      headers: { "x-employee-id": "emp-001" },
    });
    const response = await POST(request, makeParams());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 if x-employee-id header is missing", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/evaluate", {
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

  // Test 3: Returns 409 if session not in evaluating state
  it("returns 409 if session is not in evaluating state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession({ status: "in-progress" }));
    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("conflict");
  });

  // Test 4: Returns 200 with passed=true, nextAction="complete" when aggregate >= 0.70
  it("returns 200 with passed=true and nextAction=complete when aggregate >= passThreshold", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [makeModule({ moduleScore: 0.85 }), makeModule({ moduleScore: 0.9 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.875);
    vi.mocked(isPassing).mockReturnValue(true);
    vi.mocked(transitionSession).mockReturnValue("passed");

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.passed).toBe(true);
    expect(body.nextAction).toBe("complete");
    expect(body.sessionId).toBe(session.id);
    expect(body.aggregateScore).toBe(0.875);
    expect(body.attemptNumber).toBe(1);
  });

  // Test 5: Returns 200 with passed=false, nextAction="remediation-available" when failed with attempts remaining
  it("returns 200 with passed=false and nextAction=remediation-available when failed with attempts remaining", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [makeModule({ moduleScore: 0.5 }), makeModule({ moduleScore: 0.6 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.55);
    vi.mocked(isPassing).mockReturnValue(false);
    vi.mocked(identifyWeakAreas).mockReturnValue(["Security Awareness"]);
    vi.mocked(transitionSession).mockReturnValue("failed");

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.passed).toBe(false);
    expect(body.nextAction).toBe("remediation-available");
    expect(body.weakAreas).toEqual(["Security Awareness"]);
  });

  // Test 6: Returns 200 with passed=false, nextAction="exhausted" when failed with no attempts remaining
  it("returns 200 with passed=false and nextAction=exhausted when failed with no attempts remaining", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 3 });
    const modules = [makeModule({ moduleScore: 0.4 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.4);
    vi.mocked(isPassing).mockReturnValue(false);
    vi.mocked(transitionSession).mockReturnValue("exhausted");

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.passed).toBe(false);
    expect(body.nextAction).toBe("exhausted");
  });

  // Test 7: Sets completedAt on pass
  it("sets completedAt when session passes", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [makeModule({ moduleScore: 0.9 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.9);
    vi.mocked(isPassing).mockReturnValue(true);
    vi.mocked(transitionSession).mockReturnValue("passed");

    await POST(makeRequest(), makeParams());

    expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
      "acme-corp",
      session.id,
      expect.objectContaining({
        status: "passed",
        completedAt: expect.any(String),
      }),
      session.version,
    );
  });

  // Test 8: Sets completedAt on exhausted
  it("sets completedAt when session is exhausted", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 3 });
    const modules = [makeModule({ moduleScore: 0.3 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.3);
    vi.mocked(isPassing).mockReturnValue(false);
    vi.mocked(transitionSession).mockReturnValue("exhausted");

    await POST(makeRequest(), makeParams());

    expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
      "acme-corp",
      session.id,
      expect.objectContaining({
        status: "exhausted",
        completedAt: expect.any(String),
      }),
      session.version,
    );
  });

  // Test 9: Identifies weak areas on failure
  it("identifies weak areas when session fails", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [
      makeModule({ topicArea: "Phishing", moduleScore: 0.5 }),
      makeModule({ topicArea: "Access Control", moduleScore: 0.9 }),
    ];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.7);
    vi.mocked(isPassing).mockReturnValue(false);
    vi.mocked(identifyWeakAreas).mockReturnValue(["Phishing"]);
    vi.mocked(transitionSession).mockReturnValue("failed");

    await POST(makeRequest(), makeParams());

    expect(identifyWeakAreas).toHaveBeenCalledWith(
      [
        { topicArea: "Phishing", moduleScore: 0.5 },
        { topicArea: "Access Control", moduleScore: 0.9 },
      ],
      0.7,
    );
  });

  // Test 10: Logs evaluation-completed audit event
  it("logs evaluation-completed audit event", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [makeModule({ moduleScore: 0.85 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.85);
    vi.mocked(isPassing).mockReturnValue(true);
    vi.mocked(transitionSession).mockReturnValue("passed");

    await POST(makeRequest(), makeParams());

    expect(logEvaluationCompleted).toHaveBeenCalledWith(
      expect.any(Object),
      "acme-corp",
      "emp-001",
      session.id,
      session.attemptNumber,
      0.85,
      true,
    );
  });

  // Test 11: Logs session-exhausted audit event when exhausted
  it("logs session-exhausted audit event when session is exhausted", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 3 });
    const modules = [makeModule({ moduleScore: 0.3 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.3);
    vi.mocked(isPassing).mockReturnValue(false);
    vi.mocked(transitionSession).mockReturnValue("exhausted");

    await POST(makeRequest(), makeParams());

    expect(logSessionExhausted).toHaveBeenCalledWith(
      expect.any(Object),
      "acme-corp",
      "emp-001",
      session.id,
      0.3,
      session.attemptNumber,
    );
  });

  it("does NOT log session-exhausted when session passes", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [makeModule({ moduleScore: 0.9 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.9);
    vi.mocked(isPassing).mockReturnValue(true);
    vi.mocked(transitionSession).mockReturnValue("passed");

    await POST(makeRequest(), makeParams());

    expect(logSessionExhausted).not.toHaveBeenCalled();
  });

  // Test 12: Handles VersionConflictError → 409
  it("returns 409 when VersionConflictError is thrown during session update", async () => {
    const session = makeSession({ status: "evaluating", attemptNumber: 1 });
    const modules = [makeModule({ moduleScore: 0.85 })];
    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);
    vi.mocked(computeAggregateScore).mockReturnValue(0.85);
    vi.mocked(isPassing).mockReturnValue(true);
    vi.mocked(transitionSession).mockReturnValue("passed");
    mockSessionRepo.updateSession.mockRejectedValue(
      new VersionConflictError("TrainingSession", session.id),
    );

    const response = await POST(makeRequest(), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("conflict");
  });
});
