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
 * Unit tests for ComplianceUploadRepository.
 * StorageAdapter is mocked — no SQLite involved.
 */

import { describe, expect, it, vi } from "vitest";

import type { ComplianceUploadRecord } from "../../../src/compliance/types.js";
import { ComplianceUploadRepository } from "../../../src/compliance/upload-repository.js";
import type { StorageAdapter } from "../../../src/storage/adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = "test-tenant";
const ISO = "2026-02-21T10:00:00.000Z";

function createMockStorage(): StorageAdapter {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi
      .fn()
      .mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
    close: vi.fn(),
  };
}

function makeUploadRecord(overrides: Partial<ComplianceUploadRecord> = {}): ComplianceUploadRecord {
  return {
    id: "upload-uuid-001",
    tenantId: TENANT,
    evidenceId: "ev-uuid-001",
    sessionId: "sess-uuid-001",
    provider: "sprinto",
    status: "pending",
    attemptCount: 0,
    maxAttempts: 5,
    providerReferenceId: null,
    lastError: null,
    lastErrorCode: null,
    retryable: true,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ComplianceUploadRepository", () => {
  let storage: StorageAdapter;
  let repo: ComplianceUploadRepository;

  beforeEach(() => {
    storage = createMockStorage();
    repo = new ComplianceUploadRepository(storage);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("delegates to storage.create with the compliance_uploads collection", async () => {
      const record = makeUploadRecord();
      const { id: _id, ...data } = record;
      const created = makeUploadRecord({ id: "upload-uuid-new" });

      vi.mocked(storage.create).mockResolvedValueOnce(
        created as unknown as typeof created & { id: string },
      );

      const result = await repo.create(TENANT, data);

      expect(storage.create).toHaveBeenCalledWith(TENANT, "compliance_uploads", data);
      expect(result.id).toBe("upload-uuid-new");
    });

    it("returns the created record with all fields intact", async () => {
      const record = makeUploadRecord({ status: "pending", attemptCount: 0 });
      const { id: _id, ...data } = record;

      vi.mocked(storage.create).mockResolvedValueOnce(
        record as unknown as typeof record & { id: string },
      );

      const result = await repo.create(TENANT, data);

      expect(result.tenantId).toBe(TENANT);
      expect(result.provider).toBe("sprinto");
      expect(result.status).toBe("pending");
    });
  });

  // -------------------------------------------------------------------------
  // findByEvidenceId
  // -------------------------------------------------------------------------

  describe("findByEvidenceId", () => {
    it("queries storage with evidenceId and provider in the where filter", async () => {
      const record = makeUploadRecord();
      vi.mocked(storage.findMany).mockResolvedValueOnce([record]);

      const result = await repo.findByEvidenceId(TENANT, "ev-uuid-001", "sprinto");

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "compliance_uploads", {
        where: { evidenceId: "ev-uuid-001", provider: "sprinto" },
        limit: 1,
      });
      expect(result).toEqual(record);
    });

    it("returns null when no record is found", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      const result = await repo.findByEvidenceId(TENANT, "ev-missing", "sprinto");

      expect(result).toBeNull();
    });

    it("returns the first record when multiple matches exist", async () => {
      const first = makeUploadRecord({ id: "upload-001" });
      const second = makeUploadRecord({ id: "upload-002" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([first, second]);

      const result = await repo.findByEvidenceId(TENANT, "ev-uuid-001", "sprinto");

      expect(result?.id).toBe("upload-001");
    });

    it("passes the provider name in the where filter to distinguish providers", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findByEvidenceId(TENANT, "ev-uuid-001", "drata");

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        expect.objectContaining({ where: { evidenceId: "ev-uuid-001", provider: "drata" } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("delegates to storage.findById with the correct collection", async () => {
      const record = makeUploadRecord();
      vi.mocked(storage.findById).mockResolvedValueOnce(record);

      const result = await repo.findById(TENANT, "upload-uuid-001");

      expect(storage.findById).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        "upload-uuid-001",
      );
      expect(result).toEqual(record);
    });

    it("returns null when record is not found", async () => {
      vi.mocked(storage.findById).mockResolvedValueOnce(null);

      const result = await repo.findById(TENANT, "nonexistent-id");

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe("update", () => {
    it("delegates to storage.update with the correct collection", async () => {
      const updated = makeUploadRecord({ status: "succeeded", attemptCount: 1 });
      vi.mocked(storage.update).mockResolvedValueOnce(updated as unknown as typeof updated);

      const result = await repo.update(TENANT, "upload-uuid-001", {
        status: "succeeded",
        attemptCount: 1,
      });

      expect(storage.update).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        "upload-uuid-001",
        expect.objectContaining({ status: "succeeded", attemptCount: 1 }),
      );
      expect(result.status).toBe("succeeded");
    });

    it("passes partial updates and returns the full updated record", async () => {
      const updated = makeUploadRecord({
        status: "failed",
        lastError: "Auth failed",
        lastErrorCode: "AUTH_FAILED",
        retryable: false,
      });
      vi.mocked(storage.update).mockResolvedValueOnce(updated as unknown as typeof updated);

      const result = await repo.update(TENANT, "upload-uuid-001", {
        status: "failed",
        lastError: "Auth failed",
        lastErrorCode: "AUTH_FAILED",
        retryable: false,
      });

      expect(result.lastErrorCode).toBe("AUTH_FAILED");
      expect(result.retryable).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // listByTenant
  // -------------------------------------------------------------------------

  describe("listByTenant", () => {
    it("returns all records with pagination defaults when no filters are given", async () => {
      const records = [
        makeUploadRecord({ id: "upload-001", createdAt: "2026-02-20T10:00:00.000Z" }),
        makeUploadRecord({ id: "upload-002", createdAt: "2026-02-21T10:00:00.000Z" }),
      ];
      vi.mocked(storage.findMany).mockResolvedValueOnce(records);

      const result = await repo.listByTenant(TENANT);

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        expect.objectContaining({
          orderBy: [{ field: "createdAt", direction: "desc" }],
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("applies status filter when provided", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.listByTenant(TENANT, { status: "succeeded" });

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        expect.objectContaining({
          where: expect.objectContaining({ status: "succeeded" }),
        }),
      );
    });

    it("applies provider filter when provided", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.listByTenant(TENANT, { provider: "sprinto" });

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        expect.objectContaining({
          where: expect.objectContaining({ provider: "sprinto" }),
        }),
      );
    });

    it("applies both status and provider filters simultaneously", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.listByTenant(TENANT, { status: "failed", provider: "sprinto" });

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "compliance_uploads",
        expect.objectContaining({
          where: { status: "failed", provider: "sprinto" },
        }),
      );
    });

    it("omits where clause when neither status nor provider filter is provided", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.listByTenant(TENANT, {});

      const [, , query] = vi.mocked(storage.findMany).mock.calls[0] as [
        string,
        string,
        { where?: unknown },
      ];
      expect(query.where).toBeUndefined();
    });

    it("applies pagination with limit and offset", async () => {
      const allRecords = Array.from({ length: 5 }, (_, i) =>
        makeUploadRecord({ id: `upload-00${i + 1}` }),
      );
      vi.mocked(storage.findMany).mockResolvedValueOnce(allRecords);

      const result = await repo.listByTenant(TENANT, { limit: 2, offset: 1 });

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe("upload-002");
      expect(result.items[1]?.id).toBe("upload-003");
    });

    it("uses default limit of 20 and offset of 0 when not specified", async () => {
      const records = Array.from({ length: 25 }, (_, i) =>
        makeUploadRecord({ id: `upload-${String(i + 1).padStart(3, "0")}` }),
      );
      vi.mocked(storage.findMany).mockResolvedValueOnce(records);

      const result = await repo.listByTenant(TENANT);

      expect(result.total).toBe(25);
      expect(result.items).toHaveLength(20);
      expect(result.items[0]?.id).toBe("upload-001");
    });

    it("returns empty items and zero total when no records exist", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      const result = await repo.listByTenant(TENANT);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
