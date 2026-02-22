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
 * Unit tests for POST /api/training/{tenant}/module/{moduleIndex}/quiz
 * T017: Quiz submission route handler.
 */

// vi.mock calls are hoisted — place them before imports for clarity.

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: "audit-1" }),
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

vi.mock("@/training/audit", () => ({
  logModuleCompleted: vi.fn().mockResolvedValue(undefined),
  logQuizSubmitted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/audit/audit-logger", () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getSnapshot } from "@/config/index";
import { logModuleCompleted, logQuizSubmitted } from "@/training/audit";
import { evaluateFreeText } from "@/training/evaluator";
import { computeModuleScore, scoreMcAnswer } from "@/training/score-calculator";
import { SessionRepository } from "@/training/session-repository";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../../app/api/training/[tenant]/module/[moduleIndex]/quiz/route";

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
    status: "quiz-active",
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
          ],
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
          {
            id: "q-2",
            text: "Describe how to respond to a security incident.",
            responseType: "free-text",
            rubric: "Full marks for mentioning incident response and notification.",
          },
        ],
      },
      generatedAt: ISO,
    },
    scenarioResponses: [
      {
        scenarioId: "scenario-1",
        responseType: "multiple-choice",
        selectedOption: "B",
        score: 1.0,
        submittedAt: ISO,
      },
    ],
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
  return new Request(`http://localhost:3000/api/training/${TENANT}/module/0/quiz`, {
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

function makeValidBody() {
  return {
    answers: [
      { questionId: "q-1", responseType: "multiple-choice", selectedOption: "B" },
      {
        questionId: "q-2",
        responseType: "free-text",
        freeTextResponse: "Immediately notify the security team and follow the IR plan.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Setup mocks
// ---------------------------------------------------------------------------

let mockSessionRepo: {
  findActiveSession: ReturnType<typeof vi.fn>;
  findModule: ReturnType<typeof vi.fn>;
  updateModule: ReturnType<typeof vi.fn>;
  updateSession: ReturnType<typeof vi.fn>;
  findModulesBySession: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();

  mockSessionRepo = {
    findActiveSession: vi.fn(),
    findModule: vi.fn(),
    updateModule: vi.fn().mockResolvedValue({}),
    updateSession: vi.fn().mockResolvedValue({}),
    findModulesBySession: vi.fn().mockResolvedValue([]),
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

describe("POST /api/training/{tenant}/module/{moduleIndex}/quiz", () => {
  // ---------------------------------------------------------------------------
  // 1. Returns 401 if missing auth headers
  // ---------------------------------------------------------------------------
  it("returns 401 if missing x-tenant-id header", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/module/0/quiz", {
      method: "POST",
      headers: { "x-employee-id": EMPLOYEE_ID, "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  it("returns 401 if missing x-employee-id header", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/module/0/quiz", {
      method: "POST",
      headers: { "x-tenant-id": TENANT, "Content-Type": "application/json" },
      body: JSON.stringify(makeValidBody()),
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
  });

  it("returns 401 if tenant header does not match route param", async () => {
    const request = makeRequest(makeValidBody(), "wrong-tenant", EMPLOYEE_ID);
    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 2. Returns 400 for invalid body
  // ---------------------------------------------------------------------------
  it("returns 400 for missing answers array", async () => {
    const request = makeRequest({});
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for malformed JSON body", async () => {
    const request = new Request("http://localhost:3000/api/training/acme-corp/module/0/quiz", {
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

  it("returns 400 for empty answers array", async () => {
    const request = makeRequest({ answers: [] });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // 3. Returns 404 if no active session
  // ---------------------------------------------------------------------------
  it("returns 404 if no active session", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);

    const request = makeRequest(makeValidBody());
    const response = await POST(request, makeParams());

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error", "not_found");
  });

  // ---------------------------------------------------------------------------
  // 4. Returns 409 if module not in quiz-active state
  // ---------------------------------------------------------------------------
  it("returns 409 if module is in learning state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule({ status: "learning" }));

    const request = makeRequest(makeValidBody());
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
  });

  it("returns 409 if module is in scenario-active state", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule({ status: "scenario-active" }));

    const request = makeRequest(makeValidBody());
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
  });

  // ---------------------------------------------------------------------------
  // 5. Returns 400 if not all questions answered
  // ---------------------------------------------------------------------------
  it("returns 400 if answers count does not match question count", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());

    // Only one answer provided but module has two questions
    const request = makeRequest({
      answers: [{ questionId: "q-1", responseType: "multiple-choice", selectedOption: "B" }],
    });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  // ---------------------------------------------------------------------------
  // 6. Returns 200 with module score and individual answer scores
  // ---------------------------------------------------------------------------
  it("returns 200 with moduleScore and answer scores on valid submission", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    mockSessionRepo.findModulesBySession.mockResolvedValue([makeModule({ id: MODULE_ID })]);
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);
    vi.mocked(evaluateFreeText).mockResolvedValue({ score: 0.8, rationale: "Good answer." });
    vi.mocked(computeModuleScore).mockReturnValue(0.9);

    const request = makeRequest(makeValidBody());
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("moduleIndex", 0);
    expect(body).toHaveProperty("moduleScore", 0.9);
    expect(body).toHaveProperty("answers");
    expect(Array.isArray(body.answers)).toBe(true);
    expect(body.answers).toHaveLength(2);
    expect(body.answers[0]).toHaveProperty("questionId", "q-1");
    expect(body.answers[0]).toHaveProperty("score");
    expect(body.answers[1]).toHaveProperty("questionId", "q-2");
    expect(body.answers[1]).toHaveProperty("score");
    expect(body.answers[1]).toHaveProperty("rationale");
  });

  // ---------------------------------------------------------------------------
  // 7. Logs audit events (module-completed, quiz-submitted)
  // ---------------------------------------------------------------------------
  it("logs logModuleCompleted audit event", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    mockSessionRepo.findModulesBySession.mockResolvedValue([makeModule({ id: MODULE_ID })]);
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);
    vi.mocked(evaluateFreeText).mockResolvedValue({ score: 0.8, rationale: "Good." });
    vi.mocked(computeModuleScore).mockReturnValue(0.9);

    const request = makeRequest(makeValidBody());
    await POST(request, makeParams());

    expect(logModuleCompleted).toHaveBeenCalledWith(
      expect.anything(), // storage
      TENANT,
      EMPLOYEE_ID,
      SESSION_ID,
      0, // moduleIndex
      "Security Basics", // module title
      0.9, // moduleScore
    );
  });

  it("logs logQuizSubmitted audit event", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    mockSessionRepo.findModulesBySession.mockResolvedValue([makeModule({ id: MODULE_ID })]);
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);
    vi.mocked(evaluateFreeText).mockResolvedValue({ score: 0.8, rationale: "Good." });
    vi.mocked(computeModuleScore).mockReturnValue(0.9);

    const request = makeRequest(makeValidBody());
    await POST(request, makeParams());

    expect(logQuizSubmitted).toHaveBeenCalledWith(
      expect.anything(), // storage
      TENANT,
      EMPLOYEE_ID,
      SESSION_ID,
      0, // moduleIndex
      2, // questionCount
      1, // mcCount
      1, // freeTextCount
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Transitions session to evaluating when last module scored
  // ---------------------------------------------------------------------------
  it("transitions session to evaluating when all modules are scored", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    // Only one module, already updated to scored in DB → all scored
    mockSessionRepo.findModulesBySession.mockResolvedValue([
      makeModule({ id: MODULE_ID, status: "scored" }),
    ]);
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);
    vi.mocked(evaluateFreeText).mockResolvedValue({ score: 0.8, rationale: "Good." });
    vi.mocked(computeModuleScore).mockReturnValue(0.9);

    const request = makeRequest(makeValidBody());
    await POST(request, makeParams());

    expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
      TENANT,
      SESSION_ID,
      expect.objectContaining({ status: "evaluating" }),
      1,
    );
  });

  it("does NOT transition session when other modules are not yet scored", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    // Two modules: current one (being scored) and another still in learning
    mockSessionRepo.findModulesBySession.mockResolvedValue([
      makeModule({ id: MODULE_ID, status: "quiz-active" }), // current (just scored)
      makeModule({ id: "mod-002", moduleIndex: 1, status: "learning" }), // not scored
    ]);
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);
    vi.mocked(evaluateFreeText).mockResolvedValue({ score: 0.8, rationale: "Good." });
    vi.mocked(computeModuleScore).mockReturnValue(0.9);

    const request = makeRequest(makeValidBody());
    await POST(request, makeParams());

    expect(mockSessionRepo.updateSession).not.toHaveBeenCalled();
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
    vi.mocked(evaluateFreeText).mockResolvedValue({ score: 0.8, rationale: "Good." });
    vi.mocked(computeModuleScore).mockReturnValue(0.9);

    const request = makeRequest(makeValidBody());
    const response = await POST(request, makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
  });

  // ---------------------------------------------------------------------------
  // 9. Returns 503 on AI failure for free-text evaluation
  // ---------------------------------------------------------------------------
  it("returns 503 when AI evaluation fails for free-text answer", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
    mockSessionRepo.findModule.mockResolvedValue(makeModule());
    vi.mocked(scoreMcAnswer).mockReturnValue(1.0);

    // biome-ignore lint/suspicious/noExplicitAny: constructing mocked error class
    const EvalErrorCtor = (await import("@/training/evaluator")).EvaluationError as any;
    vi.mocked(evaluateFreeText).mockRejectedValue(
      new EvalErrorCtor("AI service down", "ai_unavailable"),
    );

    const request = makeRequest(makeValidBody());
    const response = await POST(request, makeParams());

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toHaveProperty("error", "ai_unavailable");
  });
});
