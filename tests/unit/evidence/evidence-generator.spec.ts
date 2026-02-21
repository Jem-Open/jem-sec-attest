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

import { computeContentHash } from "@/evidence/hash";
import type { TrainingEvidence } from "@/evidence/schemas";
import type { TrainingModule, TrainingSession } from "@/training/schemas";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockStorage, mockSessionRepo, mockEvidenceRepo } = vi.hoisted(() => {
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
  const mockSessionRepo = {
    findActiveSession: vi.fn(),
    findSessionHistory: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    createModules: vi.fn(),
    findModulesBySession: vi.fn(),
    findModule: vi.fn(),
  };
  const mockEvidenceRepo = {
    create: vi.fn(),
    findBySessionId: vi.fn(),
    findById: vi.fn(),
    listByTenant: vi.fn(),
  };
  return { mockStorage, mockSessionRepo, mockEvidenceRepo };
});

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => mockStorage),
}));
vi.mock("@/training/session-repository", () => ({
  SessionRepository: vi.fn().mockImplementation(() => mockSessionRepo),
}));
vi.mock("@/evidence/evidence-repository", () => ({
  EvidenceRepository: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));
vi.mock("@/config/index", () => ({
  getSnapshot: vi.fn().mockReturnValue({
    tenants: new Map([
      [
        "acme-corp",
        {
          id: "acme-corp",
          name: "Acme Corp",
          settings: { training: { passThreshold: 0.7, maxAttempts: 3 } },
        },
      ],
    ]),
    configHash: "test-hash-123",
  }),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { generateEvidenceForSession } from "@/evidence/evidence-generator";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const ISO_NOW = "2026-02-20T10:00:00.000Z";
const ISO_EARLIER = "2026-02-20T09:00:00.000Z";

function makeSession(overrides?: Partial<TrainingSession>): TrainingSession {
  return {
    id: "sess-001",
    tenantId: "acme-corp",
    employeeId: "emp-001",
    roleProfileId: "rp-001",
    roleProfileVersion: 1,
    configHash: "cfg-hash-abc",
    appVersion: "1.0.0",
    status: "passed",
    attemptNumber: 1,
    curriculum: {
      modules: [{ title: "Security Basics", topicArea: "security", jobExpectationIndices: [0] }],
      generatedAt: ISO_EARLIER,
    },
    aggregateScore: 0.85,
    weakAreas: null,
    version: 2,
    createdAt: ISO_EARLIER,
    updatedAt: ISO_NOW,
    completedAt: ISO_NOW,
    ...overrides,
  };
}

function makeModule(overrides?: Partial<TrainingModule>): TrainingModule {
  return {
    id: "mod-001",
    tenantId: "acme-corp",
    sessionId: "sess-001",
    moduleIndex: 0,
    title: "Security Basics",
    topicArea: "security",
    jobExpectationIndices: [0],
    status: "scored",
    content: {
      instruction: "Learn about security fundamentals.",
      scenarios: [
        {
          id: "scen-001",
          narrative: "You discover a phishing email.",
          responseType: "multiple-choice",
          options: [
            { key: "A", text: "Click the link", correct: false },
            { key: "B", text: "Report it to IT", correct: true },
          ],
          rubric: "Employee should report phishing attempts.",
        },
      ],
      quiz: {
        questions: [
          {
            id: "quiz-001",
            text: "What is phishing?",
            responseType: "multiple-choice",
            options: [
              { key: "A", text: "A type of fishing", correct: false },
              { key: "B", text: "A social engineering attack", correct: true },
            ],
            rubric: "Must identify phishing as a social engineering attack.",
          },
        ],
      },
      generatedAt: ISO_EARLIER,
    },
    scenarioResponses: [
      {
        scenarioId: "scen-001",
        responseType: "multiple-choice",
        selectedOption: "B",
        score: 1.0,
        llmRationale: "Correct: reporting is the right action.",
        submittedAt: ISO_NOW,
      },
    ],
    quizAnswers: [
      {
        questionId: "quiz-001",
        responseType: "multiple-choice",
        selectedOption: "B",
        score: 1.0,
        llmRationale: "Correct identification of phishing.",
        submittedAt: ISO_NOW,
      },
    ],
    moduleScore: 0.85,
    version: 3,
    createdAt: ISO_EARLIER,
    updatedAt: ISO_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateEvidenceForSession", () => {
  let session: TrainingSession;
  let module: TrainingModule;

  beforeEach(() => {
    vi.clearAllMocks();

    session = makeSession();
    module = makeModule();

    // Default mock returns
    mockStorage.findById.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([module]);
    mockEvidenceRepo.findBySessionId.mockResolvedValue(null);
    mockEvidenceRepo.create.mockImplementation(
      (_tenantId: string, data: Omit<TrainingEvidence, "id">) => ({
        id: "ev-001",
        ...data,
      }),
    );
  });

  it("generates evidence for a passed session", async () => {
    const result = await generateEvidenceForSession("acme-corp", "sess-001");

    expect(mockEvidenceRepo.create).toHaveBeenCalledOnce();
    const createArg = mockEvidenceRepo.create.mock.calls[0][1];

    expect(createArg.schemaVersion).toBe(1);
    expect(createArg.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createArg.evidence.session.sessionId).toBe("sess-001");
    expect(createArg.evidence.session.status).toBe("passed");
    expect(createArg.evidence.policyAttestation).toBeDefined();
    expect(createArg.evidence.modules).toHaveLength(1);
    expect(createArg.evidence.outcome).toBeDefined();
    expect(result.id).toBe("ev-001");
  });

  it("generates evidence for an exhausted session", async () => {
    session = makeSession({
      status: "exhausted",
      aggregateScore: 0.5,
      weakAreas: ["password-management", "phishing-awareness"],
    });
    mockStorage.findById.mockResolvedValue(session);

    await generateEvidenceForSession("acme-corp", "sess-001");

    const createArg = mockEvidenceRepo.create.mock.calls[0][1];
    expect(createArg.evidence.session.status).toBe("exhausted");
    expect(createArg.evidence.outcome.weakAreas).toEqual([
      "password-management",
      "phishing-awareness",
    ]);
    expect(createArg.evidence.outcome.passed).toBe(false);
  });

  it("generates evidence for an abandoned session with partial data", async () => {
    session = makeSession({
      status: "abandoned",
      aggregateScore: null,
      completedAt: ISO_NOW,
    });
    module = makeModule({
      status: "scored",
      content: null,
      scenarioResponses: [],
      quizAnswers: [],
      moduleScore: null,
    });
    mockStorage.findById.mockResolvedValue(session);
    mockSessionRepo.findModulesBySession.mockResolvedValue([module]);

    await generateEvidenceForSession("acme-corp", "sess-001");

    const createArg = mockEvidenceRepo.create.mock.calls[0][1];
    expect(createArg.evidence.session.status).toBe("abandoned");
    expect(createArg.evidence.modules[0].scenarios).toEqual([]);
    expect(createArg.evidence.modules[0].quizQuestions).toEqual([]);
    expect(createArg.evidence.modules[0].moduleScore).toBeNull();
  });

  it("returns existing evidence (idempotent)", async () => {
    const existingEvidence = {
      id: "ev-existing",
      tenantId: "acme-corp",
      sessionId: "sess-001",
      employeeId: "emp-001",
      schemaVersion: 1,
      evidence: {} as TrainingEvidence["evidence"],
      contentHash: "abc123",
      generatedAt: ISO_NOW,
    };
    mockEvidenceRepo.findBySessionId.mockResolvedValue(existingEvidence);

    const result = await generateEvidenceForSession("acme-corp", "sess-001");

    expect(mockEvidenceRepo.create).not.toHaveBeenCalled();
    expect(result).toBe(existingEvidence);
  });

  it("throws error for non-terminal session", async () => {
    session = makeSession({ status: "in-progress" });
    mockStorage.findById.mockResolvedValue(session);

    await expect(generateEvidenceForSession("acme-corp", "sess-001")).rejects.toThrow(/terminal/i);
  });

  it("excludes correct and rubric fields from evidence", async () => {
    await generateEvidenceForSession("acme-corp", "sess-001");

    const createArg = mockEvidenceRepo.create.mock.calls[0][1];
    const moduleEvidence = createArg.evidence.modules[0];

    // Scenarios should not have correct or rubric
    for (const scenario of moduleEvidence.scenarios) {
      for (const option of scenario.options ?? []) {
        expect(option).not.toHaveProperty("correct");
      }
      expect(scenario).not.toHaveProperty("rubric");
    }

    // Quiz questions should not have correct or rubric
    for (const question of moduleEvidence.quizQuestions) {
      for (const option of question.options ?? []) {
        expect(option).not.toHaveProperty("correct");
      }
      expect(question).not.toHaveProperty("rubric");
    }
  });

  it("content hash matches recomputation", async () => {
    await generateEvidenceForSession("acme-corp", "sess-001");

    const createArg = mockEvidenceRepo.create.mock.calls[0][1];
    const recomputedHash = computeContentHash(
      createArg.evidence as unknown as Record<string, unknown>,
    );

    expect(createArg.contentHash).toBe(recomputedHash);
  });

  it("includes policy attestation with config hash", async () => {
    await generateEvidenceForSession("acme-corp", "sess-001");

    const createArg = mockEvidenceRepo.create.mock.calls[0][1];
    const attestation = createArg.evidence.policyAttestation;

    expect(attestation.configHash).toBe("cfg-hash-abc");
    expect(attestation.roleProfileId).toBe("rp-001");
    expect(attestation.roleProfileVersion).toBe(1);
    expect(attestation.appVersion).toBe("1.0.0");
    expect(attestation.passThreshold).toBe(0.7);
    expect(attestation.maxAttempts).toBe(3);
  });
});
