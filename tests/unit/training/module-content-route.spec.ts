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
 * Unit tests for POST /api/training/{tenant}/module/{moduleIndex}/content
 * Tests the module content generation route handler in isolation with mocked
 * external dependencies.
 */

// vi.mock calls are hoisted — place them before imports for clarity.

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
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

vi.mock("@/intake/profile-repository", () => ({
  ProfileRepository: vi.fn(),
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

vi.mock("@/training/module-generator", () => ({
  generateModuleContent: vi.fn(),
  ModuleGenerationError: class ModuleGenerationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "ModuleGenerationError";
      this.code = code;
    }
  },
}));

vi.mock("next/server", () => {
  return {
    NextResponse: {
      json: vi.fn((body: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200,
        json: async () => body,
      })),
    },
  };
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSnapshot } from "@/config/index";
import { ProfileRepository } from "@/intake/profile-repository";
import { ModuleGenerationError, generateModuleContent } from "@/training/module-generator";
import { SessionRepository, VersionConflictError } from "@/training/session-repository";
// StateTransitionError is intentionally not mocked: it is a plain error class whose
// constructor and instanceof behaviour must be identical between the route under test
// and this test file. Importing the real implementation keeps both sides in sync.
import { StateTransitionError } from "@/training/state-machine";

import { POST } from "../../../app/api/training/[tenant]/module/[moduleIndex]/content/route";

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

const TENANT_ID = "acme-corp";
const EMPLOYEE_ID = "emp-001";
const SESSION_ID = "session-uuid-001";
const MODULE_ID = "module-uuid-001";

function makeRequest(
  moduleIndex: string | number = 0,
  tenantId: string | null = TENANT_ID,
  employeeId: string | null = EMPLOYEE_ID,
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (tenantId) headers["x-tenant-id"] = tenantId;
  if (employeeId) headers["x-employee-id"] = employeeId;

  return new Request(
    `http://localhost:3000/api/training/${TENANT_ID}/module/${moduleIndex}/content`,
    { method: "POST", headers },
  );
}

function makeParams(tenantSlug = TENANT_ID, moduleIndex = "0") {
  return { params: Promise.resolve({ tenant: tenantSlug, moduleIndex }) };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    roleProfileId: "profile-001",
    roleProfileVersion: 1,
    configHash: "hash-abc",
    appVersion: "1.0.0",
    status: "in-progress",
    attemptNumber: 1,
    curriculum: {
      modules: [{ title: "Phishing Awareness", topicArea: "Phishing", jobExpectationIndices: [0] }],
      generatedAt: "2026-02-20T00:00:00.000Z",
    },
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function makeModule(overrides: Record<string, unknown> = {}) {
  return {
    id: MODULE_ID,
    tenantId: TENANT_ID,
    sessionId: SESSION_ID,
    moduleIndex: 0,
    title: "Phishing Awareness",
    topicArea: "Phishing",
    jobExpectationIndices: [0],
    status: "locked",
    content: null,
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: null,
    version: 1,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeRoleProfile() {
  return {
    id: "profile-001",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    jobExpectations: ["Identify phishing emails", "Report suspicious activity"],
    status: "confirmed",
    confirmedAt: "2026-02-20T00:00:00.000Z",
    version: 1,
    configHash: "hash-abc",
    appVersion: "1.0.0",
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
  };
}

function makeGeneratedContent() {
  return {
    instruction: "Learn to identify phishing attempts.",
    scenarios: [
      {
        id: "sc-1",
        narrative: "You receive a suspicious email. What do you do?",
        responseType: "multiple-choice" as const,
        options: [
          { key: "A", text: "Click the link", correct: false },
          { key: "B", text: "Report to IT", correct: true },
          { key: "C", text: "Ignore it", correct: false },
        ],
      },
      {
        id: "sc-2",
        narrative: "Describe how you verify a suspicious email.",
        responseType: "free-text" as const,
        rubric: "Award marks for mentioning sender verification and IT reporting.",
      },
    ],
    quiz: {
      questions: [
        {
          id: "q-1",
          text: "Which is a sign of phishing?",
          responseType: "multiple-choice" as const,
          options: [
            { key: "A", text: "Urgent request", correct: true },
            { key: "B", text: "Company logo", correct: false },
          ],
        },
        {
          id: "q-2",
          text: "What steps do you take after spotting a phishing email?",
          responseType: "free-text" as const,
          rubric: "Mention reporting, not clicking, and alerting team.",
        },
      ],
    },
    generatedAt: "2026-02-20T10:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Setup mocks
// ---------------------------------------------------------------------------

let mockSessionRepo: {
  findActiveSession: ReturnType<typeof vi.fn>;
  findModule: ReturnType<typeof vi.fn>;
  updateModule: ReturnType<typeof vi.fn>;
};

let mockProfileRepo: {
  findByEmployee: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();

  mockSessionRepo = {
    findActiveSession: vi.fn(),
    findModule: vi.fn(),
    updateModule: vi.fn().mockResolvedValue({}),
  };

  mockProfileRepo = {
    findByEmployee: vi.fn(),
  };

  vi.mocked(SessionRepository).mockImplementation(() => mockSessionRepo as never);
  vi.mocked(ProfileRepository).mockImplementation(() => mockProfileRepo as never);

  vi.mocked(getSnapshot).mockReturnValue({
    tenants: new Map([
      ["acme-corp", { id: "acme-corp", name: "Acme Corp", settings: {} } as never],
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

describe("POST /api/training/{tenant}/module/{moduleIndex}/content", () => {
  describe("Authentication", () => {
    it("returns 401 when x-tenant-id header is missing", async () => {
      const request = makeRequest(0, null, EMPLOYEE_ID);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("unauthorized");
    });

    it("returns 401 when x-employee-id header is missing", async () => {
      const request = makeRequest(0, TENANT_ID, null);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("unauthorized");
    });

    it("returns 401 when x-tenant-id does not match route tenant slug", async () => {
      const request = makeRequest(0, "other-tenant", EMPLOYEE_ID);
      const response = await POST(request, makeParams("acme-corp"));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("unauthorized");
    });
  });

  describe("Module index validation", () => {
    it("returns 400 for non-numeric module index", async () => {
      const request = makeRequest("abc");
      const response = await POST(request, makeParams(TENANT_ID, "abc"));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 400 for negative module index", async () => {
      const request = makeRequest(-1);
      const response = await POST(request, makeParams(TENANT_ID, "-1"));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("invalid_request");
    });

    it("returns 400 for module index greater than 7", async () => {
      const request = makeRequest(8);
      const response = await POST(request, makeParams(TENANT_ID, "8"));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("invalid_request");
    });

    it("accepts module index 0 (lower boundary)", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(null);

      const request = makeRequest(0);
      const response = await POST(request, makeParams(TENANT_ID, "0"));

      // Will 404 because no session, but not 400 — index is valid
      expect(response.status).toBe(404);
    });

    it("accepts module index 7 (upper boundary)", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(null);

      const request = makeRequest(7);
      const response = await POST(request, makeParams(TENANT_ID, "7"));

      expect(response.status).toBe(404);
    });
  });

  describe("Session and module lookup", () => {
    it("returns 404 when no active session exists", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(null);

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("not_found");
    });

    it("returns 404 when module not found in session", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockResolvedValue(null);

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("not_found");
    });
  });

  describe("Idempotency", () => {
    it("returns 200 with existing content when module already has content", async () => {
      const existingContent = makeGeneratedContent();
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockResolvedValue(
        makeModule({ content: existingContent, status: "learning" }),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.instruction).toBe(existingContent.instruction);
      // AI should NOT be called for idempotent response
      expect(generateModuleContent).not.toHaveBeenCalled();
    });

    it("strips correct and rubric fields from existing content in idempotent response", async () => {
      const existingContent = makeGeneratedContent();
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockResolvedValue(
        makeModule({ content: existingContent, status: "learning" }),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      const body = await response.json();
      // Check scenarios: no rubric, no correct on options
      for (const scenario of body.scenarios) {
        expect(scenario).not.toHaveProperty("rubric");
        if (scenario.options) {
          for (const opt of scenario.options) {
            expect(opt).not.toHaveProperty("correct");
          }
        }
      }
      // Check quiz questions: no rubric, no correct on options
      for (const question of body.quiz.questions) {
        expect(question).not.toHaveProperty("rubric");
        if (question.options) {
          for (const opt of question.options) {
            expect(opt).not.toHaveProperty("correct");
          }
        }
      }
    });
  });

  describe("State guards", () => {
    it("returns 409 when module is not in locked state (e.g., already learning)", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockResolvedValue(
        makeModule({ status: "learning", content: null }),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });

    it("returns 409 when module is in content-generating state", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockResolvedValue(
        makeModule({ status: "content-generating", content: null }),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });

    it("returns 409 when module is in scored state", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockResolvedValue(makeModule({ status: "scored", content: null }));

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });

    it("returns 409 when previous module is not scored (moduleIndex > 0)", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      // Module 1 is locked (current), module 0 is in learning (not scored)
      mockSessionRepo.findModule.mockImplementation(
        (_tenantId: string, _sessionId: string, idx: number) => {
          if (idx === 1) return Promise.resolve(makeModule({ moduleIndex: 1, status: "locked" }));
          if (idx === 0) return Promise.resolve(makeModule({ moduleIndex: 0, status: "learning" }));
          return Promise.resolve(null);
        },
      );

      const request = makeRequest(1);
      const response = await POST(request, makeParams(TENANT_ID, "1"));

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });

    it("returns 409 when previous module does not exist (moduleIndex > 0)", async () => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockImplementation(
        (_tenantId: string, _sessionId: string, idx: number) => {
          if (idx === 1) return Promise.resolve(makeModule({ moduleIndex: 1, status: "locked" }));
          return Promise.resolve(null); // previous module missing
        },
      );

      const request = makeRequest(1);
      const response = await POST(request, makeParams(TENANT_ID, "1"));

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });
  });

  describe("Successful content generation", () => {
    beforeEach(() => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockImplementation(
        (_tenantId: string, _sessionId: string, _idx: number) =>
          Promise.resolve(makeModule({ version: 2 })),
      );
      mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
      vi.mocked(generateModuleContent).mockResolvedValue(makeGeneratedContent() as never);
    });

    it("returns 200 with generated content on success", async () => {
      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("instruction");
      expect(body).toHaveProperty("scenarios");
      expect(body).toHaveProperty("quiz");
      expect(body).toHaveProperty("generatedAt");
    });

    it("strips correct and rubric fields from newly generated content", async () => {
      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      const body = await response.json();
      for (const scenario of body.scenarios) {
        expect(scenario).not.toHaveProperty("rubric");
        if (scenario.options) {
          for (const opt of scenario.options) {
            expect(opt).not.toHaveProperty("correct");
          }
        }
      }
      for (const question of body.quiz.questions) {
        expect(question).not.toHaveProperty("rubric");
        if (question.options) {
          for (const opt of question.options) {
            expect(opt).not.toHaveProperty("correct");
          }
        }
      }
    });

    it("calls generateModuleContent with correct outline and role profile", async () => {
      const request = makeRequest(0);
      await POST(request, makeParams());

      expect(generateModuleContent).toHaveBeenCalledOnce();
      expect(generateModuleContent).toHaveBeenCalledWith(
        {
          title: "Phishing Awareness",
          topicArea: "Phishing",
          jobExpectationIndices: [0],
        },
        expect.objectContaining({ jobExpectations: expect.any(Array) }),
        expect.anything(), // model
      );
    });

    it("calls updateModule twice: once to set content-generating, once to set learning", async () => {
      // Use a module with version 1 so we can track the version progression
      mockSessionRepo.findModule.mockImplementation(
        (_tenantId: string, _sessionId: string, _idx: number) =>
          Promise.resolve(makeModule({ version: 1 })),
      );

      const request = makeRequest(0);
      await POST(request, makeParams());

      expect(mockSessionRepo.updateModule).toHaveBeenCalledTimes(2);
      // First call: transition to content-generating, using module's initial version (1)
      expect(mockSessionRepo.updateModule).toHaveBeenNthCalledWith(
        1,
        TENANT_ID,
        MODULE_ID,
        { status: "content-generating" },
        1, // initial version
      );
      // Second call: set content + transition to learning.
      // updatedModule is returned by the second findModule call, which also returns version 1 here.
      expect(mockSessionRepo.updateModule).toHaveBeenNthCalledWith(
        2,
        TENANT_ID,
        MODULE_ID,
        expect.objectContaining({ status: "learning", content: expect.any(Object) }),
        1, // version returned by re-fetched module (mock always returns version 1)
      );
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());
      mockSessionRepo.findModule.mockImplementation(
        (_tenantId: string, _sessionId: string, _idx: number) =>
          Promise.resolve(makeModule({ version: 2 })),
      );
      mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    });

    it("returns 503 when AI is unavailable", async () => {
      vi.mocked(generateModuleContent).mockRejectedValue(
        new ModuleGenerationError("AI service down", "ai_unavailable"),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("ai_unavailable");
    });

    it("returns 422 on generation failure", async () => {
      vi.mocked(generateModuleContent).mockRejectedValue(
        new ModuleGenerationError("AI returned no scenarios", "generation_failed"),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error).toBe("generation_failed");
    });

    it("returns 409 on version conflict error", async () => {
      mockSessionRepo.updateModule.mockRejectedValue(
        new VersionConflictError("TrainingModule", MODULE_ID),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });

    it("returns 409 on state transition error", async () => {
      // Force an invalid transition at the state machine level.
      // StateTransitionError used directly (real implementation) to test error handling;
      // no mock needed because it is a plain value class with no side-effects.
      mockSessionRepo.updateModule.mockRejectedValue(
        new StateTransitionError("locked", "content-ready"),
      );

      const request = makeRequest(0);
      const response = await POST(request, makeParams());

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toBe("conflict");
    });
  });
});
