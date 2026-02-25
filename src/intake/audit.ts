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
 * Audit logging for intake events.
 * MUST NOT include raw job text or job expectation text content — only counts.
 * Constitution Principle II: deterministic, audit-friendly records.
 */

import type { StorageAdapter } from "../storage/adapter";

const COLLECTION = "audit_events";

export async function logProfileConfirmed(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  profileId: string,
  version: number,
  expectationCount: number,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "role-profile-confirmed",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      profileId,
      version,
      expectationCount,
    },
  });
}

export async function logProfileUpdated(
  storage: StorageAdapter,
  tenantId: string,
  employeeId: string,
  profileId: string,
  previousVersion: number,
  newVersion: number,
): Promise<void> {
  await storage.create(tenantId, COLLECTION, {
    eventType: "role-profile-updated",
    tenantId,
    employeeId,
    timestamp: new Date().toISOString(),
    metadata: {
      profileId,
      previousVersion,
      newVersion,
    },
  });
}
