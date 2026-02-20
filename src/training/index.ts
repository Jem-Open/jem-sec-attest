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
 * Training module public API.
 * Exports schemas, types, state machine, score calculator, repository, and audit functions.
 */

// --- Schemas ---
export {
  CurriculumOutlineModuleSchema,
  CurriculumOutlineSchema,
  FreeTextEvaluationSchema,
  McOptionClientSchema,
  McOptionSchema,
  ModuleContentClientSchema,
  ModuleContentSchema,
  ModuleStatusSchema,
  QuizAnswerSchema,
  QuizQuestionClientSchema,
  QuizQuestionSchema,
  QuizSubmissionSchema,
  ResponseTypeSchema,
  ScenarioClientSchema,
  ScenarioResponseSchema,
  ScenarioSchema,
  ScenarioSubmissionSchema,
  SessionStatusSchema,
  TrainingModuleSchema,
  TrainingSessionSchema,
} from "./schemas.js";

// --- Types ---
export type {
  CurriculumOutline,
  CurriculumOutlineModule,
  FreeTextEvaluation,
  McOption,
  McOptionClient,
  ModuleContent,
  ModuleContentClient,
  ModuleStatus,
  QuizAnswer,
  QuizQuestion,
  QuizQuestionClient,
  QuizSubmission,
  ResponseType,
  Scenario,
  ScenarioClient,
  ScenarioResponse,
  ScenarioSubmission,
  SessionStatus,
  TrainingModule,
  TrainingSession,
} from "./types.js";

// --- State machine ---
export type { ModuleEvent, SessionEvent } from "./state-machine.js";
export {
  StateTransitionError,
  canTransitionModule,
  canTransitionSession,
  isModuleTerminal,
  isSessionTerminal,
  transitionModule,
  transitionSession,
} from "./state-machine.js";

// --- Score calculator ---
export {
  computeAggregateScore,
  computeModuleScore,
  identifyWeakAreas,
  isPassing,
  scoreMcAnswer,
} from "./score-calculator.js";

// --- Repository ---
export { SessionRepository, VersionConflictError } from "./session-repository.js";

// --- Audit ---
export {
  logEvaluationCompleted,
  logModuleCompleted,
  logQuizSubmitted,
  logRemediationInitiated,
  logSessionAbandoned,
  logSessionExhausted,
  logSessionStarted,
} from "./audit.js";

// --- Curriculum generator ---
export { CurriculumGenerationError, generateCurriculum } from "./curriculum-generator.js";

// --- Module generator ---
export { ModuleGenerationError, generateModuleContent } from "./module-generator.js";

// --- Evaluator ---
export { EvaluationError, evaluateFreeText } from "./evaluator.js";

// --- Remediation planner ---
export { RemediationPlanError, generateRemediationCurriculum } from "./remediation-planner.js";
