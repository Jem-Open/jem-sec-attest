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
 * Zod schemas for the employee training intake module.
 * Defines validation for AI extraction output, persisted profiles, and API input/confirmation.
 */

import { z } from "zod";

export const RoleProfileExtractionSchema = z.object({
  jobExpectations: z
    .array(z.string().min(10).max(500))
    .min(1)
    .max(15)
    .describe("Key job responsibilities and duties extracted from the job description"),
});

export const RoleProfileSchema = RoleProfileExtractionSchema.extend({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  employeeId: z.string().min(1),
  status: z.literal("confirmed"),
  confirmedAt: z.string().datetime(),
  version: z.number().int().positive(),
  configHash: z.string().min(1),
  appVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const IntakeSubmissionSchema = z.object({
  jobText: z.string().min(50).max(10_000),
});

export const ProfileConfirmationSchema = z.object({
  jobExpectations: z.array(z.string().min(10).max(500)).min(1).max(15),
});

export type RoleProfileExtraction = z.infer<typeof RoleProfileExtractionSchema>;
export type RoleProfile = z.infer<typeof RoleProfileSchema>;
export type IntakeSubmission = z.infer<typeof IntakeSubmissionSchema>;
export type ProfileConfirmation = z.infer<typeof ProfileConfirmationSchema>;
