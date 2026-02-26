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
 * Auth module public API.
 * Re-exports all auth-related types and implementations.
 */

export { OIDCAdapter } from "./adapters/oidc-adapter";
export type {
  AuthAdapter,
  AuthFailure,
  AuthRedirect,
  AuthResult,
  AuthSuccess,
  EmployeeClaims,
} from "./adapters/auth-adapter";
export { EmployeeRepository } from "./employee-repository";
export type { EmployeeClaims as EmployeeRepoClaimsInput } from "./employee-repository";
export { createSession, destroySession, getSession } from "./session/session-manager";
export type { SessionData } from "./session/session-manager";
export { AuditLogger } from "../audit/audit-logger";
export {
  createAuthConfigErrorEvent,
  createAuthFailureEvent,
  createSignInEvent,
  createSignOutEvent,
  logAuthEvent,
} from "./audit";
export type { AuditEventInput } from "./audit";
export type {
  AuthAuditEvent,
  AuthEventType,
  Employee,
  EmployeeSession,
} from "./types";
