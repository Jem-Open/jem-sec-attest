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
 * Audit logging for training events.
 * MUST NOT include raw training content, employee free-text responses, or
 * LLM-generated instructional material — only scores, IDs, counts, and topic names.
 * Constitution Principle II: deterministic, audit-friendly records.
 */

import type { StorageAdapter } from "../storage/adapter.js";

const COLLECTION = "audit_events";

export async function logSessionStarted(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  attemptNumber: number,
  roleProfileVersion: number,
  configHash: string,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-session-started",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      attemptNumber,
      roleProfileVersion,
      configHash,
    },
  });
}

export async function logModuleCompleted(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  moduleIndex: number,
  moduleTitle: string,
  moduleScore: number,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-module-completed",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      moduleIndex,
      moduleTitle,
      moduleScore,
    },
  });
}

export async function logQuizSubmitted(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  moduleIndex: number,
  questionCount: number,
  mcCount: number,
  freeTextCount: number,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-quiz-submitted",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      moduleIndex,
      questionCount,
      mcCount,
      freeTextCount,
    },
  });
}

export async function logEvaluationCompleted(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  attemptNumber: number,
  aggregateScore: number,
  passed: boolean,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-evaluation-completed",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      attemptNumber,
      aggregateScore,
      passed,
    },
  });
}

export async function logRemediationInitiated(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  attemptNumber: number,
  weakAreaCount: number,
  weakAreas: string[],
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-remediation-initiated",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      attemptNumber,
      weakAreaCount,
      weakAreas,
    },
  });
}

export async function logSessionAbandoned(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  attemptNumber: number,
  modulesCompleted: number,
  totalModules: number,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-session-abandoned",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      attemptNumber,
      modulesCompleted,
      totalModules,
    },
  });
}

export async function logSessionExhausted(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  sessionId: string,
  finalScore: number,
  totalAttempts: number,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "training-session-exhausted",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      sessionId,
      finalScore,
      totalAttempts,
    },
  });
}
