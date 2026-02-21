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
 * Zod schemas for the evidence module.
 * Defines validation for training evidence records, attestation data, and API contracts.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const TerminalSessionStatusSchema = z.enum(["passed", "exhausted", "abandoned"]);

export const ResponseTypeSchema = z.enum(["multiple-choice", "free-text"]);

// ---------------------------------------------------------------------------
// Answer / Question / Scenario evidence
// ---------------------------------------------------------------------------

export const AnswerEvidenceSchema = z.object({
  selectedOption: z.string().optional(),
  freeTextResponse: z.string().max(2000).optional(),
  score: z.number().min(0).max(1),
  llmRationale: z.string().optional(),
  submittedAt: z.string().datetime(),
});

export const ScenarioEvidenceSchema = z.object({
  scenarioId: z.string(),
  narrative: z.string(),
  responseType: ResponseTypeSchema,
  options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
  employeeAnswer: AnswerEvidenceSchema,
});

export const QuizQuestionEvidenceSchema = z.object({
  questionId: z.string(),
  questionText: z.string(),
  responseType: ResponseTypeSchema,
  options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
  employeeAnswer: AnswerEvidenceSchema,
});

// ---------------------------------------------------------------------------
// Module evidence
// ---------------------------------------------------------------------------

export const ModuleEvidenceSchema = z.object({
  moduleIndex: z.number().int().min(0),
  title: z.string(),
  topicArea: z.string(),
  moduleScore: z.number().min(0).max(1).nullable(),
  scenarios: z.array(ScenarioEvidenceSchema),
  quizQuestions: z.array(QuizQuestionEvidenceSchema),
  completedAt: z.string().datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Session summary
// ---------------------------------------------------------------------------

export const SessionSummarySchema = z.object({
  sessionId: z.string().uuid(),
  employeeId: z.string().min(1),
  tenantId: z.string().min(1),
  attemptNumber: z.number().int().min(1),
  totalAttempts: z.number().int().min(1),
  status: TerminalSessionStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Policy attestation
// ---------------------------------------------------------------------------

export const PolicyAttestationSchema = z.object({
  configHash: z.string().min(1),
  roleProfileId: z.string().min(1),
  roleProfileVersion: z.number().int().positive(),
  appVersion: z.string().min(1),
  passThreshold: z.number().min(0).max(1),
  maxAttempts: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// Outcome summary
// ---------------------------------------------------------------------------

export const OutcomeSummarySchema = z.object({
  aggregateScore: z.number().min(0).max(1).nullable(),
  passed: z.boolean().nullable(),
  passThreshold: z.number().min(0).max(1),
  weakAreas: z.array(z.string()).nullable(),
  moduleScores: z.array(
    z.object({
      moduleIndex: z.number().int(),
      title: z.string(),
      score: z.number().min(0).max(1).nullable(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Evidence body & top-level record
// ---------------------------------------------------------------------------

export const TrainingTypeSchema = z.enum(["onboarding", "annual", "other"]);

export const EvidenceBodySchema = z.object({
  session: SessionSummarySchema,
  policyAttestation: PolicyAttestationSchema,
  modules: z.array(ModuleEvidenceSchema),
  outcome: OutcomeSummarySchema,
  trainingType: TrainingTypeSchema.optional(),
});

export const TrainingEvidenceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  sessionId: z.string().uuid(),
  employeeId: z.string().min(1),
  schemaVersion: z.number().int().min(1),
  evidence: EvidenceBodySchema,
  contentHash: z.string().min(1),
  generatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Evidence summary (list endpoint — no full evidence body)
// ---------------------------------------------------------------------------

export const EvidenceSummarySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  employeeId: z.string().min(1),
  schemaVersion: z.number().int().min(1),
  contentHash: z.string().min(1),
  generatedAt: z.string().datetime(),
  outcome: z.object({
    status: TerminalSessionStatusSchema,
    aggregateScore: z.number().min(0).max(1).nullable(),
    passed: z.boolean().nullable(),
  }),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type TerminalSessionStatus = z.infer<typeof TerminalSessionStatusSchema>;
export type ResponseType = z.infer<typeof ResponseTypeSchema>;
export type AnswerEvidence = z.infer<typeof AnswerEvidenceSchema>;
export type ScenarioEvidence = z.infer<typeof ScenarioEvidenceSchema>;
export type QuizQuestionEvidence = z.infer<typeof QuizQuestionEvidenceSchema>;
export type ModuleEvidence = z.infer<typeof ModuleEvidenceSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type PolicyAttestation = z.infer<typeof PolicyAttestationSchema>;
export type OutcomeSummary = z.infer<typeof OutcomeSummarySchema>;
export type TrainingType = z.infer<typeof TrainingTypeSchema>;
export type EvidenceBody = z.infer<typeof EvidenceBodySchema>;
export type TrainingEvidence = z.infer<typeof TrainingEvidenceSchema>;
export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;
