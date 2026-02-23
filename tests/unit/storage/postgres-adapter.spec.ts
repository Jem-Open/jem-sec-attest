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
 * Unit tests for the PostgresAdapter implementation.
 * Mocks the postgres module to test adapter logic without a real database.
 */

const { mockSql, mockPostgres } = vi.hoisted(() => {
  const mockSql = vi.fn() as ReturnType<typeof vi.fn> & {
    unsafe: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    begin: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  mockSql.unsafe = vi.fn();
  mockSql.end = vi.fn();
  mockSql.begin = vi.fn();
  mockSql.json = vi.fn((val: unknown) => val);

  const mockPostgres = vi.fn(() => mockSql);

  return { mockSql, mockPostgres };
});

vi.mock("postgres", () => ({
  default: mockPostgres,
}));

import { PostgresAdapter } from "../../../src/storage/postgres-adapter.js";

describe("PostgresAdapter", () => {
  let adapter: PostgresAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    mockSql.unsafe.mockResolvedValue([]);
    mockSql.end.mockResolvedValue(undefined);
    mockSql.begin.mockResolvedValue(undefined);
    adapter = new PostgresAdapter({ connectionString: "postgres://localhost:5432/test" });
  });

  describe("constructor", () => {
    it("creates a sql instance with the connection string and default max pool", () => {
      expect(mockPostgres).toHaveBeenCalledWith("postgres://localhost:5432/test", { max: 10 });
    });

    it("creates a sql instance with custom max pool size", () => {
      vi.clearAllMocks();
      new PostgresAdapter({ connectionString: "postgres://localhost/db", max: 25 });
      expect(mockPostgres).toHaveBeenCalledWith("postgres://localhost/db", { max: 25 });
    });
  });

  describe("initialize", () => {
    it("calls sql.unsafe with CREATE TABLE and CREATE INDEX SQL", async () => {
      await adapter.initialize();

      expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
      const sqlArg = mockSql.unsafe.mock.calls[0]?.[0] as string;
      expect(sqlArg).toContain("CREATE TABLE IF NOT EXISTS records");
      expect(sqlArg).toContain("CREATE INDEX IF NOT EXISTS idx_records_tenant_collection");
    });

    it("is idempotent — second call is a no-op", async () => {
      await adapter.initialize();
      await adapter.initialize();

      expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
    });

    it("wraps errors with 'Failed to initialize database schema' message", async () => {
      mockSql.unsafe.mockRejectedValueOnce(new Error("connection refused"));

      await expect(adapter.initialize()).rejects.toThrow(
        "Failed to initialize database schema: connection refused",
      );
    });

    it("handles non-Error thrown values", async () => {
      mockSql.unsafe.mockRejectedValueOnce("raw string error");

      await expect(adapter.initialize()).rejects.toThrow(
        "Failed to initialize database schema: unknown error",
      );
    });
  });

  describe("getMetadata", () => {
    it("returns adapter name and version", () => {
      const metadata = adapter.getMetadata();
      expect(metadata).toEqual({
        adapterName: "postgres",
        adapterVersion: "1.0.0",
      });
    });
  });

  describe("close", () => {
    it("calls sql.end()", async () => {
      await adapter.close();
      expect(mockSql.end).toHaveBeenCalledTimes(1);
    });
  });

  describe("create", () => {
    it("inserts a record and returns it with a generated id", async () => {
      const result = await adapter.create("tenant-1", "items", { name: "test" });

      expect(result.id).toBeDefined();
      expect(result.name).toBe("test");
      // The tagged template call was used (mockSql itself was called)
      expect(mockSql).toHaveBeenCalled();
      // sql.json was called to serialize the record
      expect(mockSql.json).toHaveBeenCalled();
    });

    it("wraps errors with 'Failed to create record in {collection}' message", async () => {
      mockSql.mockRejectedValueOnce(new Error("duplicate key"));

      await expect(adapter.create("tenant-1", "items", { name: "fail" })).rejects.toThrow(
        "Failed to create record in items: duplicate key",
      );
    });

    it("handles non-Error thrown values in create", async () => {
      mockSql.mockRejectedValueOnce(42);

      await expect(adapter.create("tenant-1", "items", { name: "fail" })).rejects.toThrow(
        "Failed to create record in items: unknown error",
      );
    });
  });

  describe("findById", () => {
    it("returns data from matching row", async () => {
      const mockData = { id: "abc-123", name: "found" };
      mockSql.mockResolvedValueOnce([{ data: mockData }]);

      const result = await adapter.findById("tenant-1", "items", "abc-123");
      expect(result).toEqual(mockData);
    });

    it("returns null when no rows match", async () => {
      mockSql.mockResolvedValueOnce([]);

      const result = await adapter.findById("tenant-1", "items", "nonexistent");
      expect(result).toBeNull();
    });

    it("wraps errors with 'Failed to find record {id}' message", async () => {
      mockSql.mockRejectedValueOnce(new Error("connection lost"));

      await expect(adapter.findById("tenant-1", "items", "abc-123")).rejects.toThrow(
        "Failed to find record abc-123: connection lost",
      );
    });
  });

  describe("findMany", () => {
    it("returns rows mapped to data field", async () => {
      mockSql.unsafe.mockResolvedValueOnce([
        { data: { id: "1", name: "a" } },
        { data: { id: "2", name: "b" } },
      ]);

      const results = await adapter.findMany("tenant-1", "items", {});
      expect(results).toEqual([
        { id: "1", name: "a" },
        { id: "2", name: "b" },
      ]);
    });

    it("re-throws 'Invalid order field' errors as-is", async () => {
      await expect(
        adapter.findMany("tenant-1", "items", {
          orderBy: [{ field: "DROP TABLE; --", direction: "asc" }],
        }),
      ).rejects.toThrow("Invalid order field: DROP TABLE; --");
    });

    it("wraps other errors with 'Failed to query {collection}' message", async () => {
      mockSql.unsafe.mockRejectedValueOnce(new Error("timeout"));

      await expect(adapter.findMany("tenant-1", "items", {})).rejects.toThrow(
        "Failed to query items: timeout",
      );
    });

    it("builds where clauses from query.where", async () => {
      mockSql.unsafe.mockResolvedValueOnce([]);

      await adapter.findMany("tenant-1", "items", { where: { status: "active" } });

      expect(mockSql.unsafe).toHaveBeenCalledTimes(1);
      const sqlArg = mockSql.unsafe.mock.calls[0]?.[0] as string;
      expect(sqlArg).toContain("data->>'status' = $3");
    });

    it("adds ORDER BY clause for orderBy", async () => {
      mockSql.unsafe.mockResolvedValueOnce([]);

      await adapter.findMany("tenant-1", "items", {
        orderBy: [{ field: "createdAt", direction: "desc" }],
      });

      const sqlArg = mockSql.unsafe.mock.calls[0]?.[0] as string;
      expect(sqlArg).toContain("ORDER BY data->>'createdAt' DESC");
    });

    it("adds LIMIT and OFFSET clauses", async () => {
      mockSql.unsafe.mockResolvedValueOnce([]);

      await adapter.findMany("tenant-1", "items", { limit: 10, offset: 20 });

      const sqlArg = mockSql.unsafe.mock.calls[0]?.[0] as string;
      expect(sqlArg).toContain("LIMIT");
      expect(sqlArg).toContain("OFFSET");
    });
  });

  describe("update", () => {
    it("throws 'Record not found' when record does not exist", async () => {
      // findById returns empty (no rows)
      mockSql.mockResolvedValueOnce([]);

      await expect(
        adapter.update("tenant-1", "items", "nonexistent", { name: "updated" }),
      ).rejects.toThrow(/Record not found/);
    });

    it("updates an existing record and returns merged data", async () => {
      const existing = { id: "abc-123", name: "original", value: 1 };
      // First call: findById returns the existing record
      mockSql.mockResolvedValueOnce([{ data: existing }]);
      // Second call: UPDATE statement
      mockSql.mockResolvedValueOnce([]);

      const result = await adapter.update("tenant-1", "items", "abc-123", { value: 42 });

      expect(result).toEqual({ id: "abc-123", name: "original", value: 42 });
    });

    it("wraps update SQL errors with 'Failed to update record {id}' message", async () => {
      const existing = { id: "abc-123", name: "original" };
      // findById succeeds
      mockSql.mockResolvedValueOnce([{ data: existing }]);
      // UPDATE fails
      mockSql.mockRejectedValueOnce(new Error("serialization failure"));

      await expect(adapter.update("tenant-1", "items", "abc-123", { name: "new" })).rejects.toThrow(
        "Failed to update record abc-123: serialization failure",
      );
    });
  });

  describe("delete", () => {
    it("calls the tagged template sql for deletion", async () => {
      await adapter.delete("tenant-1", "items", "abc-123");
      expect(mockSql).toHaveBeenCalled();
    });

    it("wraps errors with 'Failed to delete record' message", async () => {
      mockSql.mockRejectedValueOnce(new Error("foreign key constraint"));

      await expect(adapter.delete("tenant-1", "items", "abc-123")).rejects.toThrow(
        "Failed to delete record abc-123: foreign key constraint",
      );
    });
  });

  describe("transaction", () => {
    it("calls sql.begin and passes a transaction context to the callback", async () => {
      const mockTxSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      };

      mockSql.begin.mockImplementation(async (fn: (txSql: unknown) => Promise<unknown>) => {
        return await fn(mockTxSql);
      });

      const result = await adapter.transaction("tenant-1", async (tx) => {
        const created = await tx.create("tenant-1", "items", { name: "tx-item" });
        return created;
      });

      expect(mockSql.begin).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).name).toBe("tx-item");
    });

    it("transaction findById returns null when no rows match", async () => {
      const mockTxSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      };

      mockSql.begin.mockImplementation(async (fn: (txSql: unknown) => Promise<unknown>) => {
        return await fn(mockTxSql);
      });

      const result = await adapter.transaction("tenant-1", async (tx) => {
        return await tx.findById("tenant-1", "items", "nonexistent");
      });

      expect(result).toBeNull();
    });

    it("transaction findById returns data when row exists", async () => {
      const mockTxSql = {
        unsafe: vi.fn().mockResolvedValueOnce([{ data: { id: "tx-1", name: "found" } }]),
      };

      mockSql.begin.mockImplementation(async (fn: (txSql: unknown) => Promise<unknown>) => {
        return await fn(mockTxSql);
      });

      const result = await adapter.transaction("tenant-1", async (tx) => {
        return await tx.findById("tenant-1", "items", "tx-1");
      });

      expect(result).toEqual({ id: "tx-1", name: "found" });
    });

    it("transaction update throws when record does not exist", async () => {
      const mockTxSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      };

      mockSql.begin.mockImplementation(async (fn: (txSql: unknown) => Promise<unknown>) => {
        return await fn(mockTxSql);
      });

      await expect(
        adapter.transaction("tenant-1", async (tx) => {
          return await tx.update("tenant-1", "items", "nonexistent", { name: "new" });
        }),
      ).rejects.toThrow(/Record not found/);
    });

    it("transaction delete calls unsafe with correct SQL", async () => {
      const mockTxSql = {
        unsafe: vi.fn().mockResolvedValue([]),
      };

      mockSql.begin.mockImplementation(async (fn: (txSql: unknown) => Promise<unknown>) => {
        return await fn(mockTxSql);
      });

      await adapter.transaction("tenant-1", async (tx) => {
        await tx.delete("tenant-1", "items", "abc-123");
      });

      expect(mockTxSql.unsafe).toHaveBeenCalledWith(
        "DELETE FROM records WHERE id = $1 AND tenant_id = $2 AND collection = $3",
        ["abc-123", "tenant-1", "items"],
      );
    });
  });
});
