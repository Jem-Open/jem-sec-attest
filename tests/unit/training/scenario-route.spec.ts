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
 * Unit tests for POST /api/training/{tenant}/module/{moduleIndex}/scenario
 * T016: Scenario submission route handler.
 */

// vi.mock calls are hoisted — place them before imports for clarity.

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation((_t: string, fn: () => Promise<unknown>) => fn()),
    getMetadata: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("@/config/index", () => ({
  getSnapshot: vi.fn(),
}));

vi.mock("@/intake/ai-model-resolver", () => ({
  resolveModel: vi.fn().mockReturnValue({}),
}));

vi.mock("@/training/session-repository", () => ({
  SessionRepository: vi.fn(),
  VersionConflictError: class VersionConflictError extends Error {
    constructor(entity: string, id: string) {
      super(`Version conflict: ${entity} '${id}' was modified by another request`);
      this.name = "VersionConflictError";
    }
  },
}));

vi.mock("@/training/evaluator", () => ({
  evaluateFreeText: vi.fn(),
  EvaluationError: class EvaluationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "EvaluationError";
      this.code = code;
    }
  },
}));

vi.mock("@/training/score-calculator", () => ({
  scoreMcAnswer: vi.fn(),
  computeModuleScore: vi.fn(),
}));

vi.mock("@/audit/audit-logger", () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getSnapshot } from "@/config/index";
import { evaluateFreeText } from "@/training/evaluator";
import { scoreMcAnswer } from "@/training/score-calculator";
import { SessionRepository } from "@/training/session-repository";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../../app/api/training/[tenant]/module/[moduleIndex]/scenario/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";
const TENANT = "acme-corp";
const EMPLOYEE_ID = "emp-001";
const SESSION_ID = "sess-001";
const MODULE_ID = "mod-001";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    tenantId: TENANT,
    employeeId: EMPLOYEE_ID,
    roleProfileId: "rp-1",
    roleProfileVersion: 1,
    configHash: "abc123",
    appVersion: "1.0.0",
    status: "in-progress",
    attemptNumber: 1,
    curriculum: {
      modules: [{ title: "Security Basics", topicArea: "Security", jobExpectationIndices: [0] }],
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

function makeModule(overrides: Record<string, unknown> = {}) {
  return {
    id: MODULE_ID,
    tenantId: TENANT,
    sessionId: SESSION_ID,
    moduleIndex: 0,
    title: "Security Basics",
    topicArea: "Security",
    jobExpectationIndices: [0],
    status: "learning",
    content: {
      instruction: "Read the following material carefully.",
      scenarios: [
        {
          id: "scenario-1",
          narrative: "You receive a suspicious email. What do you do?",
          responseType: "multiple-choice",
          options: [
            { key: "A", text: "Click the link", correct: false },
            { key: "B", text: "Report to IT", correct: true },
            { key: "C", text: "Ignore it", correct: false },
          ],
        },
        {
          id: "scenario-2",
          narrative: "Describe how you would handle a data breach.",
          responseType: "free-text",
          rubric: "Full marks for mentioning incident response and notification procedures.",
        },
      ],
      quiz: {
        questions: [
          {
            id: "q-1",
            text: "What is phishing?",
            responseType: "multiple-choice",
            options: [
              { key: "A", text: "A type of fish", correct: false },
              { key: "B", text: "A social engineering attack", correct: true },
            ],
          },
        ],
      },
      generatedAt: ISO,
    },
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

function makeRequest(
  body: Record<string, unknown>,
  tenantId = TENANT,
  employeeId = EMPLOYEE_ID,
): Request {
  return new Request(`http://localhost:3000/api/training/${TENANT}/module/0/scenario`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      "x-employee-id": employeeId,
    },
    body: JSON.stringify(body),
  });
}

function makeParams(tenant = TENANT, moduleIndex = "0") {
  return { params: Promise.resolve({ tenant, moduleIndex }) };
}

// ---------------------------------------------------------------------------
// Setup mocks
// ---------------------------------------------------------------------------

let mockSessionRepo: {
  findActiveSession: ReturnType<typeof vi.fn>;
  findModule: ReturnType<typeof vi.fn>;
  updateModule: ReturnType<typeof vi.fn>;
  findModulesBySession: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();

  mockSessionRepo = {
    findActiveSession: vi.fn(),
    findModule: vi.fn(),
    updateModule: vi.fn().mockResolvedValue({}),
    findModulesBySession: vi.fn(),
  };

  vi.mocked(SessionRepository).mockImplementation(() => mockSessionRepo as never);

  vi.mocked(getSnapshot).mockReturnValue({
    tenants: new Map([
      ["acme-corp", { id: "acme-corp", name: "Acme Corp", settings: { ai: {} } } as never],
    ]),
    hostnameIndex: new Map(),
    emailDomainIndex: new Map(),
    configHash: "test-hash",
    loadedAt: new Date(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/training/{tenant}/module/{moduleIndex}/scenario", () => {
  // ---------------------------------------------------------------------------
  // 1. Returns 401 if missing auth headers
  // ---------------------------------------------------------------------------
  it("returns 401 if missing x-tenant-id header", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/module/0/scenario", {
      method: "POST",
      headers: { "x-employee-id": EMPLOYEE_ID, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  it("returns 401 if missing x-employee-id header", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/module/0/scenario", {
      method: "POST",
      headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
  });

  it("returns 401 if tenant header does not match route param", async () => {
    const request = makeRequest({}, "wrong-tenant", EMPLOYEE_ID);
    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 2. Returns 400 for invalid body (missing scenarioId)
  // ---------------------------------------------------------------------------
  it("returns 400 for invalid body missing scenarioId", async () => {
    const request = makeRequest({ responseType: "multiple-choice", selectedOption: "B" });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for malformed JSON body", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/module/0/scenario", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": TENANT,
        "x-employee-id": EMPLOYEE_ID,
      },
      body: "not-json",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // 3. Returns 404 if no active session
  // ---------------------------------------------------------------------------
  it("returns 404 if no active session", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error", "not_found");
  });

  // ---------------------------------------------------------------------------
  // 4. Returns 404 if scenario not found in module content
  // ---------------------------------------------------------------------------
  it("returns 404 if scenario not found in module content", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());

    const request = makeRequest({
      scenarioId: "nonexistent-scenario",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error", "not_found");
  });

  // ---------------------------------------------------------------------------
  // 5. Returns 409 if scenario already answered
  // ---------------------------------------------------------------------------
  it("returns 409 if scenario already answered", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(
      makeModule({
        status: "scenario-active",
        scenarioResponses: [
          {
            scenarioId: "scenario-1",
            responseType: "multiple-choice",
            selectedOption: "B",
            score: 1.0,
            submittedAt: ISO,
          },
        ],
      }),
    );

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
  });

  // ---------------------------------------------------------------------------
  // 6. Returns 409 if module not in correct state
  // ---------------------------------------------------------------------------
  it("returns 409 if module is in quiz-active state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule({ status: "quiz-active" }));

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
  });

  it("returns 409 if module is in scored state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule({ status: "scored" }));

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
  });

  // ---------------------------------------------------------------------------
  // 7. Returns 200 with score for MC answer (correct → 1.0)
  // ---------------------------------------------------------------------------
  it("returns 200 with score 1.0 for correct MC answer", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("scenarioId", "scenario-1");
    expect(body).toHaveProperty("score", 1.0);
    expect(scoreMcAnswer).toHaveBeenCalledWith("B", "B");
  });

  // ---------------------------------------------------------------------------
  // 8. Returns 200 with score for MC answer (incorrect → 0.0)
  // ---------------------------------------------------------------------------
  it("returns 200 with score 0.0 for incorrect MC answer", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    vi.mocked(scoreMcAnswer).mockReturnValue(0.0);

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "A",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("score", 0.0);
    expect(scoreMcAnswer).toHaveBeenCalledWith("A", "B");
  });

  // ---------------------------------------------------------------------------
  // 9. Returns 200 with score and rationale for free-text answer
  // ---------------------------------------------------------------------------
  it("returns 200 with score and rationale for free-text answer", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    vi.mocked(evaluateFreeText).mockResolvedValue({
      score: 0.8,
      rationale: "Good answer covering key points.",
    });

    const request = makeRequest({
      scenarioId: "scenario-2",
      responseType: "free-text",
      freeTextResponse:
        "I would immediately notify the IT team and follow the incident response plan.",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("scenarioId", "scenario-2");
    expect(body).toHaveProperty("score", 0.8);
    expect(body).toHaveProperty("rationale", "Good answer covering key points.");
  });

  // ---------------------------------------------------------------------------
  // 10. Transitions module to scenario-active on first scenario
  // ---------------------------------------------------------------------------
  it("transitions module to scenario-active when module is in learning state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule({ status: "learning" }));
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    expect(mockSessionRepo.updateModule).toHaveBeenCalledWith(
      TENANT,
      MODULE_ID,
      expect.objectContaining({ status: "scenario-active" }),
      1,
    );
  });

  // ---------------------------------------------------------------------------
  // T028: Returns 409 on VersionConflictError from updateModule
  // ---------------------------------------------------------------------------
  it("returns 409 when updateModule throws VersionConflictError", async () => {
    const { VersionConflictError: VCE } = await import("@/training/session-repository");
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    mockSessionRepo.updateModule.mockRejectedValue(new VCE("module", MODULE_ID));
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);

    const request = makeRequest({
      scenarioId: "scenario-1",
      responseType: "multiple-choice",
      selectedOption: "B",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
  });

  // ---------------------------------------------------------------------------
  // 11. Transitions module to quiz-active when all scenarios answered
  // ---------------------------------------------------------------------------
  it("transitions module to quiz-active when all scenarios have been answered", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    // Module already has one scenario answered (scenario-1), submitting scenario-2 completes all
    mockSessionRepo.findModule.mockResolvedValue(
      makeModule({
        status: "scenario-active",
        scenarioResponses: [
          {
            scenarioId: "scenario-1",
            responseType: "multiple-choice",
            selectedOption: "B",
            score: 1.0,
            submittedAt: ISO,
          },
        ],
      }),
    );
    vi.mocked(evaluateFreeText).mockResolvedValue({
      score: 0.9,
      rationale: "Excellent response.",
    });

    const request = makeRequest({
      scenarioId: "scenario-2",
      responseType: "free-text",
      freeTextResponse: "I would notify IT security immediately.",
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    expect(mockSessionRepo.updateModule).toHaveBeenCalledWith(
      TENANT,
      MODULE_ID,
      expect.objectContaining({ status: "quiz-active" }),
      expect.any(Number),
    );
  });
});
