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
 * Intake module public API.
 * Exports sanitizer, schemas, types, and model resolver.
 * Profile generator and repository are consumed by API routes directly.
 */

export { sanitizeJobText } from "./sanitizer.js";
export {
  RoleProfileExtractionSchema,
  RoleProfileSchema,
  IntakeSubmissionSchema,
  ProfileConfirmationSchema,
} from "./schemas.js";
export type {
  RoleProfileExtraction,
  RoleProfile,
  IntakeSubmission,
  ProfileConfirmation,
  ProfileGenerationResult,
  IntakeAuditMetadata,
} from "./types.js";
export { resolveModel } from "./ai-model-resolver.js";
