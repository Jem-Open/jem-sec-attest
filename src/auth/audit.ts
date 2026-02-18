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
 * Auth audit event logger.
 * FR-006: All auth lifecycle events recorded.
 * FR-007: No tokens, secrets, or raw error details in audit logs.
 * Uses Next.js after() API for async writes (zero TTFB impact).
 */

import type { StorageAdapter } from "../storage/adapter.js";
import type { AuthEventType } from "./types.js";

const COLLECTION = "audit_events";

export interface AuditEventInput {
  eventType: AuthEventType;
  tenantId: string | null;
  employeeId: string | null;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

export async function logAuthEvent(storage: StorageAdapter, input: AuditEventInput): Promise<void> {
  const tenantId = input.tenantId ?? "__system__";
  await storage.create(tenantId, COLLECTION, {
    eventType: input.eventType,
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    timestamp: new Date().toISOString(),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata ?? {},
  });
}

export function createSignInEvent(
  tenantId: string,
  employeeId: string,
  idpIssuer: string,
  request: Request,
): AuditEventInput {
  return {
    eventType: "sign-in",
    tenantId,
    employeeId,
    ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
    userAgent: request.headers.get("user-agent") ?? "unknown",
    metadata: { idpIssuer },
  };
}

export function createSignOutEvent(
  tenantId: string,
  employeeId: string,
  idpIssuer: string,
  request: Request,
): AuditEventInput {
  return {
    eventType: "sign-out",
    tenantId,
    employeeId,
    ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
    userAgent: request.headers.get("user-agent") ?? "unknown",
    metadata: { idpIssuer },
  };
}

export function createAuthFailureEvent(
  tenantId: string | null,
  reason: string,
  request: Request,
  idpIssuer?: string,
): AuditEventInput {
  return {
    eventType: "auth-failure",
    tenantId,
    employeeId: null,
    ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
    userAgent: request.headers.get("user-agent") ?? "unknown",
    metadata: { reason, ...(idpIssuer ? { idpIssuer } : {}) },
  };
}

export function createAuthConfigErrorEvent(
  tenantId: string,
  reason: string,
  request: Request,
): AuditEventInput {
  return {
    eventType: "auth-config-error",
    tenantId,
    employeeId: null,
    ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
    userAgent: request.headers.get("user-agent") ?? "unknown",
    metadata: { reason, tenantId },
  };
}
