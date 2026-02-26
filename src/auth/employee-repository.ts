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
 * Employee storage operations for JIT provisioning.
 * FR-014: Creates employee on first sign-in, updates on subsequent.
 */

import type { StorageAdapter } from "../storage/adapter";
import type { Employee } from "./types";

const COLLECTION = "employees";

export interface EmployeeClaims {
  sub: string;
  email: string;
  name: string;
}

export class EmployeeRepository {
  constructor(private readonly storage: StorageAdapter) {}

  async upsertFromClaims(tenantId: string, claims: EmployeeClaims): Promise<Employee> {
    // Wrap in a transaction so the check-then-write is atomic. SQLite serializes
    // writers, preventing a TOCTOU race where two concurrent first sign-ins for
    // the same idpSubject both pass the !existing check and create duplicates.
    return this.storage.transaction(tenantId, async () => {
      const existing = await this.findByIdpSubject(tenantId, claims.sub);

      if (existing) {
        const updated = await this.storage.update(tenantId, COLLECTION, existing.id, {
          email: claims.email,
          displayName: claims.name,
          lastSignInAt: new Date().toISOString(),
        });
        return updated as Employee;
      }

      const now = new Date().toISOString();
      const created = await this.storage.create(tenantId, COLLECTION, {
        tenantId,
        idpSubject: claims.sub,
        email: claims.email,
        displayName: claims.name,
        firstSignInAt: now,
        lastSignInAt: now,
      });
      return created as unknown as Employee;
    });
  }

  async findByIdpSubject(tenantId: string, idpSubject: string): Promise<Employee | null> {
    const results = await this.storage.findMany(tenantId, COLLECTION, {
      where: { idpSubject },
    });
    return (results[0] as Employee | undefined) ?? null;
  }
}
