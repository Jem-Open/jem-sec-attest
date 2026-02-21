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
 * Zod schemas for compliance integration configuration and upload records.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Compliance upload status
// ---------------------------------------------------------------------------

export const ComplianceUploadStatusSchema = z.enum(["pending", "succeeded", "failed"]);

// ---------------------------------------------------------------------------
// Compliance upload record (persisted in storage)
// ---------------------------------------------------------------------------

export const ComplianceUploadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  evidenceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  provider: z.string().min(1),
  status: ComplianceUploadStatusSchema,
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(10),
  providerReferenceId: z.string().nullable(),
  lastError: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  retryable: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export const RetryConfigSchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10).optional().default(5),
    initialDelayMs: z.number().int().min(1000).max(60000).optional().default(5000),
    maxDelayMs: z.number().int().min(5000).max(600000).optional().default(300000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Compliance integration configuration (from tenant YAML)
// ---------------------------------------------------------------------------

export const ComplianceConfigSchema = z
  .object({
    provider: z.enum(["sprinto"]),
    apiKeyRef: z.string().min(1, "API key reference is required"),
    workflowCheckId: z.string().uuid("workflowCheckId must be a valid UUID"),
    region: z.enum(["us", "eu", "india"]),
    retry: RetryConfigSchema.optional().default({
      maxAttempts: 5,
      initialDelayMs: 5000,
      maxDelayMs: 300000,
    }),
  })
  .strict();

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type ComplianceUploadStatus = z.infer<typeof ComplianceUploadStatusSchema>;
export type ComplianceUpload = z.infer<typeof ComplianceUploadSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type ComplianceConfig = z.infer<typeof ComplianceConfigSchema>;
