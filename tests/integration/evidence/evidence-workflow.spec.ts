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

import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/index", () => ({
  getSnapshot: vi.fn().mockReturnValue({
    tenants: new Map([
      [
        "test-tenant",
        {
          settings: {
            training: { passThreshold: 0.7, maxAttempts: 3 },
          },
        },
      ],
    ]),
  }),
}));

import { generateEvidenceForSession } from "@/evidence/evidence-generator";
import { EvidenceRepository } from "@/evidence/evidence-repository";
import { computeContentHash } from "@/evidence/hash";
import { TrainingEvidenceSchema } from "@/evidence/schemas";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { SessionRepository } from "@/training/session-repository";
import type { TrainingModule, TrainingSession } from "@/training/types";

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------

const TENANT_ID = "test-tenant";
const NOW = "2026-02-20T10:00:00.000Z";

// ---------------------------------------------------------------------------
// Helpers to build realistic test data
// ---------------------------------------------------------------------------

function buildSessionData(
  overrides: Partial<Omit<TrainingSession, "id">> = {},
): Omit<TrainingSession, "id"> {
  return {
    tenantId: TENANT_ID,
    employeeId: "emp-001",
    roleProfileId: "profile-001",
    roleProfileVersion: 1,
    configHash: "sha256-config-abc123",
    appVersion: "1.0.0",
    status: "in-progress",
    attemptNumber: 1,
    curriculum: {
      modules: [
        {
          title: "Network Security Fundamentals",
          topicArea: "network-security",
          jobExpectationIndices: [0, 1],
        },
        {
          title: "Data Protection Policies",
          topicArea: "data-protection",
          jobExpectationIndices: [2],
        },
      ],
      generatedAt: NOW,
    },
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function buildModuleData(
  sessionId: string,
  moduleIndex: number,
  overrides: Partial<Omit<TrainingModule, "id">> = {},
): Omit<TrainingModule, "id"> {
  const scenarioId = `scenario-${moduleIndex}-1`;
  const questionId = `question-${moduleIndex}-1`;

  return {
    tenantId: TENANT_ID,
    sessionId,
    moduleIndex,
    title: moduleIndex === 0 ? "Network Security Fundamentals" : "Data Protection Policies",
    topicArea: moduleIndex === 0 ? "network-security" : "data-protection",
    jobExpectationIndices: moduleIndex === 0 ? [0, 1] : [2],
    status: "scored",
    content: {
      instruction: `Learn about ${moduleIndex === 0 ? "network security" : "data protection"} best practices and policies.`,
      scenarios: [
        {
          id: scenarioId,
          narrative:
            "An employee reports suspicious network activity from an unknown IP address attempting to access internal servers.",
          responseType: "multiple-choice" as const,
          options: [
            { key: "A", text: "Ignore the activity", correct: false },
            { key: "B", text: "Block the IP and investigate", correct: true },
            { key: "C", text: "Restart the servers", correct: false },
          ],
          rubric: "Employee should escalate and block suspicious access.",
        },
      ],
      quiz: {
        questions: [
          {
            id: questionId,
            text: "What is the primary purpose of a firewall?",
            responseType: "multiple-choice" as const,
            options: [
              { key: "A", text: "Speed up internet", correct: false },
              { key: "B", text: "Filter network traffic", correct: true },
              { key: "C", text: "Store data", correct: false },
            ],
            rubric: "A firewall filters and controls network traffic.",
          },
        ],
      },
      generatedAt: NOW,
    },
    scenarioResponses: [
      {
        scenarioId,
        responseType: "multiple-choice" as const,
        selectedOption: "B",
        score: 1.0,
        submittedAt: NOW,
      },
    ],
    quizAnswers: [
      {
        questionId,
        responseType: "multiple-choice" as const,
        selectedOption: "B",
        score: 1.0,
        submittedAt: NOW,
      },
    ],
    moduleScore: 1.0,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Evidence Workflow Integration", () => {
  let storage: SQLiteAdapter;
  let sessionRepo: SessionRepository;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = join(
      tmpdir(),
      `jem-test-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    storage = new SQLiteAdapter({ dbPath });
    await storage.initialize();
    sessionRepo = new SessionRepository(storage);
  });

  afterEach(async () => {
    await storage.close();
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  });

  // -------------------------------------------------------------------------
  // 1. Passed session flow
  // -------------------------------------------------------------------------

  describe("passed session flow", () => {
    it("generates a complete evidence record with valid content hash", async () => {
      // Create session in in-progress state, then update to passed
      const session = await sessionRepo.createSession(TENANT_ID, buildSessionData());

      // Create modules with scored content
      await sessionRepo.createModules(TENANT_ID, [
        buildModuleData(session.id, 0),
        buildModuleData(session.id, 1),
      ]);

      // Transition session to passed
      const completedAt = "2026-02-20T11:00:00.000Z";
      await sessionRepo.updateSession(
        TENANT_ID,
        session.id,
        {
          status: "passed",
          aggregateScore: 1.0,
          weakAreas: [],
          completedAt,
        },
        session.version,
      );

      // Generate evidence
      const evidence = await generateEvidenceForSession(TENANT_ID, session.id, dbPath);

      // Validate against Zod schema
      const parsed = TrainingEvidenceSchema.parse(evidence);
      expect(parsed).toBeDefined();

      // Verify top-level fields
      expect(evidence.tenantId).toBe(TENANT_ID);
      expect(evidence.sessionId).toBe(session.id);
      expect(evidence.employeeId).toBe("emp-001");
      expect(evidence.schemaVersion).toBe(1);
      expect(evidence.id).toBeDefined();
      expect(evidence.generatedAt).toBeDefined();

      // Verify session summary in evidence body
      expect(evidence.evidence.session.sessionId).toBe(session.id);
      expect(evidence.evidence.session.status).toBe("passed");
      expect(evidence.evidence.session.employeeId).toBe("emp-001");
      expect(evidence.evidence.session.attemptNumber).toBe(1);

      // Verify policy attestation
      expect(evidence.evidence.policyAttestation.configHash).toBe("sha256-config-abc123");
      expect(evidence.evidence.policyAttestation.passThreshold).toBe(0.7);
      expect(evidence.evidence.policyAttestation.maxAttempts).toBe(3);

      // Verify modules
      expect(evidence.evidence.modules).toHaveLength(2);
      expect(evidence.evidence.modules[0].title).toBe("Network Security Fundamentals");
      expect(evidence.evidence.modules[0].moduleScore).toBe(1.0);
      expect(evidence.evidence.modules[0].scenarios).toHaveLength(1);
      expect(evidence.evidence.modules[0].quizQuestions).toHaveLength(1);

      // Verify scenario data is present (correct/rubric stripped)
      const scenario = evidence.evidence.modules[0].scenarios[0];
      expect(scenario.narrative).toContain("suspicious network activity");
      expect(scenario.employeeAnswer.selectedOption).toBe("B");
      expect(scenario.employeeAnswer.score).toBe(1.0);
      // rubric and correct should NOT be in evidence
      expect((scenario as Record<string, unknown>).rubric).toBeUndefined();
      if (scenario.options) {
        for (const opt of scenario.options) {
          expect((opt as Record<string, unknown>).correct).toBeUndefined();
        }
      }

      // Verify quiz data (correct/rubric stripped)
      const quiz = evidence.evidence.modules[0].quizQuestions[0];
      expect(quiz.questionText).toBe("What is the primary purpose of a firewall?");
      expect(quiz.employeeAnswer.selectedOption).toBe("B");
      expect(quiz.employeeAnswer.score).toBe(1.0);
      expect((quiz as Record<string, unknown>).rubric).toBeUndefined();

      // Verify outcome
      expect(evidence.evidence.outcome.aggregateScore).toBe(1.0);
      expect(evidence.evidence.outcome.passed).toBe(true);
      expect(evidence.evidence.outcome.passThreshold).toBe(0.7);
      expect(evidence.evidence.outcome.moduleScores).toHaveLength(2);

      // Verify content hash is valid by recomputing
      const recomputedHash = computeContentHash(
        evidence.evidence as unknown as Record<string, unknown>,
      );
      expect(evidence.contentHash).toBe(recomputedHash);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Abandoned session flow
  // -------------------------------------------------------------------------

  describe("abandoned session flow", () => {
    it("generates evidence with partial data for abandoned session", async () => {
      // Create session in-progress
      const session = await sessionRepo.createSession(TENANT_ID, buildSessionData());

      // Create modules — only the first is scored, second is still locked (no content)
      await sessionRepo.createModules(TENANT_ID, [
        buildModuleData(session.id, 0),
        buildModuleData(session.id, 1, {
          status: "locked",
          content: null,
          scenarioResponses: [],
          quizAnswers: [],
          moduleScore: null,
        }),
      ]);

      // Abandon the session
      await sessionRepo.updateSession(
        TENANT_ID,
        session.id,
        {
          status: "abandoned",
          completedAt: "2026-02-20T11:30:00.000Z",
        },
        session.version,
      );

      // Generate evidence
      const evidence = await generateEvidenceForSession(TENANT_ID, session.id, dbPath);

      // Validate against schema
      TrainingEvidenceSchema.parse(evidence);

      // Verify abandoned-specific fields
      expect(evidence.evidence.session.status).toBe("abandoned");
      expect(evidence.evidence.outcome.aggregateScore).toBeNull();
      expect(evidence.evidence.outcome.passed).toBeNull();

      // Second module should have null score and empty arrays
      const mod1 = evidence.evidence.modules[1];
      expect(mod1.moduleScore).toBeNull();
      expect(mod1.completedAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Idempotency
  // -------------------------------------------------------------------------

  describe("idempotency", () => {
    it("returns the same evidence record on second call", async () => {
      const session = await sessionRepo.createSession(
        TENANT_ID,
        buildSessionData({
          status: "passed",
          aggregateScore: 0.85,
          weakAreas: [],
          completedAt: NOW,
        }),
      );
      await sessionRepo.createModules(TENANT_ID, [buildModuleData(session.id, 0)]);

      // First generation
      const first = await generateEvidenceForSession(TENANT_ID, session.id, dbPath);

      // Second generation — should return same record
      const second = await generateEvidenceForSession(TENANT_ID, session.id, dbPath);

      expect(second.id).toBe(first.id);
      expect(second.contentHash).toBe(first.contentHash);
      expect(second.generatedAt).toBe(first.generatedAt);

      // Verify only one record exists in storage
      const evidenceRepo = new EvidenceRepository(storage);
      const found = await evidenceRepo.findBySessionId(TENANT_ID, session.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(first.id);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Non-terminal session error
  // -------------------------------------------------------------------------

  describe("non-terminal session error", () => {
    it("throws when session is in-progress", async () => {
      const session = await sessionRepo.createSession(
        TENANT_ID,
        buildSessionData({ status: "in-progress" }),
      );

      await expect(generateEvidenceForSession(TENANT_ID, session.id, dbPath)).rejects.toThrow(
        /expected terminal state/i,
      );
    });

    it("throws when session is in evaluating state", async () => {
      const session = await sessionRepo.createSession(
        TENANT_ID,
        buildSessionData({ status: "evaluating" }),
      );

      await expect(generateEvidenceForSession(TENANT_ID, session.id, dbPath)).rejects.toThrow(
        /expected terminal state/i,
      );
    });

    it("throws when session does not exist", async () => {
      await expect(
        generateEvidenceForSession(TENANT_ID, "nonexistent-session-id", dbPath),
      ).rejects.toThrow(/not found/i);
    });
  });
});
