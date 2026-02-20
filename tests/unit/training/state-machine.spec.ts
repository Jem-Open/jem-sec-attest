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
  StateTransitionError,
  canTransitionModule,
  canTransitionSession,
  isModuleTerminal,
  isSessionTerminal,
  transitionModule,
  transitionSession,
} from "@/training/state-machine.js";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Session state machine
// ---------------------------------------------------------------------------

describe("transitionSession – valid transitions", () => {
  it("curriculum-generated: curriculum-generating → in-progress", () => {
    expect(transitionSession("curriculum-generating", "curriculum-generated")).toBe("in-progress");
  });

  it("all-modules-scored: in-progress → evaluating", () => {
    expect(transitionSession("in-progress", "all-modules-scored")).toBe("evaluating");
  });

  it("evaluation-passed: evaluating → passed", () => {
    expect(transitionSession("evaluating", "evaluation-passed")).toBe("passed");
  });

  it("evaluation-failed: evaluating → failed", () => {
    expect(transitionSession("evaluating", "evaluation-failed")).toBe("failed");
  });

  it("evaluation-exhausted: evaluating → exhausted", () => {
    expect(transitionSession("evaluating", "evaluation-exhausted")).toBe("exhausted");
  });

  it("remediation-started: failed → in-remediation", () => {
    expect(transitionSession("failed", "remediation-started")).toBe("in-remediation");
  });

  it("remediation-modules-ready: in-remediation → in-progress", () => {
    expect(transitionSession("in-remediation", "remediation-modules-ready")).toBe("in-progress");
  });

  it("session-abandoned: in-progress → abandoned", () => {
    expect(transitionSession("in-progress", "session-abandoned")).toBe("abandoned");
  });

  it("session-abandoned: in-remediation → abandoned", () => {
    expect(transitionSession("in-remediation", "session-abandoned")).toBe("abandoned");
  });
});

describe("transitionSession – invalid transitions throw StateTransitionError", () => {
  // From curriculum-generating: only curriculum-generated is valid
  it("throws when applying all-modules-scored in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "all-modules-scored")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-passed in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "evaluation-passed")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-failed in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "evaluation-failed")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-exhausted in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "evaluation-exhausted")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-started in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "remediation-started")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-modules-ready in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "remediation-modules-ready")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying session-abandoned in curriculum-generating", () => {
    expect(() => transitionSession("curriculum-generating", "session-abandoned")).toThrow(
      StateTransitionError,
    );
  });

  // From in-progress: only all-modules-scored and session-abandoned are valid
  it("throws when applying curriculum-generated in in-progress", () => {
    expect(() => transitionSession("in-progress", "curriculum-generated")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-passed in in-progress", () => {
    expect(() => transitionSession("in-progress", "evaluation-passed")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-failed in in-progress", () => {
    expect(() => transitionSession("in-progress", "evaluation-failed")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-exhausted in in-progress", () => {
    expect(() => transitionSession("in-progress", "evaluation-exhausted")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-started in in-progress", () => {
    expect(() => transitionSession("in-progress", "remediation-started")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-modules-ready in in-progress", () => {
    expect(() => transitionSession("in-progress", "remediation-modules-ready")).toThrow(
      StateTransitionError,
    );
  });

  // From evaluating: only evaluation-passed, evaluation-failed, evaluation-exhausted are valid
  it("throws when applying curriculum-generated in evaluating", () => {
    expect(() => transitionSession("evaluating", "curriculum-generated")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying all-modules-scored in evaluating", () => {
    expect(() => transitionSession("evaluating", "all-modules-scored")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-started in evaluating", () => {
    expect(() => transitionSession("evaluating", "remediation-started")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-modules-ready in evaluating", () => {
    expect(() => transitionSession("evaluating", "remediation-modules-ready")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying session-abandoned in evaluating", () => {
    expect(() => transitionSession("evaluating", "session-abandoned")).toThrow(
      StateTransitionError,
    );
  });

  // From failed: only remediation-started is valid
  it("throws when applying curriculum-generated in failed", () => {
    expect(() => transitionSession("failed", "curriculum-generated")).toThrow(StateTransitionError);
  });
  it("throws when applying all-modules-scored in failed", () => {
    expect(() => transitionSession("failed", "all-modules-scored")).toThrow(StateTransitionError);
  });
  it("throws when applying evaluation-passed in failed", () => {
    expect(() => transitionSession("failed", "evaluation-passed")).toThrow(StateTransitionError);
  });
  it("throws when applying evaluation-failed in failed", () => {
    expect(() => transitionSession("failed", "evaluation-failed")).toThrow(StateTransitionError);
  });
  it("throws when applying evaluation-exhausted in failed", () => {
    expect(() => transitionSession("failed", "evaluation-exhausted")).toThrow(StateTransitionError);
  });
  it("throws when applying remediation-modules-ready in failed", () => {
    expect(() => transitionSession("failed", "remediation-modules-ready")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying session-abandoned in failed", () => {
    expect(() => transitionSession("failed", "session-abandoned")).toThrow(StateTransitionError);
  });

  // From in-remediation: only remediation-modules-ready and session-abandoned are valid
  it("throws when applying curriculum-generated in in-remediation", () => {
    expect(() => transitionSession("in-remediation", "curriculum-generated")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying all-modules-scored in in-remediation", () => {
    expect(() => transitionSession("in-remediation", "all-modules-scored")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-passed in in-remediation", () => {
    expect(() => transitionSession("in-remediation", "evaluation-passed")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-failed in in-remediation", () => {
    expect(() => transitionSession("in-remediation", "evaluation-failed")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying evaluation-exhausted in in-remediation", () => {
    expect(() => transitionSession("in-remediation", "evaluation-exhausted")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying remediation-started in in-remediation", () => {
    expect(() => transitionSession("in-remediation", "remediation-started")).toThrow(
      StateTransitionError,
    );
  });

  // Terminal states: passed, exhausted, abandoned — no events are valid
  it("throws for any event in passed", () => {
    expect(() => transitionSession("passed", "curriculum-generated")).toThrow(StateTransitionError);
    expect(() => transitionSession("passed", "all-modules-scored")).toThrow(StateTransitionError);
    expect(() => transitionSession("passed", "evaluation-passed")).toThrow(StateTransitionError);
    expect(() => transitionSession("passed", "session-abandoned")).toThrow(StateTransitionError);
  });

  it("throws for any event in exhausted", () => {
    expect(() => transitionSession("exhausted", "curriculum-generated")).toThrow(
      StateTransitionError,
    );
    expect(() => transitionSession("exhausted", "evaluation-exhausted")).toThrow(
      StateTransitionError,
    );
    expect(() => transitionSession("exhausted", "session-abandoned")).toThrow(StateTransitionError);
  });

  it("throws for any event in abandoned", () => {
    expect(() => transitionSession("abandoned", "curriculum-generated")).toThrow(
      StateTransitionError,
    );
    expect(() => transitionSession("abandoned", "session-abandoned")).toThrow(StateTransitionError);
  });
});

describe("transitionSession – error message content", () => {
  it("error message includes the current state and event", () => {
    let caught: unknown;
    try {
      transitionSession("passed", "curriculum-generated");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StateTransitionError);
    const err = caught as StateTransitionError;
    expect(err.message).toContain("passed");
    expect(err.message).toContain("curriculum-generated");
    expect(err.name).toBe("StateTransitionError");
    expect(err.currentState).toBe("passed");
    expect(err.event).toBe("curriculum-generated");
  });
});

// ---------------------------------------------------------------------------
// Module state machine
// ---------------------------------------------------------------------------

describe("transitionModule – valid transitions", () => {
  it("generate-content: locked → content-generating", () => {
    expect(transitionModule("locked", "generate-content")).toBe("content-generating");
  });

  it("content-ready: content-generating → learning", () => {
    expect(transitionModule("content-generating", "content-ready")).toBe("learning");
  });

  it("start-scenario: learning → scenario-active", () => {
    expect(transitionModule("learning", "start-scenario")).toBe("scenario-active");
  });

  it("scenarios-complete: scenario-active → quiz-active", () => {
    expect(transitionModule("scenario-active", "scenarios-complete")).toBe("quiz-active");
  });

  it("quiz-scored: quiz-active → scored", () => {
    expect(transitionModule("quiz-active", "quiz-scored")).toBe("scored");
  });
});

describe("transitionModule – invalid transitions throw StateTransitionError", () => {
  // From locked: only generate-content is valid
  it("throws when applying content-ready in locked", () => {
    expect(() => transitionModule("locked", "content-ready")).toThrow(StateTransitionError);
  });
  it("throws when applying start-scenario in locked", () => {
    expect(() => transitionModule("locked", "start-scenario")).toThrow(StateTransitionError);
  });
  it("throws when applying scenarios-complete in locked", () => {
    expect(() => transitionModule("locked", "scenarios-complete")).toThrow(StateTransitionError);
  });
  it("throws when applying quiz-scored in locked", () => {
    expect(() => transitionModule("locked", "quiz-scored")).toThrow(StateTransitionError);
  });

  // From content-generating: only content-ready is valid
  it("throws when applying generate-content in content-generating", () => {
    expect(() => transitionModule("content-generating", "generate-content")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying start-scenario in content-generating", () => {
    expect(() => transitionModule("content-generating", "start-scenario")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying scenarios-complete in content-generating", () => {
    expect(() => transitionModule("content-generating", "scenarios-complete")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying quiz-scored in content-generating", () => {
    expect(() => transitionModule("content-generating", "quiz-scored")).toThrow(
      StateTransitionError,
    );
  });

  // From learning: only start-scenario is valid
  it("throws when applying generate-content in learning", () => {
    expect(() => transitionModule("learning", "generate-content")).toThrow(StateTransitionError);
  });
  it("throws when applying content-ready in learning", () => {
    expect(() => transitionModule("learning", "content-ready")).toThrow(StateTransitionError);
  });
  it("throws when applying scenarios-complete in learning", () => {
    expect(() => transitionModule("learning", "scenarios-complete")).toThrow(StateTransitionError);
  });
  it("throws when applying quiz-scored in learning", () => {
    expect(() => transitionModule("learning", "quiz-scored")).toThrow(StateTransitionError);
  });

  // From scenario-active: only scenarios-complete is valid
  it("throws when applying generate-content in scenario-active", () => {
    expect(() => transitionModule("scenario-active", "generate-content")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying content-ready in scenario-active", () => {
    expect(() => transitionModule("scenario-active", "content-ready")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying start-scenario in scenario-active", () => {
    expect(() => transitionModule("scenario-active", "start-scenario")).toThrow(
      StateTransitionError,
    );
  });
  it("throws when applying quiz-scored in scenario-active", () => {
    expect(() => transitionModule("scenario-active", "quiz-scored")).toThrow(StateTransitionError);
  });

  // From quiz-active: only quiz-scored is valid
  it("throws when applying generate-content in quiz-active", () => {
    expect(() => transitionModule("quiz-active", "generate-content")).toThrow(StateTransitionError);
  });
  it("throws when applying content-ready in quiz-active", () => {
    expect(() => transitionModule("quiz-active", "content-ready")).toThrow(StateTransitionError);
  });
  it("throws when applying start-scenario in quiz-active", () => {
    expect(() => transitionModule("quiz-active", "start-scenario")).toThrow(StateTransitionError);
  });
  it("throws when applying scenarios-complete in quiz-active", () => {
    expect(() => transitionModule("quiz-active", "scenarios-complete")).toThrow(
      StateTransitionError,
    );
  });

  // Terminal state: scored — no events are valid
  it("throws for any event in scored", () => {
    expect(() => transitionModule("scored", "generate-content")).toThrow(StateTransitionError);
    expect(() => transitionModule("scored", "content-ready")).toThrow(StateTransitionError);
    expect(() => transitionModule("scored", "start-scenario")).toThrow(StateTransitionError);
    expect(() => transitionModule("scored", "scenarios-complete")).toThrow(StateTransitionError);
    expect(() => transitionModule("scored", "quiz-scored")).toThrow(StateTransitionError);
  });
});

describe("transitionModule – error message content", () => {
  it("error message includes the current state and event", () => {
    let caught: unknown;
    try {
      transitionModule("scored", "quiz-scored");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(StateTransitionError);
    const err = caught as StateTransitionError;
    expect(err.message).toContain("scored");
    expect(err.message).toContain("quiz-scored");
    expect(err.name).toBe("StateTransitionError");
    expect(err.currentState).toBe("scored");
    expect(err.event).toBe("quiz-scored");
  });
});

// ---------------------------------------------------------------------------
// canTransitionSession
// ---------------------------------------------------------------------------

describe("canTransitionSession", () => {
  it("returns true for all valid session transitions", () => {
    expect(canTransitionSession("curriculum-generating", "curriculum-generated")).toBe(true);
    expect(canTransitionSession("in-progress", "all-modules-scored")).toBe(true);
    expect(canTransitionSession("in-progress", "session-abandoned")).toBe(true);
    expect(canTransitionSession("evaluating", "evaluation-passed")).toBe(true);
    expect(canTransitionSession("evaluating", "evaluation-failed")).toBe(true);
    expect(canTransitionSession("evaluating", "evaluation-exhausted")).toBe(true);
    expect(canTransitionSession("failed", "remediation-started")).toBe(true);
    expect(canTransitionSession("in-remediation", "remediation-modules-ready")).toBe(true);
    expect(canTransitionSession("in-remediation", "session-abandoned")).toBe(true);
  });

  it("returns false for invalid session transitions", () => {
    expect(canTransitionSession("curriculum-generating", "all-modules-scored")).toBe(false);
    expect(canTransitionSession("in-progress", "evaluation-passed")).toBe(false);
    expect(canTransitionSession("evaluating", "session-abandoned")).toBe(false);
    expect(canTransitionSession("passed", "curriculum-generated")).toBe(false);
    expect(canTransitionSession("exhausted", "evaluation-exhausted")).toBe(false);
    expect(canTransitionSession("abandoned", "session-abandoned")).toBe(false);
    expect(canTransitionSession("failed", "session-abandoned")).toBe(false);
  });

  it("returns false for all events from terminal states", () => {
    const terminalStates = ["passed", "exhausted", "abandoned"] as const;
    const events = [
      "curriculum-generated",
      "all-modules-scored",
      "evaluation-passed",
      "evaluation-failed",
      "evaluation-exhausted",
      "remediation-started",
      "remediation-modules-ready",
      "session-abandoned",
    ] as const;
    for (const state of terminalStates) {
      for (const event of events) {
        expect(canTransitionSession(state, event)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// canTransitionModule
// ---------------------------------------------------------------------------

describe("canTransitionModule", () => {
  it("returns true for all valid module transitions", () => {
    expect(canTransitionModule("locked", "generate-content")).toBe(true);
    expect(canTransitionModule("content-generating", "content-ready")).toBe(true);
    expect(canTransitionModule("learning", "start-scenario")).toBe(true);
    expect(canTransitionModule("scenario-active", "scenarios-complete")).toBe(true);
    expect(canTransitionModule("quiz-active", "quiz-scored")).toBe(true);
  });

  it("returns false for invalid module transitions", () => {
    expect(canTransitionModule("locked", "content-ready")).toBe(false);
    expect(canTransitionModule("content-generating", "generate-content")).toBe(false);
    expect(canTransitionModule("learning", "quiz-scored")).toBe(false);
    expect(canTransitionModule("scenario-active", "start-scenario")).toBe(false);
    expect(canTransitionModule("quiz-active", "scenarios-complete")).toBe(false);
  });

  it("returns false for all events from terminal state scored", () => {
    const events = [
      "generate-content",
      "content-ready",
      "start-scenario",
      "scenarios-complete",
      "quiz-scored",
    ] as const;
    for (const event of events) {
      expect(canTransitionModule("scored", event)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// isSessionTerminal
// ---------------------------------------------------------------------------

describe("isSessionTerminal", () => {
  it("returns true for passed", () => {
    expect(isSessionTerminal("passed")).toBe(true);
  });

  it("returns true for exhausted", () => {
    expect(isSessionTerminal("exhausted")).toBe(true);
  });

  it("returns true for abandoned", () => {
    expect(isSessionTerminal("abandoned")).toBe(true);
  });

  it("returns false for curriculum-generating", () => {
    expect(isSessionTerminal("curriculum-generating")).toBe(false);
  });

  it("returns false for in-progress", () => {
    expect(isSessionTerminal("in-progress")).toBe(false);
  });

  it("returns false for evaluating", () => {
    expect(isSessionTerminal("evaluating")).toBe(false);
  });

  it("returns false for failed", () => {
    expect(isSessionTerminal("failed")).toBe(false);
  });

  it("returns false for in-remediation", () => {
    expect(isSessionTerminal("in-remediation")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isModuleTerminal
// ---------------------------------------------------------------------------

describe("isModuleTerminal", () => {
  it("returns true for scored", () => {
    expect(isModuleTerminal("scored")).toBe(true);
  });

  it("returns false for locked", () => {
    expect(isModuleTerminal("locked")).toBe(false);
  });

  it("returns false for content-generating", () => {
    expect(isModuleTerminal("content-generating")).toBe(false);
  });

  it("returns false for learning", () => {
    expect(isModuleTerminal("learning")).toBe(false);
  });

  it("returns false for scenario-active", () => {
    expect(isModuleTerminal("scenario-active")).toBe(false);
  });

  it("returns false for quiz-active", () => {
    expect(isModuleTerminal("quiz-active")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StateTransitionError shape
// ---------------------------------------------------------------------------

describe("StateTransitionError", () => {
  it("is an instance of Error", () => {
    const err = new StateTransitionError("in-progress", "curriculum-generated");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name StateTransitionError", () => {
    const err = new StateTransitionError("in-progress", "curriculum-generated");
    expect(err.name).toBe("StateTransitionError");
  });

  it("exposes currentState and event as public properties", () => {
    const err = new StateTransitionError("evaluating", "remediation-started");
    expect(err.currentState).toBe("evaluating");
    expect(err.event).toBe("remediation-started");
  });

  it("message mentions the state and the event", () => {
    const err = new StateTransitionError("evaluating", "remediation-started");
    expect(err.message).toContain("evaluating");
    expect(err.message).toContain("remediation-started");
  });
});
