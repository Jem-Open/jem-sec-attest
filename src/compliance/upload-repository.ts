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
 * ComplianceUploadRepository — storage for compliance upload records.
 * Constitution Principle III: Every query is scoped by tenantId.
 */

import type { StorageAdapter } from "../storage/adapter.js";
import type { ComplianceUploadRecord } from "./types.js";

const COLLECTION = "compliance_uploads";

export interface ComplianceUploadListFilters {
  status?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}

export class ComplianceUploadRepository {
  constructor(private readonly storage: StorageAdapter) {}

  async create(
    tenantId: string,
    data: Omit<ComplianceUploadRecord, "id">,
  ): Promise<ComplianceUploadRecord> {
    return this.storage.create(
      tenantId,
      COLLECTION,
      data as unknown as Record<string, unknown>,
    ) as unknown as Promise<ComplianceUploadRecord>;
  }

  async findByEvidenceId(
    tenantId: string,
    evidenceId: string,
    provider: string,
  ): Promise<ComplianceUploadRecord | null> {
    const results = await this.storage.findMany<ComplianceUploadRecord>(tenantId, COLLECTION, {
      where: { evidenceId, provider },
      limit: 1,
    });
    return results[0] ?? null;
  }

  async findById(tenantId: string, id: string): Promise<ComplianceUploadRecord | null> {
    return this.storage.findById<ComplianceUploadRecord>(tenantId, COLLECTION, id);
  }

  async update(
    tenantId: string,
    id: string,
    data: Partial<ComplianceUploadRecord>,
  ): Promise<ComplianceUploadRecord> {
    return this.storage.update(
      tenantId,
      COLLECTION,
      id,
      data as Record<string, unknown>,
    ) as unknown as Promise<ComplianceUploadRecord>;
  }

  async listByTenant(
    tenantId: string,
    filters: ComplianceUploadListFilters = {},
  ): Promise<{ items: ComplianceUploadRecord[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.provider) {
      query.provider = filters.provider;
    }

    const results = await this.storage.findMany<ComplianceUploadRecord>(tenantId, COLLECTION, {
      where: Object.keys(query).length > 0 ? query : undefined,
      orderBy: [{ field: "createdAt", direction: "desc" }],
    });

    const total = results.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 20;
    const items = results.slice(offset, offset + limit);

    return { items, total };
  }
}
