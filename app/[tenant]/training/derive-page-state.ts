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
 * Pure helper: derives the training page UI state from session + module data.
 * Extracted from page.tsx so it can be exported without violating Next.js's
 * restriction on arbitrary named exports from page files.
 */

export type PageState =
  | "loading-session"
  | "no-profile"
  | "start"
  | "curriculum"
  | "module-learning"
  | "module-scenario"
  | "module-quiz"
  | "evaluating"
  | "result"
  | "failed-review"
  | "history"
  | "error";

export type SessionStatus =
  | "curriculum-generating"
  | "in-progress"
  | "evaluating"
  | "passed"
  | "failed"
  | "in-remediation"
  | "exhausted"
  | "abandoned";

export type ModuleStatus =
  | "locked"
  | "content-generating"
  | "learning"
  | "scenario-active"
  | "quiz-active"
  | "scored";

export interface TrainingSessionResponse {
  id: string;
  status: SessionStatus;
  attemptNumber: number;
  aggregateScore: number | null;
  curriculum: { modules: Array<{ title: string; topicArea: string }> };
  createdAt?: string;
}

export interface ModuleSummary {
  id: string;
  moduleIndex: number;
  title: string;
  topicArea: string;
  status: ModuleStatus;
  content: unknown;
  scenarioResponses: Array<{ scenarioId: string; score: number; llmRationale?: string }>;
  quizAnswers: Array<{ questionId: string; score: number }>;
  moduleScore: number | null;
}

export function derivePageState(
  session: TrainingSessionResponse | null,
  modules: ModuleSummary[],
): PageState {
  if (session === null) return "start";

  const { status } = session;

  if (status === "evaluating") return "evaluating";
  if (status === "failed") return "failed-review";
  if (status === "passed" || status === "exhausted" || status === "abandoned") return "result";

  // in-progress (or curriculum-generating treated as in-progress for UI)
  const learning = modules.find((m) => m.status === "learning");
  if (learning) return "module-learning";

  const scenarioActive = modules.find((m) => m.status === "scenario-active");
  if (scenarioActive) return "module-scenario";

  const quizActive = modules.find((m) => m.status === "quiz-active");
  if (quizActive) return "module-quiz";

  const contentGenerating = modules.find((m) => m.status === "content-generating");
  if (contentGenerating) return "module-learning";

  return "curriculum";
}
