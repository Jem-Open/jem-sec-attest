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

const DEFAULT_PASS_THRESHOLD = 0.7;

/**
 * Score a multiple-choice answer: 1.0 if correct, 0.0 if incorrect.
 */
export function scoreMcAnswer(selectedOption: string, correctOption: string): number {
  return selectedOption === correctOption ? 1.0 : 0.0;
}

/**
 * Compute the arithmetic mean of a non-empty array of numbers.
 * Returns null when the array is empty.
 */
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute module score as the mean of all scenario + quiz scores.
 * @param scenarioScores - Array of scenario scores (each 0.0-1.0)
 * @param quizScores - Array of quiz question scores (each 0.0-1.0)
 * @returns Module score (0.0-1.0), or null if no scores provided
 */
export function computeModuleScore(scenarioScores: number[], quizScores: number[]): number | null {
  return mean([...scenarioScores, ...quizScores]);
}

/**
 * Compute session aggregate score as the mean of all module scores.
 * @param moduleScores - Array of module scores (each 0.0-1.0)
 * @returns Aggregate score (0.0-1.0), or null if no scores provided
 */
export function computeAggregateScore(moduleScores: number[]): number | null {
  return mean(moduleScores);
}

/**
 * Determine pass/fail based on aggregate score and threshold.
 * @param aggregateScore - The computed aggregate score
 * @param passThreshold - The minimum score to pass (default 0.70)
 * @returns true if passed, false if failed
 */
export function isPassing(
  aggregateScore: number,
  passThreshold: number = DEFAULT_PASS_THRESHOLD,
): boolean {
  return aggregateScore >= passThreshold;
}

/**
 * Identify weak areas: modules whose scores are below the pass threshold.
 * @param modules - Array of { topicArea, moduleScore }
 * @param passThreshold - The threshold (default 0.70)
 * @returns Array of topicArea strings that are below threshold
 */
export function identifyWeakAreas(
  modules: Array<{ topicArea: string; moduleScore: number }>,
  passThreshold: number = DEFAULT_PASS_THRESHOLD,
): string[] {
  return modules.filter((m) => m.moduleScore < passThreshold).map((m) => m.topicArea);
}
