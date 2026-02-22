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
 * Unified audit event types and schemas.
 * Constitution Principle II: deterministic, audit-friendly records.
 * Constitution Principle III: all events tenant-scoped.
 */

import { z } from "zod";

export const AuditEventTypeSchema = z.enum([
  // Auth events (existing)
  "sign-in",
  "sign-out",
  "auth-failure",
  "auth-config-error",
  // Training events (existing)
  "training-session-started",
  "training-module-completed",
  "training-quiz-submitted",
  "training-evaluation-completed",
  "training-remediation-initiated",
  "training-session-abandoned",
  "training-session-exhausted",
  // Evidence & integration events (new in 008)
  "evidence-exported",
  "integration-push-success",
  "integration-push-failure",
]);

export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventInputSchema = z.object({
  eventType: AuditEventTypeSchema,
  employeeId: z.string().nullable(),
  timestamp: z.string().datetime(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuditEventInput = z.infer<typeof AuditEventInputSchema>;

export const EvidenceExportedMetadataSchema = z.object({
  sessionId: z.string(),
  format: z.literal("pdf"),
  evidenceId: z.string(),
});

export const IntegrationPushSuccessMetadataSchema = z.object({
  sessionId: z.string(),
  provider: z.string(),
  uploadId: z.string(),
  evidenceId: z.string(),
});

export const IntegrationPushFailureMetadataSchema = z.object({
  sessionId: z.string(),
  provider: z.string(),
  error: z.string(),
  evidenceId: z.string(),
});
