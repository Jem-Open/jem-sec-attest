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
 * EvidenceRepository — immutable storage for training evidence records.
 * No update or delete methods: evidence is append-only by design.
 */

import type { StorageAdapter } from "../storage/adapter";
import type { TrainingEvidence } from "./schemas";

const EVIDENCE_COLLECTION = "evidence";

export interface EvidenceListFilters {
  employeeId?: string;
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  outcome?: string; // "passed" | "exhausted" | "abandoned"
  limit?: number;
  offset?: number;
}

export class EvidenceRepository {
  constructor(private readonly storage: StorageAdapter) {}

  async create(tenantId: string, data: Omit<TrainingEvidence, "id">): Promise<TrainingEvidence> {
    return this.storage.create<Omit<TrainingEvidence, "id">>(
      tenantId,
      EVIDENCE_COLLECTION,
      data,
    ) as Promise<TrainingEvidence>;
  }

  async findBySessionId(tenantId: string, sessionId: string): Promise<TrainingEvidence | null> {
    const results = await this.storage.findMany<TrainingEvidence>(tenantId, EVIDENCE_COLLECTION, {
      where: { sessionId },
      limit: 1,
    });
    return results[0] ?? null;
  }

  async findById(tenantId: string, id: string): Promise<TrainingEvidence | null> {
    return this.storage.findById<TrainingEvidence>(tenantId, EVIDENCE_COLLECTION, id);
  }

  async listByTenant(
    tenantId: string,
    filters: EvidenceListFilters = {},
  ): Promise<{ items: TrainingEvidence[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filters.employeeId) {
      query.employeeId = filters.employeeId;
    }

    let results = await this.storage.findMany<TrainingEvidence>(tenantId, EVIDENCE_COLLECTION, {
      where: Object.keys(query).length > 0 ? query : undefined,
      orderBy: [{ field: "generatedAt", direction: "desc" }],
    });

    // Post-filter: date range
    const fromDate = filters.from;
    if (fromDate) {
      results = results.filter((r) => r.generatedAt >= fromDate);
    }
    const toDate = filters.to;
    if (toDate) {
      results = results.filter((r) => r.generatedAt <= toDate);
    }
    // Post-filter: outcome
    if (filters.outcome) {
      results = results.filter((r) => r.evidence.session.status === filters.outcome);
    }

    const total = results.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    const items = results.slice(offset, offset + limit);

    return { items, total };
  }
}
