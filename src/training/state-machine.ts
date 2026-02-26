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

import type { ModuleStatus, SessionStatus } from "./types";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type SessionEvent =
  | "curriculum-generated"
  | "all-modules-scored"
  | "evaluation-passed"
  | "evaluation-failed"
  | "evaluation-exhausted"
  | "remediation-started"
  | "remediation-modules-ready"
  | "session-abandoned";

export type ModuleEvent =
  | "generate-content"
  | "content-ready"
  | "start-scenario"
  | "scenarios-complete"
  | "quiz-scored";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class StateTransitionError extends Error {
  constructor(
    public readonly currentState: string,
    public readonly event: string,
  ) {
    super(`Invalid transition: cannot apply event '${event}' in state '${currentState}'`);
    this.name = "StateTransitionError";
  }
}

// ---------------------------------------------------------------------------
// Session transition table
// ---------------------------------------------------------------------------

/**
 * Maps (currentState, event) → nextState for all valid session transitions.
 * The outer key is the current SessionStatus; the inner key is the SessionEvent.
 */
const SESSION_TRANSITIONS: Partial<
  Record<SessionStatus, Partial<Record<SessionEvent, SessionStatus>>>
> = {
  "curriculum-generating": {
    "curriculum-generated": "in-progress",
  },
  "in-progress": {
    "all-modules-scored": "evaluating",
    "session-abandoned": "abandoned",
  },
  evaluating: {
    "evaluation-passed": "passed",
    "evaluation-failed": "failed",
    "evaluation-exhausted": "exhausted",
  },
  failed: {
    "remediation-started": "in-remediation",
  },
  "in-remediation": {
    "remediation-modules-ready": "in-progress",
    "session-abandoned": "abandoned",
  },
  // Terminal states: passed, exhausted, abandoned — no outgoing transitions.
};

// ---------------------------------------------------------------------------
// Module transition table
// ---------------------------------------------------------------------------

/**
 * Maps (currentStatus, event) → nextStatus for all valid module transitions.
 */
const MODULE_TRANSITIONS: Partial<
  Record<ModuleStatus, Partial<Record<ModuleEvent, ModuleStatus>>>
> = {
  locked: {
    "generate-content": "content-generating",
  },
  "content-generating": {
    "content-ready": "learning",
  },
  learning: {
    "start-scenario": "scenario-active",
  },
  "scenario-active": {
    "scenarios-complete": "quiz-active",
  },
  "quiz-active": {
    "quiz-scored": "scored",
  },
  // Terminal state: scored — no outgoing transitions.
};

// ---------------------------------------------------------------------------
// Pure transition functions
// ---------------------------------------------------------------------------

/**
 * Returns the next SessionStatus for the given event, or throws
 * StateTransitionError when the transition is not defined.
 */
export function transitionSession(
  currentStatus: SessionStatus,
  event: SessionEvent,
): SessionStatus {
  const next = SESSION_TRANSITIONS[currentStatus]?.[event];
  if (next === undefined) {
    throw new StateTransitionError(currentStatus, event);
  }
  return next;
}

/**
 * Returns the next ModuleStatus for the given event, or throws
 * StateTransitionError when the transition is not defined.
 */
export function transitionModule(currentStatus: ModuleStatus, event: ModuleEvent): ModuleStatus {
  const next = MODULE_TRANSITIONS[currentStatus]?.[event];
  if (next === undefined) {
    throw new StateTransitionError(currentStatus, event);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the (currentStatus, event) pair is a valid session
 * transition; false otherwise. Never throws.
 */
export function canTransitionSession(currentStatus: SessionStatus, event: SessionEvent): boolean {
  return SESSION_TRANSITIONS[currentStatus]?.[event] !== undefined;
}

/**
 * Returns true when the (currentStatus, event) pair is a valid module
 * transition; false otherwise. Never throws.
 */
export function canTransitionModule(currentStatus: ModuleStatus, event: ModuleEvent): boolean {
  return MODULE_TRANSITIONS[currentStatus]?.[event] !== undefined;
}

// ---------------------------------------------------------------------------
// Terminal state checkers
// ---------------------------------------------------------------------------

/** The set of SessionStatus values that are terminal (no further transitions). */
const SESSION_TERMINAL_STATES = new Set<SessionStatus>(["passed", "exhausted", "abandoned"]);

/**
 * Returns true when the session is in a terminal state (passed, exhausted,
 * or abandoned) and can no longer accept events.
 */
export function isSessionTerminal(status: SessionStatus): boolean {
  return SESSION_TERMINAL_STATES.has(status);
}

/** The set of ModuleStatus values that are terminal (no further transitions). */
const MODULE_TERMINAL_STATES = new Set<ModuleStatus>(["scored"]);

/**
 * Returns true when the module is in a terminal state (scored) and can no
 * longer accept events.
 */
export function isModuleTerminal(status: ModuleStatus): boolean {
  return MODULE_TERMINAL_STATES.has(status);
}
