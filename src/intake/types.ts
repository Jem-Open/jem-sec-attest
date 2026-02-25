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
 * TypeScript types for the employee training intake module.
 * Re-exports Zod inferred types and defines additional domain types.
 */

export type {
  RoleProfileExtraction,
  RoleProfile,
  IntakeSubmission,
  ProfileConfirmation,
} from "./schemas";

export type ProfileGenerationResult =
  | {
      readonly success: true;
      readonly extraction: import("./schemas").RoleProfileExtraction;
    }
  | {
      readonly success: false;
      readonly error: string;
      readonly code: "ai_unavailable" | "extraction_failed";
    };

export interface IntakeAuditMetadata {
  readonly profileId: string;
  readonly version: number;
  readonly expectationCount?: number;
  readonly previousVersion?: number;
  readonly newVersion?: number;
}
