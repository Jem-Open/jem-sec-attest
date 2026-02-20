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
 * Contract tests for evidence module Zod schemas.
 * Validates that evidence data shapes conform to the defined schemas,
 * and that content hashing is deterministic and tamper-evident.
 */

import { computeContentHash } from "@/evidence/hash";
import {
  AnswerEvidenceSchema,
  EvidenceSummarySchema,
  ModuleEvidenceSchema,
  OutcomeSummarySchema,
  PolicyAttestationSchema,
  QuizQuestionEvidenceSchema,
  ScenarioEvidenceSchema,
  SessionSummarySchema,
  TrainingEvidenceSchema,
} from "@/evidence/schemas";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Test fixture data
// ---------------------------------------------------------------------------

const SESSION_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const EVIDENCE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const EMPLOYEE_ID = "emp-sec-042";
const TENANT_ID = "acme-corp";
const NOW = "2026-02-20T10:30:00Z";
const COMPLETED_AT = "2026-02-20T11:15:00Z";
const SUBMITTED_AT = "2026-02-20T10:45:00Z";

function makeAnswerEvidence(overrides: Record<string, unknown> = {}) {
  return {
    score: 0.85,
    submittedAt: SUBMITTED_AT,
    selectedOption: "B",
    ...overrides,
  };
}

function makeScenarioEvidence(overrides: Record<string, unknown> = {}) {
  return {
    scenarioId: "scenario-001",
    narrative: "You discover a suspicious USB drive in the parking lot. What do you do?",
    responseType: "multiple-choice" as const,
    options: [
      { key: "A", text: "Plug it into your workstation" },
      { key: "B", text: "Turn it in to IT security" },
    ],
    employeeAnswer: makeAnswerEvidence(),
    ...overrides,
  };
}

function makeQuizQuestionEvidence(overrides: Record<string, unknown> = {}) {
  return {
    questionId: "quiz-q-001",
    questionText: "What is the primary purpose of multi-factor authentication?",
    responseType: "multiple-choice" as const,
    options: [
      { key: "A", text: "Speed up login" },
      { key: "B", text: "Add an extra layer of identity verification" },
    ],
    employeeAnswer: makeAnswerEvidence({ score: 1.0 }),
    ...overrides,
  };
}

function makeModuleEvidence(overrides: Record<string, unknown> = {}) {
  return {
    moduleIndex: 0,
    title: "Phishing Awareness",
    topicArea: "Social Engineering",
    moduleScore: 0.9,
    scenarios: [makeScenarioEvidence()],
    quizQuestions: [makeQuizQuestionEvidence()],
    completedAt: COMPLETED_AT,
    ...overrides,
  };
}

function makeSessionSummary(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    attemptNumber: 1,
    totalAttempts: 1,
    status: "passed" as const,
    createdAt: NOW,
    completedAt: COMPLETED_AT,
    ...overrides,
  };
}

function makePolicyAttestation(overrides: Record<string, unknown> = {}) {
  return {
    configHash: "sha256-abc123def456",
    roleProfileId: "rp-security-analyst",
    roleProfileVersion: 2,
    appVersion: "1.4.0",
    passThreshold: 0.7,
    maxAttempts: 3,
    ...overrides,
  };
}

function makeOutcomeSummary(overrides: Record<string, unknown> = {}) {
  return {
    aggregateScore: 0.88,
    passed: true,
    passThreshold: 0.7,
    weakAreas: null,
    moduleScores: [{ moduleIndex: 0, title: "Phishing Awareness", score: 0.9 }],
    ...overrides,
  };
}

function makeEvidenceBody(overrides: Record<string, unknown> = {}) {
  return {
    session: makeSessionSummary(),
    policyAttestation: makePolicyAttestation(),
    modules: [makeModuleEvidence()],
    outcome: makeOutcomeSummary(),
    ...overrides,
  };
}

function makeTrainingEvidence(overrides: Record<string, unknown> = {}) {
  const evidenceBody = makeEvidenceBody();
  return {
    id: EVIDENCE_ID,
    tenantId: TENANT_ID,
    sessionId: SESSION_ID,
    employeeId: EMPLOYEE_ID,
    schemaVersion: 1,
    evidence: evidenceBody,
    contentHash: computeContentHash(evidenceBody as unknown as Record<string, unknown>),
    generatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Valid TrainingEvidence validates against schema
// ---------------------------------------------------------------------------

describe("TrainingEvidenceSchema", () => {
  it("accepts a complete valid evidence object", () => {
    const evidence = makeTrainingEvidence();
    const result = TrainingEvidenceSchema.parse(evidence);

    expect(result.id).toBe(EVIDENCE_ID);
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.employeeId).toBe(EMPLOYEE_ID);
    expect(result.schemaVersion).toBe(1);
    expect(result.contentHash).toBeTruthy();
    expect(result.generatedAt).toBe(NOW);
    expect(result.evidence.session.status).toBe("passed");
  });

  // -------------------------------------------------------------------------
  // 2. Invalid TrainingEvidence fails validation
  // -------------------------------------------------------------------------

  it("rejects when id is missing", () => {
    const { id: _, ...noId } = makeTrainingEvidence();
    expect(() => TrainingEvidenceSchema.parse(noId)).toThrow();
  });

  it("rejects when id is not a valid UUID", () => {
    expect(() =>
      TrainingEvidenceSchema.parse(makeTrainingEvidence({ id: "not-a-uuid" })),
    ).toThrow();
  });

  it("rejects when contentHash is missing", () => {
    const { contentHash: _, ...noHash } = makeTrainingEvidence();
    expect(() => TrainingEvidenceSchema.parse(noHash)).toThrow();
  });

  it("rejects when contentHash is empty string", () => {
    expect(() => TrainingEvidenceSchema.parse(makeTrainingEvidence({ contentHash: "" }))).toThrow();
  });

  it("rejects when schemaVersion is a string instead of number", () => {
    expect(() =>
      TrainingEvidenceSchema.parse(makeTrainingEvidence({ schemaVersion: "one" })),
    ).toThrow();
  });

  it("rejects when schemaVersion is zero", () => {
    expect(() =>
      TrainingEvidenceSchema.parse(makeTrainingEvidence({ schemaVersion: 0 })),
    ).toThrow();
  });

  it("rejects when sessionId is not a UUID", () => {
    expect(() =>
      TrainingEvidenceSchema.parse(makeTrainingEvidence({ sessionId: "abc" })),
    ).toThrow();
  });

  it("rejects when generatedAt is not ISO datetime", () => {
    expect(() =>
      TrainingEvidenceSchema.parse(makeTrainingEvidence({ generatedAt: "yesterday" })),
    ).toThrow();
  });

  it("rejects when employeeId is empty", () => {
    expect(() => TrainingEvidenceSchema.parse(makeTrainingEvidence({ employeeId: "" }))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. EvidenceSummary projection strips evidence body
// ---------------------------------------------------------------------------

describe("EvidenceSummarySchema", () => {
  it("validates a correct summary projection", () => {
    const full = makeTrainingEvidence();
    const summary = {
      id: full.id,
      sessionId: full.sessionId,
      employeeId: full.employeeId,
      schemaVersion: full.schemaVersion,
      contentHash: full.contentHash,
      generatedAt: full.generatedAt,
      outcome: {
        status: full.evidence.session.status,
        aggregateScore: full.evidence.outcome.aggregateScore,
        passed: full.evidence.outcome.passed,
      },
    };

    const result = EvidenceSummarySchema.parse(summary);
    expect(result.id).toBe(EVIDENCE_ID);
    expect(result.outcome.status).toBe("passed");
    expect(result.outcome.aggregateScore).toBe(0.88);
    expect(result.outcome.passed).toBe(true);
  });

  it("does not include the full evidence body", () => {
    const full = makeTrainingEvidence();
    const summary = {
      id: full.id,
      sessionId: full.sessionId,
      employeeId: full.employeeId,
      schemaVersion: full.schemaVersion,
      contentHash: full.contentHash,
      generatedAt: full.generatedAt,
      outcome: {
        status: full.evidence.session.status,
        aggregateScore: full.evidence.outcome.aggregateScore,
        passed: full.evidence.outcome.passed,
      },
    };

    const result = EvidenceSummarySchema.parse(summary);
    // The parsed summary should not have an "evidence" property
    expect("evidence" in result).toBe(false);
  });

  it("accepts null aggregateScore and passed for abandoned sessions", () => {
    const summary = {
      id: EVIDENCE_ID,
      sessionId: SESSION_ID,
      employeeId: EMPLOYEE_ID,
      schemaVersion: 1,
      contentHash: "abc123",
      generatedAt: NOW,
      outcome: {
        status: "abandoned" as const,
        aggregateScore: null,
        passed: null,
      },
    };

    const result = EvidenceSummarySchema.parse(summary);
    expect(result.outcome.aggregateScore).toBeNull();
    expect(result.outcome.passed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Content hash recomputation matches stored hash
// ---------------------------------------------------------------------------

describe("Content hash integrity", () => {
  it("recomputed hash matches the stored hash", () => {
    const evidenceBody = makeEvidenceBody();
    const hash = computeContentHash(evidenceBody as unknown as Record<string, unknown>);
    const evidence = makeTrainingEvidence();

    expect(evidence.contentHash).toBe(hash);

    // Recompute from the evidence body embedded in the record
    const recomputedHash = computeContentHash(
      evidence.evidence as unknown as Record<string, unknown>,
    );
    expect(recomputedHash).toBe(evidence.contentHash);
  });

  // -------------------------------------------------------------------------
  // 5. Content hash changes with different data
  // -------------------------------------------------------------------------

  it("produces different hashes for different evidence bodies", () => {
    const body1 = makeEvidenceBody();
    const body2 = makeEvidenceBody({
      outcome: makeOutcomeSummary({ aggregateScore: 0.55, passed: false }),
    });

    const hash1 = computeContentHash(body1 as unknown as Record<string, unknown>);
    const hash2 = computeContentHash(body2 as unknown as Record<string, unknown>);

    expect(hash1).not.toBe(hash2);
  });

  it("produces different hashes when module data differs", () => {
    const body1 = makeEvidenceBody();
    const body2 = makeEvidenceBody({
      modules: [makeModuleEvidence({ moduleScore: 0.3, title: "Data Protection" })],
    });

    const hash1 = computeContentHash(body1 as unknown as Record<string, unknown>);
    const hash2 = computeContentHash(body2 as unknown as Record<string, unknown>);

    expect(hash1).not.toBe(hash2);
  });

  it("produces a 64-character hex string (SHA-256)", () => {
    const body = makeEvidenceBody();
    const hash = computeContentHash(body as unknown as Record<string, unknown>);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// 6. All nested schemas validate correctly
// ---------------------------------------------------------------------------

describe("Nested evidence schemas", () => {
  it("SessionSummarySchema accepts valid session data", () => {
    const result = SessionSummarySchema.parse(makeSessionSummary());
    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.status).toBe("passed");
    expect(result.attemptNumber).toBe(1);
  });

  it("SessionSummarySchema accepts exhausted status", () => {
    const result = SessionSummarySchema.parse(makeSessionSummary({ status: "exhausted" }));
    expect(result.status).toBe("exhausted");
  });

  it("SessionSummarySchema accepts abandoned status with null completedAt", () => {
    const result = SessionSummarySchema.parse(
      makeSessionSummary({ status: "abandoned", completedAt: null }),
    );
    expect(result.status).toBe("abandoned");
    expect(result.completedAt).toBeNull();
  });

  it("SessionSummarySchema rejects invalid status", () => {
    expect(() =>
      SessionSummarySchema.parse(makeSessionSummary({ status: "in-progress" })),
    ).toThrow();
  });

  it("SessionSummarySchema accepts attemptNumber > 3 (configurable per-tenant)", () => {
    const result = SessionSummarySchema.parse(makeSessionSummary({ attemptNumber: 5 }));
    expect(result.attemptNumber).toBe(5);
  });

  it("SessionSummarySchema rejects attemptNumber < 1", () => {
    expect(() => SessionSummarySchema.parse(makeSessionSummary({ attemptNumber: 0 }))).toThrow();
  });

  it("PolicyAttestationSchema accepts valid attestation", () => {
    const result = PolicyAttestationSchema.parse(makePolicyAttestation());
    expect(result.configHash).toBe("sha256-abc123def456");
    expect(result.passThreshold).toBe(0.7);
  });

  it("PolicyAttestationSchema rejects zero roleProfileVersion", () => {
    expect(() =>
      PolicyAttestationSchema.parse(makePolicyAttestation({ roleProfileVersion: 0 })),
    ).toThrow();
  });

  it("PolicyAttestationSchema rejects passThreshold > 1", () => {
    expect(() =>
      PolicyAttestationSchema.parse(makePolicyAttestation({ passThreshold: 1.5 })),
    ).toThrow();
  });

  it("ModuleEvidenceSchema accepts valid module", () => {
    const result = ModuleEvidenceSchema.parse(makeModuleEvidence());
    expect(result.moduleIndex).toBe(0);
    expect(result.moduleScore).toBe(0.9);
    expect(result.scenarios).toHaveLength(1);
    expect(result.quizQuestions).toHaveLength(1);
  });

  it("ModuleEvidenceSchema accepts null moduleScore and completedAt", () => {
    const result = ModuleEvidenceSchema.parse(
      makeModuleEvidence({ moduleScore: null, completedAt: null }),
    );
    expect(result.moduleScore).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it("ModuleEvidenceSchema rejects negative moduleIndex", () => {
    expect(() => ModuleEvidenceSchema.parse(makeModuleEvidence({ moduleIndex: -1 }))).toThrow();
  });

  it("ModuleEvidenceSchema rejects moduleScore > 1", () => {
    expect(() => ModuleEvidenceSchema.parse(makeModuleEvidence({ moduleScore: 1.1 }))).toThrow();
  });

  it("ScenarioEvidenceSchema accepts valid scenario", () => {
    const result = ScenarioEvidenceSchema.parse(makeScenarioEvidence());
    expect(result.scenarioId).toBe("scenario-001");
    expect(result.responseType).toBe("multiple-choice");
    expect(result.employeeAnswer.score).toBe(0.85);
  });

  it("ScenarioEvidenceSchema accepts free-text response type without options", () => {
    const result = ScenarioEvidenceSchema.parse(
      makeScenarioEvidence({
        responseType: "free-text",
        options: undefined,
        employeeAnswer: makeAnswerEvidence({
          selectedOption: undefined,
          freeTextResponse: "I would report it to security immediately.",
          score: 0.92,
          llmRationale: "Demonstrates strong security awareness.",
        }),
      }),
    );
    expect(result.responseType).toBe("free-text");
    expect(result.employeeAnswer.freeTextResponse).toBeTruthy();
  });

  it("QuizQuestionEvidenceSchema accepts valid quiz question", () => {
    const result = QuizQuestionEvidenceSchema.parse(makeQuizQuestionEvidence());
    expect(result.questionId).toBe("quiz-q-001");
    expect(result.employeeAnswer.score).toBe(1.0);
  });

  it("AnswerEvidenceSchema accepts valid answer", () => {
    const result = AnswerEvidenceSchema.parse(makeAnswerEvidence());
    expect(result.score).toBe(0.85);
    expect(result.submittedAt).toBe(SUBMITTED_AT);
  });

  it("AnswerEvidenceSchema rejects score below 0", () => {
    expect(() => AnswerEvidenceSchema.parse(makeAnswerEvidence({ score: -0.1 }))).toThrow();
  });

  it("AnswerEvidenceSchema rejects score above 1", () => {
    expect(() => AnswerEvidenceSchema.parse(makeAnswerEvidence({ score: 1.01 }))).toThrow();
  });

  it("OutcomeSummarySchema accepts valid outcome", () => {
    const result = OutcomeSummarySchema.parse(makeOutcomeSummary());
    expect(result.aggregateScore).toBe(0.88);
    expect(result.passed).toBe(true);
    expect(result.moduleScores).toHaveLength(1);
  });

  it("OutcomeSummarySchema accepts null aggregateScore and weakAreas", () => {
    const result = OutcomeSummarySchema.parse(
      makeOutcomeSummary({ aggregateScore: null, passed: null, weakAreas: null }),
    );
    expect(result.aggregateScore).toBeNull();
    expect(result.passed).toBeNull();
  });

  it("OutcomeSummarySchema accepts weakAreas as string array", () => {
    const result = OutcomeSummarySchema.parse(
      makeOutcomeSummary({ weakAreas: ["Phishing", "Password Management"] }),
    );
    expect(result.weakAreas).toEqual(["Phishing", "Password Management"]);
  });
});
