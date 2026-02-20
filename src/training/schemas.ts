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
 * Zod schemas for the training workflow module.
 * Defines validation for training sessions, modules, content, responses, and API contracts.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum valid moduleIndex value (0-indexed, inclusive). Matches maxModules - 1 from TenantSettingsSchema. */
export const MAX_MODULE_INDEX = 19;

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const SessionStatusSchema = z.enum([
  "curriculum-generating",
  "in-progress",
  "evaluating",
  "passed",
  "failed",
  "in-remediation",
  "exhausted",
  "abandoned",
]);

export const ModuleStatusSchema = z.enum([
  "locked",
  "content-generating",
  "learning",
  "scenario-active",
  "quiz-active",
  "scored",
]);

export const ResponseTypeSchema = z.enum(["multiple-choice", "free-text"]);

// ---------------------------------------------------------------------------
// T002 – Entity schemas
// ---------------------------------------------------------------------------

export const CurriculumOutlineModuleSchema = z.object({
  title: z.string(),
  topicArea: z.string(),
  jobExpectationIndices: z.array(z.number()),
});

export const CurriculumOutlineSchema = z.object({
  modules: z.array(CurriculumOutlineModuleSchema).min(1).max(8),
  generatedAt: z.string().datetime(),
});

export const McOptionSchema = z.object({
  key: z.string(),
  text: z.string(),
  correct: z.boolean(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  narrative: z.string(),
  responseType: ResponseTypeSchema,
  options: z.array(McOptionSchema).optional(),
  rubric: z.string().optional(),
});

export const QuizQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  responseType: ResponseTypeSchema,
  options: z.array(McOptionSchema).optional(),
  rubric: z.string().optional(),
});

export const ModuleContentSchema = z.object({
  instruction: z.string().min(1),
  scenarios: z.array(ScenarioSchema).min(1),
  quiz: z.object({
    questions: z.array(QuizQuestionSchema).min(1),
  }),
  generatedAt: z.string().datetime(),
});

export const ScenarioResponseSchema = z.object({
  scenarioId: z.string(),
  responseType: ResponseTypeSchema,
  selectedOption: z.string().optional(),
  freeTextResponse: z.string().max(2000).optional(),
  score: z.number().min(0).max(1),
  llmRationale: z.string().optional(),
  submittedAt: z.string().datetime(),
});

export const QuizAnswerSchema = z.object({
  questionId: z.string(),
  responseType: ResponseTypeSchema,
  selectedOption: z.string().optional(),
  freeTextResponse: z.string().max(2000).optional(),
  score: z.number().min(0).max(1),
  llmRationale: z.string().optional(),
  submittedAt: z.string().datetime(),
});

export const TrainingModuleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  moduleIndex: z.number().int().min(0),
  title: z.string(),
  topicArea: z.string(),
  jobExpectationIndices: z.array(z.number()),
  status: ModuleStatusSchema,
  content: ModuleContentSchema.nullable(),
  scenarioResponses: z.array(ScenarioResponseSchema).default([]),
  quizAnswers: z.array(QuizAnswerSchema).default([]),
  moduleScore: z.number().min(0).max(1).nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TrainingSessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  employeeId: z.string().min(1),
  roleProfileId: z.string().min(1),
  roleProfileVersion: z.number().int().positive(),
  configHash: z.string().min(1),
  appVersion: z.string().min(1),
  status: SessionStatusSchema,
  attemptNumber: z.number().int().min(1).max(3),
  curriculum: CurriculumOutlineSchema,
  aggregateScore: z.number().min(0).max(1).nullable(),
  weakAreas: z.array(z.string()).nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const FreeTextEvaluationSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

// ---------------------------------------------------------------------------
// T003 – API request/response schemas
// ---------------------------------------------------------------------------

export const ScenarioSubmissionSchema = z
  .object({
    scenarioId: z.string().min(1),
    responseType: ResponseTypeSchema,
    selectedOption: z.string().optional(),
    freeTextResponse: z.string().max(2000).optional(),
  })
  .refine((data) => data.responseType !== "multiple-choice" || data.selectedOption !== undefined, {
    message: "selectedOption is required for multiple-choice responses",
  })
  .refine((data) => data.responseType !== "free-text" || data.freeTextResponse !== undefined, {
    message: "freeTextResponse is required for free-text responses",
  });

export const QuizSubmissionSchema = z.object({
  answers: z
    .array(
      z
        .object({
          questionId: z.string().min(1),
          responseType: ResponseTypeSchema,
          selectedOption: z.string().optional(),
          freeTextResponse: z.string().max(2000).optional(),
        })
        .refine(
          (data) => data.responseType !== "multiple-choice" || data.selectedOption !== undefined,
          { message: "selectedOption is required for multiple-choice responses" },
        )
        .refine(
          (data) => data.responseType !== "free-text" || data.freeTextResponse !== undefined,
          { message: "freeTextResponse is required for free-text responses" },
        ),
    )
    .min(1),
});

// Client-safe schemas (strip server-only fields)

export const McOptionClientSchema = z.object({
  key: z.string(),
  text: z.string(),
});

export const ScenarioClientSchema = z.object({
  id: z.string(),
  narrative: z.string(),
  responseType: ResponseTypeSchema,
  options: z.array(McOptionClientSchema).optional(),
});

export const QuizQuestionClientSchema = z.object({
  id: z.string(),
  text: z.string(),
  responseType: ResponseTypeSchema,
  options: z.array(McOptionClientSchema).optional(),
});

export const ModuleContentClientSchema = z.object({
  instruction: z.string().min(1),
  scenarios: z.array(ScenarioClientSchema).min(1),
  quiz: z.object({
    questions: z.array(QuizQuestionClientSchema).min(1),
  }),
  generatedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type ModuleStatus = z.infer<typeof ModuleStatusSchema>;
export type ResponseType = z.infer<typeof ResponseTypeSchema>;
export type CurriculumOutlineModule = z.infer<typeof CurriculumOutlineModuleSchema>;
export type CurriculumOutline = z.infer<typeof CurriculumOutlineSchema>;
export type McOption = z.infer<typeof McOptionSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type ModuleContent = z.infer<typeof ModuleContentSchema>;
export type ScenarioResponse = z.infer<typeof ScenarioResponseSchema>;
export type QuizAnswer = z.infer<typeof QuizAnswerSchema>;
export type TrainingModule = z.infer<typeof TrainingModuleSchema>;
export type TrainingSession = z.infer<typeof TrainingSessionSchema>;
export type FreeTextEvaluation = z.infer<typeof FreeTextEvaluationSchema>;
export type ScenarioSubmission = z.infer<typeof ScenarioSubmissionSchema>;
export type QuizSubmission = z.infer<typeof QuizSubmissionSchema>;
export type McOptionClient = z.infer<typeof McOptionClientSchema>;
export type ScenarioClient = z.infer<typeof ScenarioClientSchema>;
export type QuizQuestionClient = z.infer<typeof QuizQuestionClientSchema>;
export type ModuleContentClient = z.infer<typeof ModuleContentClientSchema>;
