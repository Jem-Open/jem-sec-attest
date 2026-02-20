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

import {
  computeAggregateScore,
  computeModuleScore,
  identifyWeakAreas,
  isPassing,
  scoreMcAnswer,
} from "@/training/score-calculator.js";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// scoreMcAnswer
// ---------------------------------------------------------------------------
describe("scoreMcAnswer", () => {
  it("returns 1.0 when selected option matches correct option", () => {
    expect(scoreMcAnswer("A", "A")).toBe(1);
  });

  it("returns 0.0 when selected option does not match correct option", () => {
    expect(scoreMcAnswer("B", "A")).toBe(0);
  });

  it("is case-sensitive: lowercase does not match uppercase", () => {
    expect(scoreMcAnswer("a", "A")).toBe(0);
  });

  it("is case-sensitive: uppercase does not match lowercase", () => {
    expect(scoreMcAnswer("A", "a")).toBe(0);
  });

  it("returns 1.0 for matching multi-character option strings", () => {
    expect(scoreMcAnswer("option_1", "option_1")).toBe(1);
  });

  it("returns 0.0 for non-matching multi-character option strings", () => {
    expect(scoreMcAnswer("option_1", "option_2")).toBe(0);
  });

  it("returns 1.0 when both selected and correct are empty strings", () => {
    expect(scoreMcAnswer("", "")).toBe(1);
  });

  it("returns 0.0 when selected is empty and correct is non-empty", () => {
    expect(scoreMcAnswer("", "A")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeModuleScore
// ---------------------------------------------------------------------------
describe("computeModuleScore", () => {
  it("returns null when both scenario and quiz arrays are empty", () => {
    expect(computeModuleScore([], [])).toBeNull();
  });

  it("returns the single value when only one scenario score is provided", () => {
    expect(computeModuleScore([0.8], [])).toBe(0.8);
  });

  it("returns the single value when only one quiz score is provided", () => {
    expect(computeModuleScore([], [1])).toBe(1);
  });

  it("computes the mean of multiple scenario scores", () => {
    expect(computeModuleScore([0.5, 1], [])).toBeCloseTo(0.75, 10);
  });

  it("computes the mean of multiple quiz scores", () => {
    expect(computeModuleScore([], [1, 0, 1])).toBeCloseTo(2 / 3, 10);
  });

  it("computes the mean across mixed scenario and quiz scores", () => {
    // [0.6, 0.8] + [1.0, 0.0] = mean([0.6, 0.8, 1.0, 0.0]) = 2.4 / 4 = 0.6
    expect(computeModuleScore([0.6, 0.8], [1, 0])).toBeCloseTo(0.6, 10);
  });

  it("returns 0.0 when all scores are zero", () => {
    expect(computeModuleScore([0, 0], [0])).toBe(0);
  });

  it("returns 1.0 when all scores are one", () => {
    expect(computeModuleScore([1, 1], [1, 1])).toBe(1);
  });

  it("handles floating-point inputs without rounding errors", () => {
    // mean of [0.1, 0.2, 0.3] = 0.6 / 3 = 0.2
    expect(computeModuleScore([0.1, 0.2, 0.3], [])).toBeCloseTo(0.2, 10);
  });

  it("returns the single combined value when one scenario and one quiz are provided", () => {
    // mean of [0.4, 0.6] = 0.5
    expect(computeModuleScore([0.4], [0.6])).toBeCloseTo(0.5, 10);
  });
});

// ---------------------------------------------------------------------------
// computeAggregateScore
// ---------------------------------------------------------------------------
describe("computeAggregateScore", () => {
  it("returns null for an empty array", () => {
    expect(computeAggregateScore([])).toBeNull();
  });

  it("returns the single value when one module score is provided", () => {
    expect(computeAggregateScore([0.75])).toBe(0.75);
  });

  it("returns the mean of multiple module scores", () => {
    // mean([1.0, 0.5, 0.75]) = 2.25 / 3 = 0.75
    expect(computeAggregateScore([1, 0.5, 0.75])).toBeCloseTo(0.75, 10);
  });

  it("returns 0.0 when all module scores are zero", () => {
    expect(computeAggregateScore([0, 0, 0])).toBe(0);
  });

  it("returns 1.0 when all module scores are one", () => {
    expect(computeAggregateScore([1, 1, 1])).toBe(1);
  });

  it("correctly averages two extreme scores", () => {
    expect(computeAggregateScore([0, 1])).toBeCloseTo(0.5, 10);
  });

  it("handles many module scores", () => {
    const scores = [0.6, 0.7, 0.8, 0.9, 1];
    // sum = 4.0, mean = 0.8
    expect(computeAggregateScore(scores)).toBeCloseTo(0.8, 10);
  });
});

// ---------------------------------------------------------------------------
// isPassing
// ---------------------------------------------------------------------------
describe("isPassing", () => {
  it("returns true when aggregate score equals the default threshold (0.70)", () => {
    expect(isPassing(0.7)).toBe(true);
  });

  it("returns false when aggregate score is just below the default threshold", () => {
    expect(isPassing(0.699)).toBe(false);
  });

  it("returns true when aggregate score is well above the default threshold", () => {
    expect(isPassing(0.95)).toBe(true);
  });

  it("returns false for a score of 0.0", () => {
    expect(isPassing(0)).toBe(false);
  });

  it("returns true for a perfect score of 1.0", () => {
    expect(isPassing(1)).toBe(true);
  });

  it("returns true when aggregate score equals a custom threshold", () => {
    expect(isPassing(0.85, 0.85)).toBe(true);
  });

  it("returns false when aggregate score is just below a custom threshold", () => {
    expect(isPassing(0.849, 0.85)).toBe(false);
  });

  it("returns true when aggregate score exceeds a custom threshold", () => {
    expect(isPassing(0.9, 0.85)).toBe(true);
  });

  it("returns true for any score when threshold is 0.0", () => {
    expect(isPassing(0, 0)).toBe(true);
  });

  it("returns true only for score of 1.0 when threshold is 1.0", () => {
    expect(isPassing(1, 1)).toBe(true);
    expect(isPassing(0.999, 1)).toBe(false);
  });

  it("distinguishes 0.699 (fail) from 0.700 (pass) at default threshold", () => {
    expect(isPassing(0.699)).toBe(false);
    expect(isPassing(0.7)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// identifyWeakAreas
// ---------------------------------------------------------------------------
describe("identifyWeakAreas", () => {
  it("returns an empty array when input is empty", () => {
    expect(identifyWeakAreas([])).toEqual([]);
  });

  it("returns an empty array when all modules are at or above the default threshold", () => {
    const modules = [
      { topicArea: "Phishing", moduleScore: 0.8 },
      { topicArea: "Passwords", moduleScore: 0.7 },
    ];
    expect(identifyWeakAreas(modules)).toEqual([]);
  });

  it("returns all topicAreas when all modules are below the default threshold", () => {
    const modules = [
      { topicArea: "Phishing", moduleScore: 0.5 },
      { topicArea: "Malware", moduleScore: 0.3 },
    ];
    expect(identifyWeakAreas(modules)).toEqual(["Phishing", "Malware"]);
  });

  it("returns only the topicAreas for modules below the default threshold (mixed)", () => {
    const modules = [
      { topicArea: "Phishing", moduleScore: 0.8 },
      { topicArea: "Malware", moduleScore: 0.5 },
      { topicArea: "Social Engineering", moduleScore: 0.9 },
      { topicArea: "Ransomware", moduleScore: 0.65 },
    ];
    expect(identifyWeakAreas(modules)).toEqual(["Malware", "Ransomware"]);
  });

  it("does not include modules that score exactly at the threshold (not weak)", () => {
    const modules = [{ topicArea: "Phishing", moduleScore: 0.7 }];
    expect(identifyWeakAreas(modules)).toEqual([]);
  });

  it("includes modules that score just below the threshold", () => {
    const modules = [{ topicArea: "Phishing", moduleScore: 0.699 }];
    expect(identifyWeakAreas(modules)).toEqual(["Phishing"]);
  });

  it("respects a custom pass threshold", () => {
    const modules = [
      { topicArea: "Phishing", moduleScore: 0.75 },
      { topicArea: "Malware", moduleScore: 0.85 },
    ];
    // With threshold 0.80: Phishing (0.75) is weak, Malware (0.85) is not
    expect(identifyWeakAreas(modules, 0.8)).toEqual(["Phishing"]);
  });

  it("returns all modules as weak when threshold is 1.0 and scores are below 1.0", () => {
    const modules = [
      { topicArea: "Phishing", moduleScore: 0.99 },
      { topicArea: "Malware", moduleScore: 0.95 },
    ];
    expect(identifyWeakAreas(modules, 1)).toEqual(["Phishing", "Malware"]);
  });

  it("returns no weak areas when threshold is 0.0 (all scores pass)", () => {
    const modules = [
      { topicArea: "Phishing", moduleScore: 0 },
      { topicArea: "Malware", moduleScore: 0.5 },
    ];
    expect(identifyWeakAreas(modules, 0)).toEqual([]);
  });

  it("preserves the order of weak topicAreas as they appear in input", () => {
    const modules = [
      { topicArea: "C", moduleScore: 0.4 },
      { topicArea: "A", moduleScore: 0.9 },
      { topicArea: "B", moduleScore: 0.3 },
    ];
    expect(identifyWeakAreas(modules)).toEqual(["C", "B"]);
  });

  it("handles a single module that is passing", () => {
    expect(identifyWeakAreas([{ topicArea: "Phishing", moduleScore: 0.9 }])).toEqual([]);
  });

  it("handles a single module that is failing", () => {
    expect(identifyWeakAreas([{ topicArea: "Phishing", moduleScore: 0.5 }])).toEqual(["Phishing"]);
  });

  it("distinguishes 0.699 (weak) from 0.700 (not weak) at default threshold", () => {
    const modules = [
      { topicArea: "Weak", moduleScore: 0.699 },
      { topicArea: "OK", moduleScore: 0.7 },
    ];
    expect(identifyWeakAreas(modules)).toEqual(["Weak"]);
  });
});
