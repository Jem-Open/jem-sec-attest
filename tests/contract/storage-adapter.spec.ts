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
 * Contract tests for StorageAdapter implementations.
 * Any adapter must pass this suite to be considered conformant.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StorageAdapter } from "../../src/storage/adapter.js";
import { SQLiteAdapter } from "../../src/storage/sqlite-adapter.js";

interface TestRecord {
  id: string;
  name: string;
  value: number;
}

function runStorageAdapterContractTests(createAdapter: () => Promise<StorageAdapter>): void {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = await createAdapter();
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe("create", () => {
    it("stores a record with auto-generated id and returns record with id", async () => {
      const result = await adapter.create("tenant-1", "items", {
        name: "test",
        value: 42,
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.name).toBe("test");
      expect(result.value).toBe(42);
    });

    it("generates unique ids for each record", async () => {
      const r1 = await adapter.create("tenant-1", "items", { name: "a", value: 1 });
      const r2 = await adapter.create("tenant-1", "items", { name: "b", value: 2 });

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe("findById", () => {
    it("retrieves a record by id", async () => {
      const created = await adapter.create("tenant-1", "items", {
        name: "findme",
        value: 10,
      });

      const found = await adapter.findById<TestRecord>("tenant-1", "items", created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe("findme");
      expect(found?.value).toBe(10);
    });

    it("returns null for a missing id", async () => {
      const found = await adapter.findById("tenant-1", "items", "nonexistent-id");
      expect(found).toBeNull();
    });

    it("enforces tenant isolation - tenant A cannot see tenant B records", async () => {
      const created = await adapter.create("tenant-A", "items", {
        name: "secret",
        value: 99,
      });

      const foundByA = await adapter.findById<TestRecord>("tenant-A", "items", created.id);
      expect(foundByA).not.toBeNull();
      expect(foundByA?.name).toBe("secret");

      const foundByB = await adapter.findById<TestRecord>("tenant-B", "items", created.id);
      expect(foundByB).toBeNull();
    });
  });

  describe("findMany", () => {
    beforeEach(async () => {
      await adapter.create("tenant-1", "items", { name: "alpha", value: 3 });
      await adapter.create("tenant-1", "items", { name: "beta", value: 1 });
      await adapter.create("tenant-1", "items", { name: "gamma", value: 2 });
      await adapter.create("tenant-2", "items", { name: "delta", value: 4 });
    });

    it("queries with where filters", async () => {
      const results = await adapter.findMany<TestRecord>("tenant-1", "items", {
        where: { name: "beta" },
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("beta");
    });

    it("applies orderBy", async () => {
      const results = await adapter.findMany<TestRecord>("tenant-1", "items", {
        orderBy: [{ field: "value", direction: "asc" }],
      });

      expect(results).toHaveLength(3);
      expect(results[0]?.name).toBe("beta");
      expect(results[1]?.name).toBe("gamma");
      expect(results[2]?.name).toBe("alpha");
    });

    it("applies limit", async () => {
      const results = await adapter.findMany<TestRecord>("tenant-1", "items", {
        limit: 2,
      });

      expect(results).toHaveLength(2);
    });

    it("applies offset", async () => {
      const results = await adapter.findMany<TestRecord>("tenant-1", "items", {
        orderBy: [{ field: "value", direction: "asc" }],
        limit: 2,
        offset: 1,
      });

      expect(results).toHaveLength(2);
      expect(results[0]?.name).toBe("gamma");
      expect(results[1]?.name).toBe("alpha");
    });

    it("scopes results to tenant", async () => {
      const t1Results = await adapter.findMany<TestRecord>("tenant-1", "items", {});
      const t2Results = await adapter.findMany<TestRecord>("tenant-2", "items", {});

      expect(t1Results).toHaveLength(3);
      expect(t2Results).toHaveLength(1);
      expect(t2Results[0]?.name).toBe("delta");
    });
  });

  describe("update", () => {
    it("performs partial update by id and returns updated record", async () => {
      const created = await adapter.create("tenant-1", "items", {
        name: "original",
        value: 1,
      });

      const updated = await adapter.update<TestRecord>("tenant-1", "items", created.id, {
        value: 99,
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe("original");
      expect(updated.value).toBe(99);
    });

    it("persists the update", async () => {
      const created = await adapter.create("tenant-1", "items", {
        name: "persist",
        value: 1,
      });

      await adapter.update<TestRecord>("tenant-1", "items", created.id, { value: 42 });

      const found = await adapter.findById<TestRecord>("tenant-1", "items", created.id);
      expect(found?.value).toBe(42);
    });

    it("throws for nonexistent record", async () => {
      await expect(
        adapter.update("tenant-1", "items", "nonexistent", { value: 1 }),
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("removes a record and subsequent findById returns null", async () => {
      const created = await adapter.create("tenant-1", "items", {
        name: "deleteme",
        value: 1,
      });

      await adapter.delete("tenant-1", "items", created.id);

      const found = await adapter.findById("tenant-1", "items", created.id);
      expect(found).toBeNull();
    });

    it("scoped to tenant - cannot delete another tenant's record", async () => {
      const created = await adapter.create("tenant-A", "items", {
        name: "protected",
        value: 1,
      });

      await adapter.delete("tenant-B", "items", created.id);

      const found = await adapter.findById<TestRecord>("tenant-A", "items", created.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe("protected");
    });
  });

  describe("transaction", () => {
    it("commits operations atomically", async () => {
      await adapter.transaction("tenant-1", async (tx) => {
        await tx.create("tenant-1", "items", { name: "tx-item-1", value: 1 });
        await tx.create("tenant-1", "items", { name: "tx-item-2", value: 2 });
      });

      const results = await adapter.findMany<TestRecord>("tenant-1", "items", {});
      expect(results).toHaveLength(2);
    });

    it("rolls back on error", async () => {
      try {
        await adapter.transaction("tenant-1", async (tx) => {
          await tx.create("tenant-1", "items", { name: "rollback-item", value: 1 });
          throw new Error("simulated failure");
        });
      } catch {
        // expected
      }

      const results = await adapter.findMany<TestRecord>("tenant-1", "items", {});
      expect(results).toHaveLength(0);
    });

    it("returns the result of the transaction function", async () => {
      const result = await adapter.transaction("tenant-1", async (tx) => {
        const created = await tx.create("tenant-1", "items", {
          name: "return-test",
          value: 7,
        });
        return created;
      });

      expect(result).toHaveProperty("id");
      expect(result.name).toBe("return-test");
    });
  });

  describe("tenant isolation", () => {
    it("all operations are scoped to tenantId", async () => {
      // Create records for two tenants in the same collection
      const a1 = await adapter.create("tenant-A", "shared", { name: "a1", value: 1 });
      const b1 = await adapter.create("tenant-B", "shared", { name: "b1", value: 2 });

      // findById isolation
      expect(await adapter.findById("tenant-A", "shared", b1.id)).toBeNull();
      expect(await adapter.findById("tenant-B", "shared", a1.id)).toBeNull();

      // findMany isolation
      const aRecords = await adapter.findMany<TestRecord>("tenant-A", "shared", {});
      const bRecords = await adapter.findMany<TestRecord>("tenant-B", "shared", {});
      expect(aRecords).toHaveLength(1);
      expect(bRecords).toHaveLength(1);
      expect(aRecords[0]?.name).toBe("a1");
      expect(bRecords[0]?.name).toBe("b1");

      // update isolation - cannot update another tenant's record
      await expect(adapter.update("tenant-B", "shared", a1.id, { value: 999 })).rejects.toThrow();

      // delete isolation - cannot delete another tenant's record
      await adapter.delete("tenant-B", "shared", a1.id);
      expect(await adapter.findById<TestRecord>("tenant-A", "shared", a1.id)).not.toBeNull();
    });
  });

  describe("getMetadata", () => {
    it("returns adapter name and version", () => {
      const meta = adapter.getMetadata();

      expect(meta).toHaveProperty("adapterName");
      expect(meta).toHaveProperty("adapterVersion");
      expect(typeof meta.adapterName).toBe("string");
      expect(typeof meta.adapterVersion).toBe("string");
      expect(meta.adapterName.length).toBeGreaterThan(0);
      expect(meta.adapterVersion.length).toBeGreaterThan(0);
    });
  });
}

describe("StorageAdapter Contract Tests — SQLiteAdapter", () => {
  runStorageAdapterContractTests(async () => new SQLiteAdapter({ dbPath: ":memory:" }));
});
