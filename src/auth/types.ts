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
 * Auth module entity types.
 */

export interface Employee {
  id: string;
  tenantId: string;
  idpSubject: string;
  email: string;
  displayName: string;
  firstSignInAt: string;
  lastSignInAt: string;
}

export interface EmployeeSession {
  sessionId: string;
  tenantId: string;
  employeeId: string;
  email: string;
  displayName: string;
  idpIssuer: string;
  createdAt: number;
  expiresAt: number;
}

export type AuthEventType = "sign-in" | "sign-out" | "auth-failure" | "auth-config-error";

export interface AuthAuditEvent {
  id: string;
  eventType: AuthEventType;
  tenantId: string | null;
  employeeId: string | null;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}
