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
 * Unit tests for POST and GET /api/training/{tenant}/session
 * T013 — POST: start a new training session
 * T014 — GET:  get current session state
 *
 * All external dependencies are mocked.
 */

// ---------------------------------------------------------------------------
// vi.mock calls are hoisted — place them before imports for clarity.
// Use vi.hoisted so the mock objects are available inside the hoisted vi.mock
// factory functions (which run before const declarations in module scope).
// ---------------------------------------------------------------------------

const { mockStorage, mockSessionRepo, mockProfileRepo } = vi.hoisted(() => {
  const mockStorage = {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation((_t: string, fn: () => Promise<unknown>) => fn()),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
  };

  const mockSessionRepo = {
    findActiveSession: vi.fn(),
    findSessionHistory: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    createModules: vi.fn(),
    findModulesBySession: vi.fn(),
  };

  const mockProfileRepo = {
    findByEmployee: vi.fn(),
    confirmProfile: vi.fn(),
  };

  return { mockStorage, mockSessionRepo, mockProfileRepo };
});

vi.mock("@/storage/factory", () => ({
  getStorage: vi.fn().mockResolvedValue(mockStorage),
}));

vi.mock("@/training/session-repository", () => ({
  SessionRepository: vi.fn().mockImplementation(() => mockSessionRepo),
}));

vi.mock("@/intake/profile-repository", () => ({
  ProfileRepository: vi.fn().mockImplementation(() => mockProfileRepo),
}));

vi.mock("@/config/index", () => ({
  getSnapshot: vi.fn(),
}));

vi.mock("@/intake/ai-model-resolver", () => ({
  resolveModel: vi.fn().mockReturnValue({}),
}));

vi.mock("@/training/curriculum-generator", () => ({
  CurriculumGenerationError: class CurriculumGenerationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "CurriculumGenerationError";
      this.code = code;
    }
  },
  generateCurriculum: vi.fn(),
}));

vi.mock("@/training/audit", () => ({
  logSessionStarted: vi.fn().mockResolvedValue(undefined),
  logRemediationInitiated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/training/remediation-planner", () => ({
  RemediationPlanError: class RemediationPlanError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "RemediationPlanError";
      this.code = code;
    }
  },
  generateRemediationCurriculum: vi.fn(),
}));

vi.mock("@/training/state-machine", () => ({
  transitionSession: vi.fn().mockReturnValue("in-progress"),
}));

vi.mock("@/audit/audit-logger", () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ---------------------------------------------------------------------------
// Imports (after all vi.mock calls)
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSnapshot } from "@/config/index";
import { resolveModel } from "@/intake/ai-model-resolver";
import { logRemediationInitiated, logSessionStarted } from "@/training/audit";
import { CurriculumGenerationError, generateCurriculum } from "@/training/curriculum-generator";
import { generateRemediationCurriculum } from "@/training/remediation-planner";

import { GET, POST } from "../../../app/api/training/[tenant]/session/route";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";
const TENANT_SLUG = "acme-corp";
const TENANT_ID = "acme-corp";
const EMPLOYEE_ID = "emp-001";

function makeRequest(method: "POST" | "GET", tenantId = TENANT_ID, employeeId = EMPLOYEE_ID) {
  return new Request(`http://localhost:3000/api/training/${TENANT_SLUG}/session`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      "x-employee-id": employeeId,
    },
  });
}

function makeParams(tenant = TENANT_SLUG) {
  return { params: Promise.resolve({ tenant }) };
}

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    name: "Acme Corp",
    settings: {
      training: { maxModules: 8, maxAttempts: 3, enableRemediation: true, ...overrides },
    },
  };
}

function makeTenantNoRemediation() {
  return makeTenant({ enableRemediation: false });
}

function makeSnapshotWith(tenant: ReturnType<typeof makeTenant>) {
  return {
    tenants: new Map([[TENANT_SLUG, tenant]]),
    hash: "config-hash-abc",
    configHash: "config-hash-abc",
  };
}

function makeSnapshot() {
  return {
    tenants: new Map([[TENANT_SLUG, makeTenant()]]),
    hash: "config-hash-abc",
    configHash: "config-hash-abc",
  };
}

function makeRoleProfile() {
  return {
    id: "rp-001",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    jobExpectations: ["Manage network security", "Conduct audits"],
    status: "confirmed",
    version: 1,
    configHash: "config-hash-abc",
    appVersion: "1.0.0",
    confirmedAt: ISO,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

function makeCurriculum() {
  return {
    modules: [
      { title: "Network Security", topicArea: "Security", jobExpectationIndices: [0] },
      { title: "Audit Practices", topicArea: "Audit", jobExpectationIndices: [1] },
    ],
    generatedAt: ISO,
  };
}

function makeSession() {
  return {
    id: "sess-001",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    roleProfileId: "rp-001",
    roleProfileVersion: 1,
    configHash: "config-hash-abc",
    appVersion: "unknown",
    status: "in-progress",
    attemptNumber: 1,
    curriculum: makeCurriculum(),
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
  };
}

function makeFailedSession() {
  return {
    id: "sess-001",
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    roleProfileId: "rp-001",
    roleProfileVersion: 1,
    configHash: "config-hash-abc",
    appVersion: "unknown",
    status: "failed",
    attemptNumber: 1,
    curriculum: makeCurriculum(),
    aggregateScore: 0.5,
    weakAreas: ["Network Security"],
    version: 2,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
  };
}

function makeRemediationCurriculum() {
  return {
    modules: [
      {
        title: "Network Security Remediation",
        topicArea: "Network Security",
        jobExpectationIndices: [0],
      },
    ],
    generatedAt: ISO,
  };
}

function makeModules() {
  return [
    {
      id: "mod-001",
      tenantId: TENANT_ID,
      sessionId: "sess-001",
      moduleIndex: 0,
      title: "Network Security",
      topicArea: "Security",
      jobExpectationIndices: [0],
      status: "locked",
      content: null,
      scenarioResponses: [],
      quizAnswers: [],
      moduleScore: null,
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
    },
    {
      id: "mod-002",
      tenantId: TENANT_ID,
      sessionId: "sess-001",
      moduleIndex: 1,
      title: "Audit Practices",
      topicArea: "Audit",
      jobExpectationIndices: [1],
      status: "locked",
      content: null,
      scenarioResponses: [],
      quizAnswers: [],
      moduleScore: null,
      version: 1,
      createdAt: ISO,
      updatedAt: ISO,
    },
  ];
}

function makeModuleWithContent() {
  return {
    id: "mod-001",
    tenantId: TENANT_ID,
    sessionId: "sess-001",
    moduleIndex: 0,
    title: "Network Security",
    topicArea: "Security",
    jobExpectationIndices: [0],
    status: "learning",
    content: {
      instruction: "Learn about network security basics.",
      scenarios: [
        {
          id: "sc-1",
          narrative: "You notice an unusual login.",
          responseType: "multiple-choice",
          options: [
            { key: "A", text: "Ignore it", correct: true },
            { key: "B", text: "Report it", correct: false },
          ],
          rubric: "Always report unusual logins immediately.",
        },
        {
          id: "sc-2",
          narrative: "Describe your response to a phishing email.",
          responseType: "free-text",
          rubric: "Should mention not clicking links.",
        },
      ],
      quiz: {
        questions: [
          {
            id: "q-1",
            text: "What should you do?",
            responseType: "multiple-choice",
            options: [
              { key: "A", text: "Option A", correct: false },
              { key: "B", text: "Option B", correct: true },
            ],
            rubric: "Choose the safest option.",
          },
          {
            id: "q-2",
            text: "Explain the concept.",
            responseType: "free-text",
            rubric: "Should cover key points.",
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
  };
}

// ---------------------------------------------------------------------------
// POST /api/training/{tenant}/session — T013
// ---------------------------------------------------------------------------

describe("POST /api/training/{tenant}/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSnapshot).mockReturnValue(makeSnapshot() as ReturnType<typeof getSnapshot>);
    vi.mocked(resolveModel).mockReturnValue({} as ReturnType<typeof resolveModel>);
    // Safe defaults: no active session, no failed session, no profile (fail-fast by default)
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findSessionHistory.mockResolvedValue([]);
    mockSessionRepo.updateSession.mockResolvedValue(makeSession());
    mockProfileRepo.findByEmployee.mockResolvedValue(null);
  });

  it("returns 401 when x-tenant-id header is missing", async () => {
    const request = new Request(`http://localhost:3000/api/training/${TENANT_SLUG}/session`, {
      method: "POST",
      headers: { "x-employee-id": EMPLOYEE_ID },
    });

    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  it("returns 401 when x-employee-id header is missing", async () => {
    const request = new Request(`http://localhost:3000/api/training/${TENANT_SLUG}/session`, {
      method: "POST",
      headers: { "x-tenant-id": TENANT_ID },
    });

    const response = await POST(request, makeParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  it("returns 401 when tenantId header does not match tenant slug", async () => {
    const response = await POST(makeRequest("POST", "other-tenant"), makeParams());

    expect(response.status).toBe(401);
  });

  it("returns 409 when an active session already exists for the employee", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(makeSession());

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
  });

  it("returns 404 when no confirmed role profile exists for the employee", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockProfileRepo.findByEmployee.mockResolvedValue(null);

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error", "not_found");
  });

  it("returns 201 with session and modules when creation succeeds", async () => {
    const session = makeSession();
    const modules = makeModules();

    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    vi.mocked(generateCurriculum).mockResolvedValue(makeCurriculum());
    mockSessionRepo.createSession.mockResolvedValue(session);
    mockSessionRepo.createModules.mockResolvedValue(modules);

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("session");
    expect(body).toHaveProperty("modules");
    expect(body.session.id).toBe("sess-001");
    expect(body.modules).toHaveLength(2);
  });

  it("creates module records for each curriculum module", async () => {
    const curriculum = makeCurriculum();
    const session = makeSession();
    const modules = makeModules();

    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    vi.mocked(generateCurriculum).mockResolvedValue(curriculum);
    mockSessionRepo.createSession.mockResolvedValue(session);
    mockSessionRepo.createModules.mockResolvedValue(modules);

    await POST(makeRequest("POST"), makeParams());

    expect(mockSessionRepo.createModules).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({ moduleIndex: 0, title: "Network Security", status: "locked" }),
        expect.objectContaining({ moduleIndex: 1, title: "Audit Practices", status: "locked" }),
      ]),
    );
  });

  it("logs audit event on successful session creation", async () => {
    const session = makeSession();
    const modules = makeModules();
    const profile = makeRoleProfile();

    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockProfileRepo.findByEmployee.mockResolvedValue(profile);
    vi.mocked(generateCurriculum).mockResolvedValue(makeCurriculum());
    mockSessionRepo.createSession.mockResolvedValue(session);
    mockSessionRepo.createModules.mockResolvedValue(modules);

    await POST(makeRequest("POST"), makeParams());

    expect(vi.mocked(logSessionStarted)).toHaveBeenCalledWith(
      expect.anything(), // storage
      TENANT_ID,
      EMPLOYEE_ID,
      session.id,
      1, // attemptNumber
      profile.version,
      "config-hash-abc",
    );
  });

  it("returns 503 when curriculum generation fails with ai_unavailable", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    vi.mocked(generateCurriculum).mockRejectedValue(
      new CurriculumGenerationError("AI service down", "ai_unavailable"),
    );

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toHaveProperty("error", "ai_unavailable");
  });

  it("returns 422 when curriculum generation fails with generation_failed", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    vi.mocked(generateCurriculum).mockRejectedValue(
      new CurriculumGenerationError("No modules generated", "generation_failed"),
    );

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toHaveProperty("error", "generation_failed");
  });
});

// ---------------------------------------------------------------------------
// POST /api/training/{tenant}/session — T022: Remediation
// ---------------------------------------------------------------------------

describe("POST /api/training/{tenant}/session — T022: Remediation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSnapshot).mockReturnValue(makeSnapshot() as ReturnType<typeof getSnapshot>);
    vi.mocked(resolveModel).mockReturnValue({} as ReturnType<typeof resolveModel>);
    // Safe defaults: no active session, failed session present, profile present
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findSessionHistory.mockResolvedValue([makeFailedSession()]);
    mockSessionRepo.updateSession.mockResolvedValue({
      ...makeFailedSession(),
      status: "in-progress",
      attemptNumber: 2,
      curriculum: makeRemediationCurriculum(),
    });
    mockSessionRepo.createModules.mockResolvedValue([]);
    mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    vi.mocked(generateRemediationCurriculum).mockResolvedValue(makeRemediationCurriculum());
  });

  it("returns 201 when starting remediation from a failed session with attempts remaining", async () => {
    const modules = [
      {
        id: "rem-mod-001",
        tenantId: TENANT_ID,
        sessionId: "sess-001",
        moduleIndex: 0,
        title: "Network Security Remediation",
        topicArea: "Network Security",
        jobExpectationIndices: [0],
        status: "locked",
        content: null,
        scenarioResponses: [],
        quizAnswers: [],
        moduleScore: null,
        version: 1,
        createdAt: ISO,
        updatedAt: ISO,
      },
    ];
    mockSessionRepo.createModules.mockResolvedValue(modules);

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty("session");
    expect(body).toHaveProperty("modules");
  });

  it("returns 409 when remediation is not enabled for the tenant", async () => {
    vi.mocked(getSnapshot).mockReturnValue(
      makeSnapshotWith(makeTenantNoRemediation()) as ReturnType<typeof getSnapshot>,
    );

    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toHaveProperty("error", "conflict");
    expect(body.message).toMatch(/remediation/i);
  });

  it("increments attemptNumber when starting remediation", async () => {
    const failedSession = makeFailedSession();
    mockSessionRepo.findSessionHistory.mockResolvedValue([failedSession]);
    vi.mocked(generateRemediationCurriculum).mockResolvedValue(makeRemediationCurriculum());

    await POST(makeRequest("POST"), makeParams());

    expect(mockSessionRepo.updateSession).toHaveBeenCalledWith(
      TENANT_ID,
      failedSession.id,
      expect.objectContaining({ attemptNumber: failedSession.attemptNumber + 1 }),
      failedSession.version,
    );
  });

  it("logs remediation-initiated audit event when starting remediation", async () => {
    const failedSession = makeFailedSession();
    mockSessionRepo.findSessionHistory.mockResolvedValue([failedSession]);

    await POST(makeRequest("POST"), makeParams());

    expect(vi.mocked(logRemediationInitiated)).toHaveBeenCalledWith(
      expect.anything(), // storage
      TENANT_ID,
      EMPLOYEE_ID,
      failedSession.id,
      failedSession.attemptNumber + 1,
      failedSession.weakAreas?.length,
      failedSession.weakAreas,
    );
  });

  it("does not start remediation when failed session has exhausted all attempts", async () => {
    const exhaustedFailedSession = { ...makeFailedSession(), attemptNumber: 3 };
    mockSessionRepo.findSessionHistory.mockResolvedValue([exhaustedFailedSession]);
    mockProfileRepo.findByEmployee.mockResolvedValue(makeRoleProfile());
    vi.mocked(generateCurriculum).mockResolvedValue(makeCurriculum());
    mockSessionRepo.createSession.mockResolvedValue(makeSession());
    mockSessionRepo.createModules.mockResolvedValue(makeModules());

    // Should fall through to fresh session creation (won't find failed session with attempts remaining)
    const response = await POST(makeRequest("POST"), makeParams());

    expect(response.status).toBe(201);
    // Remediation planner should NOT have been called
    expect(vi.mocked(generateRemediationCurriculum)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /api/training/{tenant}/session — T014
// ---------------------------------------------------------------------------

describe("GET /api/training/{tenant}/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSnapshot).mockReturnValue(makeSnapshot() as ReturnType<typeof getSnapshot>);
    // Safe defaults
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findSessionHistory.mockResolvedValue([]);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
  });

  it("returns 401 when x-tenant-id header is missing", async () => {
    const request = new Request(`http://localhost:3000/api/training/${TENANT_SLUG}/session`, {
      method: "GET",
      headers: { "x-employee-id": EMPLOYEE_ID },
    });

    const response = await GET(request, makeParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  it("returns 401 when tenantId does not match tenant slug", async () => {
    const response = await GET(makeRequest("GET", "wrong-tenant"), makeParams());

    expect(response.status).toBe(401);
  });

  it("returns 404 when no session exists for the employee", async () => {
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findSessionHistory.mockResolvedValue([]);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toHaveProperty("error", "not_found");
  });

  it("returns 200 with current session when an active session exists", async () => {
    const session = makeSession();
    const modules = makeModules();

    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("session");
    expect(body).toHaveProperty("modules");
    expect(body.session.id).toBe("sess-001");
  });

  it("returns most recent session from history when no active session exists", async () => {
    const pastSession = { ...makeSession(), status: "passed" };
    const modules = makeModules();

    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findSessionHistory.mockResolvedValue([pastSession]);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.status).toBe("passed");
  });

  it("strips correct field from MC options in module content scenarios", async () => {
    const session = makeSession();
    const moduleWithContent = makeModuleWithContent();

    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([moduleWithContent]);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    const returnedModule = body.modules[0];
    expect(returnedModule.content).not.toBeNull();

    for (const scenario of returnedModule.content.scenarios) {
      if (scenario.options) {
        for (const option of scenario.options) {
          expect(option).not.toHaveProperty("correct");
        }
      }
    }
  });

  it("strips rubric field from scenarios in module content", async () => {
    const session = makeSession();
    const moduleWithContent = makeModuleWithContent();

    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([moduleWithContent]);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    const returnedModule = body.modules[0];

    for (const scenario of returnedModule.content.scenarios) {
      expect(scenario).not.toHaveProperty("rubric");
    }
  });

  it("strips rubric field from quiz questions in module content", async () => {
    const session = makeSession();
    const moduleWithContent = makeModuleWithContent();

    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([moduleWithContent]);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    const returnedModule = body.modules[0];

    for (const question of returnedModule.content.quiz.questions) {
      expect(question).not.toHaveProperty("rubric");
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/training/{tenant}/session?history=true — T030
// ---------------------------------------------------------------------------

describe("GET /api/training/{tenant}/session?history=true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSnapshot).mockReturnValue(makeSnapshot() as ReturnType<typeof getSnapshot>);
    mockSessionRepo.findActiveSession.mockResolvedValue(null);
    mockSessionRepo.findSessionHistory.mockResolvedValue([]);
    mockSessionRepo.findModulesBySession.mockResolvedValue([]);
  });

  function makeHistoryRequest(tenantId = TENANT_ID, employeeId = EMPLOYEE_ID) {
    return new Request(`http://localhost:3000/api/training/${TENANT_SLUG}/session?history=true`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId,
        "x-employee-id": employeeId,
      },
    });
  }

  it("returns 401 when x-tenant-id header is missing", async () => {
    const request = new Request(
      `http://localhost:3000/api/training/${TENANT_SLUG}/session?history=true`,
      {
        method: "GET",
        headers: { "x-employee-id": EMPLOYEE_ID },
      },
    );

    const response = await GET(request, makeParams());

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error", "unauthorized");
  });

  it("returns 200 with empty array when no sessions exist", async () => {
    mockSessionRepo.findSessionHistory.mockResolvedValue([]);

    const response = await GET(makeHistoryRequest(), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it("returns 200 with array of sessions and their modules", async () => {
    const session1 = makeSession();
    const session2 = { ...makeSession(), id: "sess-002", status: "passed", attemptNumber: 2 };
    const modules = makeModules();

    mockSessionRepo.findSessionHistory.mockResolvedValue([session2, session1]);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);

    const response = await GET(makeHistoryRequest(), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty("session");
    expect(body[0]).toHaveProperty("modules");
    expect(body[0].session.id).toBe("sess-002");
    expect(body[1].session.id).toBe("sess-001");
  });

  it("does not call findActiveSession when history=true", async () => {
    mockSessionRepo.findSessionHistory.mockResolvedValue([]);

    await GET(makeHistoryRequest(), makeParams());

    expect(mockSessionRepo.findActiveSession).not.toHaveBeenCalled();
  });

  it("strips server-only fields from module content in history results", async () => {
    const session1 = makeSession();
    const moduleWithContent = makeModuleWithContent();

    mockSessionRepo.findSessionHistory.mockResolvedValue([session1]);
    mockSessionRepo.findModulesBySession.mockResolvedValue([moduleWithContent]);

    const response = await GET(makeHistoryRequest(), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    const returnedModule = body[0].modules[0];
    expect(returnedModule.content).not.toBeNull();

    for (const scenario of returnedModule.content.scenarios) {
      expect(scenario).not.toHaveProperty("rubric");
      if (scenario.options) {
        for (const option of scenario.options) {
          expect(option).not.toHaveProperty("correct");
        }
      }
    }
  });

  it("GET without history param returns single session (existing behavior unchanged)", async () => {
    const session = makeSession();
    const modules = makeModules();

    mockSessionRepo.findActiveSession.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue(modules);

    const response = await GET(makeRequest("GET"), makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    // Single session response has shape { session, modules }, not an array
    expect(body).toHaveProperty("session");
    expect(body).toHaveProperty("modules");
    expect(Array.isArray(body)).toBe(false);
  });
});
