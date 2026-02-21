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
 * Unit tests for the PDF evidence renderer.
 */

import { renderEvidencePdf } from "@/evidence/pdf-renderer";
import type { TrainingEvidence } from "@/evidence/schemas";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidence(overrides?: Partial<TrainingEvidence>): TrainingEvidence {
  return {
    id: "evi-0001",
    tenantId: "acme",
    sessionId: "sess-0001",
    employeeId: "emp-100",
    schemaVersion: 1,
    evidence: {
      session: {
        sessionId: "sess-0001",
        employeeId: "emp-100",
        tenantId: "acme",
        attemptNumber: 1,
        totalAttempts: 3,
        status: "passed",
        createdAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T01:00:00.000Z",
      },
      policyAttestation: {
        configHash: "cfg-hash-abc123",
        roleProfileId: "rp-001",
        roleProfileVersion: 1,
        appVersion: "1.0.0",
        passThreshold: 0.7,
        maxAttempts: 3,
      },
      modules: [
        {
          moduleIndex: 0,
          title: "Data Protection Basics",
          topicArea: "Privacy",
          moduleScore: 0.9,
          scenarios: [],
          quizQuestions: [
            {
              questionId: "q-001",
              questionText: "What is PII?",
              responseType: "multiple-choice",
              options: [
                { key: "a", text: "Personal info" },
                { key: "b", text: "Public info" },
              ],
              employeeAnswer: {
                selectedOption: "a",
                score: 1.0,
                submittedAt: "2026-01-01T00:30:00.000Z",
              },
            },
            {
              questionId: "q-002",
              questionText: "Explain data minimization.",
              responseType: "free-text",
              employeeAnswer: {
                freeTextResponse: "Only collect data that is necessary for the purpose.",
                score: 0.85,
                llmRationale: "Good understanding of the concept.",
                submittedAt: "2026-01-01T00:35:00.000Z",
              },
            },
          ],
          completedAt: "2026-01-01T00:40:00.000Z",
        },
      ],
      outcome: {
        aggregateScore: 0.85,
        passed: true,
        passThreshold: 0.7,
        weakAreas: null,
        moduleScores: [{ moduleIndex: 0, title: "Data Protection Basics", score: 0.9 }],
      },
    },
    contentHash: "sha256-abc123def456",
    generatedAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderEvidencePdf", () => {
  it("returns a non-empty PDF buffer for a passed session", async () => {
    const evidence = makeEvidence();
    const buffer = await renderEvidencePdf(evidence, "Acme Corp");

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PDF files start with %PDF
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("returns a valid PDF for an exhausted session", async () => {
    const evidence = makeEvidence({
      evidence: {
        ...makeEvidence().evidence,
        session: {
          ...makeEvidence().evidence.session,
          status: "exhausted",
          attemptNumber: 3,
        },
        outcome: {
          ...makeEvidence().evidence.outcome,
          passed: false,
          aggregateScore: 0.45,
          weakAreas: ["Privacy", "Access Control"],
        },
      },
    });
    const buffer = await renderEvidencePdf(evidence, "Acme Corp");

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("returns a valid PDF for an abandoned session", async () => {
    const evidence = makeEvidence({
      evidence: {
        ...makeEvidence().evidence,
        session: {
          ...makeEvidence().evidence.session,
          status: "abandoned",
          completedAt: null,
        },
        outcome: {
          ...makeEvidence().evidence.outcome,
          passed: null,
          aggregateScore: null,
        },
      },
    });
    const buffer = await renderEvidencePdf(evidence, "Acme Corp");

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("handles evidence with no modules", async () => {
    const evidence = makeEvidence({
      evidence: {
        ...makeEvidence().evidence,
        modules: [],
        outcome: {
          ...makeEvidence().evidence.outcome,
          moduleScores: [],
        },
      },
    });
    const buffer = await renderEvidencePdf(evidence, "Acme Corp");

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("handles evidence with trainingType set", async () => {
    const evidence = makeEvidence({
      evidence: {
        ...makeEvidence().evidence,
        trainingType: "onboarding",
      },
    });
    const buffer = await renderEvidencePdf(evidence, "Acme Corp");

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("handles evidence without trainingType (defaults to Not specified)", async () => {
    const evidence = makeEvidence();
    // trainingType is undefined by default in our fixture
    expect(evidence.evidence.trainingType).toBeUndefined();

    const buffer = await renderEvidencePdf(evidence, "Acme Corp");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("handles many modules (up to 20) without error", async () => {
    const modules = Array.from({ length: 20 }, (_, i) => ({
      moduleIndex: i,
      title: `Module ${i + 1}`,
      topicArea: `Topic ${i + 1}`,
      moduleScore: Math.random(),
      scenarios: [],
      quizQuestions: [],
      completedAt: "2026-01-01T01:00:00.000Z",
    }));
    const evidence = makeEvidence({
      evidence: {
        ...makeEvidence().evidence,
        modules,
        outcome: {
          ...makeEvidence().evidence.outcome,
          moduleScores: modules.map((m) => ({
            moduleIndex: m.moduleIndex,
            title: m.title,
            score: m.moduleScore,
          })),
        },
      },
    });

    const buffer = await renderEvidencePdf(evidence, "Acme Corp");
    expect(buffer).toBeInstanceOf(Buffer);
    // Multi-page PDF should be larger
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
