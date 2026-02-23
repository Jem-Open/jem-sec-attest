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
 * Evidence generator — assembles a tamper-evident training evidence record
 * from a completed (terminal) training session and its modules.
 */

import { dispatchUpload } from "../compliance/orchestrator.js";
import { getSnapshot } from "../config/index.js";
import { getStorage } from "../storage/factory.js";
import type { TrainingModule, TrainingSession } from "../training/schemas.js";
import { SessionRepository } from "../training/session-repository.js";
import { EvidenceRepository } from "./evidence-repository.js";
import { computeContentHash } from "./hash.js";
import type { EvidenceBody, ModuleEvidence, TrainingEvidence } from "./schemas.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(["passed", "exhausted", "abandoned"]);
const CURRENT_SCHEMA_VERSION = 1;
const SESSIONS_COLLECTION = "training_sessions";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an immutable evidence record for a terminal training session.
 *
 * Creates and manages its own storage connection so it is safe to call as a
 * fire-and-forget background task without sharing a connection that may be
 * closed by the caller.
 *
 * Idempotent: if evidence already exists for the session, returns the existing record.
 * Throws if the session is not in a terminal state (passed, exhausted, abandoned).
 */
export async function generateEvidenceForSession(
  tenantId: string,
  sessionId: string,
): Promise<TrainingEvidence> {
  const storage = await getStorage();

  const sessionRepo = new SessionRepository(storage);
  const evidenceRepo = new EvidenceRepository(storage);

  // 1. Load session
  const session = await storage.findById<TrainingSession>(tenantId, SESSIONS_COLLECTION, sessionId);

  if (!session) {
    throw new Error(`Session '${sessionId}' not found`);
  }

  if (!TERMINAL_STATUSES.has(session.status)) {
    throw new Error(
      `Session '${sessionId}' is in '${session.status}' state, expected terminal state (passed, exhausted, or abandoned)`,
    );
  }

  // 2. Idempotency check — return existing evidence if already generated
  const existing = await evidenceRepo.findBySessionId(tenantId, sessionId);
  if (existing) {
    return existing;
  }

  // 3. Load modules
  const modules = await sessionRepo.findModulesBySession(tenantId, sessionId);

  // 4. Resolve tenant config for thresholds
  const snapshot = getSnapshot();
  const tenant = snapshot?.tenants.get(tenantId);
  const passThreshold = tenant?.settings?.training?.passThreshold ?? 0.7;
  const maxAttempts = tenant?.settings?.training?.maxAttempts ?? 3;

  // 5. Assemble the evidence body
  const evidenceBody: EvidenceBody = {
    session: {
      sessionId: session.id,
      employeeId: session.employeeId,
      tenantId: session.tenantId,
      attemptNumber: session.attemptNumber,
      totalAttempts: maxAttempts,
      status: session.status as "passed" | "exhausted" | "abandoned",
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    },
    policyAttestation: {
      configHash: session.configHash,
      roleProfileId: session.roleProfileId,
      roleProfileVersion: session.roleProfileVersion,
      appVersion: session.appVersion,
      passThreshold,
      maxAttempts,
    },
    modules: modules.map((m) => buildModuleEvidence(m)),
    outcome: {
      aggregateScore: session.aggregateScore,
      passed: session.status === "passed" ? true : session.status === "abandoned" ? null : false,
      passThreshold,
      weakAreas: session.weakAreas,
      moduleScores: modules.map((m) => ({
        moduleIndex: m.moduleIndex,
        title: m.title,
        score: m.moduleScore,
      })),
    },
  };

  // 6. Compute content hash for tamper detection
  const contentHash = computeContentHash(evidenceBody as unknown as Record<string, unknown>);

  // 7. Persist the evidence record
  const record = await evidenceRepo.create(tenantId, {
    tenantId,
    sessionId: session.id,
    employeeId: session.employeeId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    evidence: evidenceBody,
    contentHash,
    generatedAt: new Date().toISOString(),
  });

  // 8. Dispatch compliance upload (fire-and-forget).
  // Uses the shared storage singleton — no separate connection needed.
  const uploadStorage = await getStorage();
  dispatchUpload(tenantId, record.id, uploadStorage).catch((err) =>
    console.error("Compliance upload dispatch failed:", err),
  );

  return record;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a client-safe module evidence record.
 * Strips `correct` from options and `rubric` from scenarios/questions.
 */
function buildModuleEvidence(module: TrainingModule): ModuleEvidence {
  const scenarios = module.content?.scenarios ?? [];
  const quizQuestions = module.content?.quiz?.questions ?? [];

  return {
    moduleIndex: module.moduleIndex,
    title: module.title,
    topicArea: module.topicArea,
    moduleScore: module.moduleScore,
    scenarios: scenarios.map((s) => {
      const response = module.scenarioResponses.find((r) => r.scenarioId === s.id);
      return {
        scenarioId: s.id,
        narrative: s.narrative,
        responseType: s.responseType,
        options: s.options?.map((o) => ({ key: o.key, text: o.text })),
        employeeAnswer: {
          selectedOption: response?.selectedOption,
          freeTextResponse: response?.freeTextResponse,
          score: response?.score ?? 0,
          llmRationale: response?.llmRationale,
          submittedAt: response?.submittedAt ?? module.updatedAt ?? module.createdAt,
        },
      };
    }),
    quizQuestions: quizQuestions.map((q) => {
      const answer = module.quizAnswers.find((a) => a.questionId === q.id);
      return {
        questionId: q.id,
        questionText: q.text,
        responseType: q.responseType,
        options: q.options?.map((o) => ({ key: o.key, text: o.text })),
        employeeAnswer: {
          selectedOption: answer?.selectedOption,
          freeTextResponse: answer?.freeTextResponse,
          score: answer?.score ?? 0,
          llmRationale: answer?.llmRationale,
          submittedAt: answer?.submittedAt ?? module.updatedAt ?? module.createdAt,
        },
      };
    }),
    completedAt: module.status === "scored" ? module.updatedAt : null,
  };
}
