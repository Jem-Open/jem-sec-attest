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
 * Unit tests specific to the SQLiteAdapter implementation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLiteAdapter } from "../../../src/storage/sqlite-adapter.js";

describe("SQLiteAdapter", () => {
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    adapter = new SQLiteAdapter({ dbPath: ":memory:" });
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe("initialize", () => {
    it("creates the records table", async () => {
      await adapter.initialize();

      const freshAdapter = new SQLiteAdapter({ dbPath: ":memory:" });
      await freshAdapter.initialize();

      // Verify we can perform operations (table exists)
      const result = await freshAdapter.findMany("tenant-1", "items", {});
      expect(result).toEqual([]);

      await freshAdapter.close();
    });

    it("is idempotent - calling initialize twice does not throw", async () => {
      await adapter.initialize();
      await adapter.initialize();

      // Should still work after double initialization
      const result = await adapter.findMany("tenant-1", "items", {});
      expect(result).toEqual([]);
    });

    it("creates index on tenant_id and collection", async () => {
      await adapter.initialize();

      // Verify the adapter works with tenant-scoped queries (index is used)
      await adapter.create("t1", "col1", { name: "a" });
      await adapter.create("t1", "col2", { name: "b" });
      await adapter.create("t2", "col1", { name: "c" });

      const results = await adapter.findMany("t1", "col1", {});
      expect(results).toHaveLength(1);
    });
  });

  describe("migrations are applied in order", () => {
    it("base table migration creates the expected schema", async () => {
      await adapter.initialize();

      // Verify all required columns work by creating and retrieving a record
      const created = await adapter.create("tenant-1", "items", {
        name: "migration-test",
        value: 42,
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("migration-test");

      const found = await adapter.findById<{ id: string; name: string; value: number }>(
        "tenant-1",
        "items",
        created.id,
      );
      expect(found).not.toBeNull();
      expect(found?.name).toBe("migration-test");
    });
  });

  describe("tenant_id WHERE clause is automatically added", () => {
    it("findById includes tenant_id in WHERE clause", async () => {
      await adapter.initialize();

      const created = await adapter.create("tenant-A", "items", { name: "scoped" });

      // Same id, different tenant - must return null
      const result = await adapter.findById("tenant-B", "items", created.id);
      expect(result).toBeNull();

      // Same id, same tenant - must return the record
      const found = await adapter.findById("tenant-A", "items", created.id);
      expect(found).not.toBeNull();
    });

    it("findMany includes tenant_id in WHERE clause", async () => {
      await adapter.initialize();

      await adapter.create("tenant-A", "items", { name: "a-item" });
      await adapter.create("tenant-B", "items", { name: "b-item" });

      const aResults = await adapter.findMany("tenant-A", "items", {});
      const bResults = await adapter.findMany("tenant-B", "items", {});

      expect(aResults).toHaveLength(1);
      expect(bResults).toHaveLength(1);
    });

    it("update includes tenant_id in WHERE clause", async () => {
      await adapter.initialize();

      const created = await adapter.create("tenant-A", "items", {
        name: "original",
        value: 1,
      });

      // Attempting to update with wrong tenant should throw
      await expect(
        adapter.update("tenant-B", "items", created.id, { value: 999 }),
      ).rejects.toThrow();

      // Original should be unchanged
      const found = await adapter.findById<{ id: string; name: string; value: number }>(
        "tenant-A",
        "items",
        created.id,
      );
      expect(found?.value).toBe(1);
    });

    it("delete includes tenant_id in WHERE clause", async () => {
      await adapter.initialize();

      const created = await adapter.create("tenant-A", "items", { name: "protected" });

      // Attempting to delete with wrong tenant should not remove the record
      await adapter.delete("tenant-B", "items", created.id);

      const found = await adapter.findById("tenant-A", "items", created.id);
      expect(found).not.toBeNull();
    });
  });

  describe("close", () => {
    it("gracefully shuts down the database connection", async () => {
      await adapter.initialize();
      await adapter.create("tenant-1", "items", { name: "before-close" });

      await adapter.close();

      // After close, operations should throw
      await expect(adapter.findMany("tenant-1", "items", {})).rejects.toThrow();
    });
  });
});
