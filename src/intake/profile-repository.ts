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
 * Profile repository for role profile CRUD operations.
 * Uses StorageAdapter with collection "role_profiles".
 * One profile per employee per tenant, enforced via transactional upsert.
 */

import type { StorageAdapter } from "../storage/adapter.js";
import type { ProfileConfirmation, RoleProfile } from "./types.js";

const COLLECTION = "role_profiles";

export class ProfileRepository {
  constructor(private readonly storage: StorageAdapter) {}

  async findByEmployee(tenantId: string, employeeId: string): Promise<RoleProfile | null> {
    const results = await this.storage.findMany(tenantId, COLLECTION, {
      where: { employeeId },
    });
    return (results[0] as RoleProfile | undefined) ?? null;
  }

  async confirmProfile(
    tenantId: string,
    employeeId: string,
    confirmation: ProfileConfirmation,
    configHash: string,
    appVersion: string,
  ): Promise<RoleProfile> {
    return this.storage.transaction(tenantId, async () => {
      const existing = await this.findByEmployee(tenantId, employeeId);
      const now = new Date().toISOString();

      if (existing) {
        const updated = await this.storage.update(tenantId, COLLECTION, existing.id, {
          jobExpectations: confirmation.jobExpectations,
          version: existing.version + 1,
          configHash,
          appVersion,
          confirmedAt: now,
          updatedAt: now,
        });
        return updated as RoleProfile;
      }

      const created = await this.storage.create(tenantId, COLLECTION, {
        tenantId,
        employeeId,
        jobExpectations: confirmation.jobExpectations,
        status: "confirmed",
        confirmedAt: now,
        version: 1,
        configHash,
        appVersion,
        createdAt: now,
        updatedAt: now,
      });
      return created as unknown as RoleProfile;
    });
  }
}
