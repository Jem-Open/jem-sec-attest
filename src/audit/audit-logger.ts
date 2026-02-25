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
 * Immutable audit event logger.
 * FR-009: Audit entries are immutable — no update or delete exposed.
 * Constitution Principle III: all events tenant-scoped.
 */

import type { StorageAdapter } from "../storage/adapter";
import { AuditEventInputSchema } from "./audit-types";
import type { AuditEventInput } from "./audit-types";

const COLLECTION = "audit_events";

export class AuditLogger {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  /**
   * Record an immutable audit event.
   * This is the ONLY write operation exposed — no update or delete.
   */
  async log(tenantId: string, event: AuditEventInput): Promise<void> {
    const parsed = AuditEventInputSchema.safeParse(event);
    if (!parsed.success) {
      console.error("Audit event validation failed:", parsed.error.message);
      return;
    }

    const effectiveTenantId = tenantId || "__system__";

    try {
      await this.storage.create(effectiveTenantId, COLLECTION, {
        eventType: parsed.data.eventType,
        tenantId: effectiveTenantId,
        employeeId: parsed.data.employeeId,
        timestamp: parsed.data.timestamp,
        ipAddress: parsed.data.ipAddress ?? null,
        userAgent: parsed.data.userAgent ?? null,
        metadata: parsed.data.metadata,
      });
    } catch (error) {
      console.error(`Audit logging failed (${parsed.data.eventType}):`, error);
    }
  }
}
