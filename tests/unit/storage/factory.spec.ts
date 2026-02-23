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

const { mockPostgresAdapter, mockSqliteAdapter } = vi.hoisted(() => {
  const mockPostgresAdapter = {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "postgres", adapterVersion: "1.0.0" }),
  };
  const mockSqliteAdapter = {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "sqlite", adapterVersion: "1.0.0" }),
  };
  return { mockPostgresAdapter, mockSqliteAdapter };
});

vi.mock("@/storage/postgres-adapter", () => ({
  PostgresAdapter: vi.fn().mockImplementation(() => mockPostgresAdapter),
}));
vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => mockSqliteAdapter),
}));

import { closeStorage, getStorage, resetStorage } from "@/storage/factory";
import { PostgresAdapter } from "@/storage/postgres-adapter";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";

/** Remove an env var properly (Reflect.deleteProperty satisfies Biome noDelete rule) */
function removeEnv(key: string): void {
  Reflect.deleteProperty(process.env, key);
}

describe("storage/factory", () => {
  let savedDatabaseUrl: string | undefined;
  let savedDbPath: string | undefined;

  beforeEach(() => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    savedDbPath = process.env.DB_PATH;
    removeEnv("DATABASE_URL");
    removeEnv("DB_PATH");
    resetStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = savedDatabaseUrl;
    } else {
      removeEnv("DATABASE_URL");
    }
    if (savedDbPath !== undefined) {
      process.env.DB_PATH = savedDbPath;
    } else {
      removeEnv("DB_PATH");
    }
  });

  it("returns PostgresAdapter when DATABASE_URL starts with postgres://", async () => {
    process.env.DATABASE_URL = "postgres://localhost:5432/jem";
    const adapter = await getStorage();
    expect(PostgresAdapter).toHaveBeenCalledWith({
      connectionString: "postgres://localhost:5432/jem",
    });
    expect(adapter).toBe(mockPostgresAdapter);
  });

  it("returns PostgresAdapter when DATABASE_URL starts with postgresql://", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/jem";
    const adapter = await getStorage();
    expect(PostgresAdapter).toHaveBeenCalledWith({
      connectionString: "postgresql://localhost:5432/jem",
    });
    expect(adapter).toBe(mockPostgresAdapter);
  });

  it("returns SQLiteAdapter when DATABASE_URL is not set", async () => {
    const adapter = await getStorage();
    expect(SQLiteAdapter).toHaveBeenCalled();
    expect(adapter).toBe(mockSqliteAdapter);
  });

  it("returns SQLiteAdapter when DATABASE_URL does not start with postgres", async () => {
    process.env.DATABASE_URL = "mysql://localhost:3306/jem";
    const adapter = await getStorage();
    expect(SQLiteAdapter).toHaveBeenCalled();
    expect(adapter).toBe(mockSqliteAdapter);
  });

  it("uses DB_PATH env var for SQLite", async () => {
    process.env.DB_PATH = "/tmp/custom.db";
    await getStorage();
    expect(SQLiteAdapter).toHaveBeenCalledWith({ dbPath: "/tmp/custom.db" });
  });

  it("defaults to data/jem.db when DB_PATH is not set", async () => {
    await getStorage();
    expect(SQLiteAdapter).toHaveBeenCalledWith({ dbPath: "data/jem.db" });
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    const first = await getStorage();
    const second = await getStorage();
    expect(first).toBe(second);
    expect(mockSqliteAdapter.initialize).toHaveBeenCalledTimes(1);
  });

  it("calls initialize() on first call", async () => {
    await getStorage();
    expect(mockSqliteAdapter.initialize).toHaveBeenCalledTimes(1);
  });

  it("closeStorage() calls close() on the adapter and resets singleton", async () => {
    await getStorage();
    await closeStorage();
    expect(mockSqliteAdapter.close).toHaveBeenCalledTimes(1);

    // After closing, next getStorage() should create a new adapter
    vi.clearAllMocks();
    await getStorage();
    expect(mockSqliteAdapter.initialize).toHaveBeenCalledTimes(1);
  });

  it("resetStorage() clears singleton so next getStorage() creates new adapter", async () => {
    await getStorage();
    expect(mockSqliteAdapter.initialize).toHaveBeenCalledTimes(1);

    resetStorage();
    vi.clearAllMocks();

    await getStorage();
    expect(mockSqliteAdapter.initialize).toHaveBeenCalledTimes(1);
  });
});
