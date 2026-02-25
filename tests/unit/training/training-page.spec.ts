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
 * Unit tests for the training page helper logic.
 * T019: derivePageState maps session + modules → correct UI page state.
 * T020: STRINGS constant has all required keys for the training workflow.
 *
 * These tests exercise pure TypeScript logic without rendering the component
 * (no jsdom/React setup required).
 */

import { describe, expect, it } from "vitest";

// We import derivePageState directly — it is an exported pure function.
import { derivePageState } from "../../../app/[tenant]/training/derive-page-state";

// ---------------------------------------------------------------------------
// Type aliases matching the page's internal types (duplicated here for test
// isolation — avoids exposing internal types from the component module).
// ---------------------------------------------------------------------------

type SessionStatus =
  | "curriculum-generating"
  | "in-progress"
  | "evaluating"
  | "passed"
  | "failed"
  | "in-remediation"
  | "exhausted"
  | "abandoned";

type ModuleStatus =
  | "locked"
  | "content-generating"
  | "learning"
  | "scenario-active"
  | "quiz-active"
  | "scored";

interface MockSession {
  id: string;
  status: SessionStatus;
  attemptNumber: number;
  aggregateScore: number | null;
  curriculum: { modules: Array<{ title: string; topicArea: string }> };
}

interface MockModule {
  id: string;
  moduleIndex: number;
  title: string;
  topicArea: string;
  status: ModuleStatus;
  content: null;
  scenarioResponses: [];
  quizAnswers: [];
  moduleScore: number | null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    id: "sess-001",
    status: "in-progress",
    attemptNumber: 1,
    aggregateScore: null,
    curriculum: { modules: [{ title: "Module A", topicArea: "Security" }] },
    ...overrides,
  };
}

function makeModule(overrides: Partial<MockModule> = {}): MockModule {
  return {
    id: "mod-001",
    moduleIndex: 0,
    title: "Module A",
    topicArea: "Security",
    status: "locked",
    content: null,
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// derivePageState — T019 test cases
// ---------------------------------------------------------------------------

describe("derivePageState", () => {
  it("returns 'start' when session is null", () => {
    const result = derivePageState(null, [makeModule()]);
    expect(result).toBe("start");
  });

  it("returns 'curriculum' when all modules are locked", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ status: "locked", moduleIndex: 0 }),
      makeModule({ id: "mod-002", status: "locked", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("curriculum");
  });

  it("returns 'module-learning' when a module is in 'learning' state", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ status: "learning", moduleIndex: 0 }),
      makeModule({ id: "mod-002", status: "locked", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-learning");
  });

  it("returns 'module-scenario' when a module is in 'scenario-active' state", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ status: "scenario-active", moduleIndex: 0 }),
      makeModule({ id: "mod-002", status: "locked", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-scenario");
  });

  it("returns 'module-quiz' when a module is in 'quiz-active' state", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ status: "quiz-active", moduleIndex: 0 }),
      makeModule({ id: "mod-002", status: "locked", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-quiz");
  });

  it("returns 'module-learning' when a module is in 'content-generating' state", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ status: "content-generating", moduleIndex: 0 }),
      makeModule({ id: "mod-002", status: "locked", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-learning");
  });

  it("returns 'evaluating' when session status is 'evaluating'", () => {
    const session = makeSession({ status: "evaluating" });
    const modules = [makeModule({ status: "scored" })];
    const result = derivePageState(session, modules);
    expect(result).toBe("evaluating");
  });

  it("returns 'result' when session status is 'passed'", () => {
    const session = makeSession({ status: "passed", aggregateScore: 0.85 });
    const modules = [makeModule({ status: "scored", moduleScore: 0.85 })];
    const result = derivePageState(session, modules);
    expect(result).toBe("result");
  });

  it("returns 'failed-review' when session status is 'failed'", () => {
    const session = makeSession({ status: "failed", aggregateScore: 0.45 });
    const modules = [makeModule({ status: "scored", moduleScore: 0.45 })];
    const result = derivePageState(session, modules);
    expect(result).toBe("failed-review");
  });

  it("returns 'result' when session status is 'exhausted'", () => {
    const session = makeSession({ status: "exhausted", aggregateScore: 0.3 });
    const modules = [makeModule({ status: "scored", moduleScore: 0.3 })];
    const result = derivePageState(session, modules);
    expect(result).toBe("result");
  });

  it("returns 'result' when session status is 'abandoned'", () => {
    const session = makeSession({ status: "abandoned", aggregateScore: null });
    const modules = [makeModule({ status: "locked" })];
    const result = derivePageState(session, modules);
    expect(result).toBe("result");
  });

  it("prefers 'module-learning' over 'module-scenario' when both statuses present", () => {
    // Edge case: learning takes priority in the state derivation order
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ id: "mod-a", status: "learning", moduleIndex: 0 }),
      makeModule({ id: "mod-b", status: "scenario-active", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-learning");
  });

  it("returns 'curriculum' when only scored and locked modules exist", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ id: "mod-a", status: "scored", moduleIndex: 0 }),
      makeModule({ id: "mod-b", status: "locked", moduleIndex: 1 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("curriculum");
  });

  // T025/T026: content-generating module triggers module-learning (refresh survival)
  it("returns 'module-learning' for content-generating when preceded by scored modules", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ id: "mod-a", status: "scored", moduleIndex: 0, moduleScore: 0.9 }),
      makeModule({ id: "mod-b", status: "content-generating", moduleIndex: 1 }),
      makeModule({ id: "mod-c", status: "locked", moduleIndex: 2 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-learning");
  });

  it("returns 'module-scenario' for scenario-active when other modules are scored", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ id: "mod-a", status: "scored", moduleIndex: 0, moduleScore: 0.85 }),
      makeModule({ id: "mod-b", status: "scenario-active", moduleIndex: 1 }),
      makeModule({ id: "mod-c", status: "locked", moduleIndex: 2 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-scenario");
  });

  it("returns 'module-quiz' for quiz-active when other modules are scored", () => {
    const session = makeSession({ status: "in-progress" });
    const modules = [
      makeModule({ id: "mod-a", status: "scored", moduleIndex: 0, moduleScore: 0.85 }),
      makeModule({ id: "mod-b", status: "quiz-active", moduleIndex: 1 }),
      makeModule({ id: "mod-c", status: "locked", moduleIndex: 2 }),
    ];
    const result = derivePageState(session, modules);
    expect(result).toBe("module-quiz");
  });

  // T031: regression — derivePageState never returns 'history'; that state is
  // only set imperatively via handleViewHistory.
  it("never returns 'history' — history state is set imperatively, not derived", () => {
    const statuses: Array<
      | "curriculum-generating"
      | "in-progress"
      | "evaluating"
      | "passed"
      | "failed"
      | "in-remediation"
      | "exhausted"
      | "abandoned"
    > = [
      "curriculum-generating",
      "in-progress",
      "evaluating",
      "passed",
      "failed",
      "in-remediation",
      "exhausted",
      "abandoned",
    ];

    for (const status of statuses) {
      const session = makeSession({ status });
      const modules = [makeModule({ status: "locked" })];
      const derived = derivePageState(session, modules);
      expect(derived).not.toBe("history");
    }
  });
});
