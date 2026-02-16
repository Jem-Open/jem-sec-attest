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
 * SQLite-backed StorageAdapter implementation using better-sqlite3.
 * Constitution Principle III: Every query enforces tenant_id scoping.
 * Constitution Principle V: Pluggable Architecture.
 */

import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { StorageAdapter } from "./adapter.js";
import type { QueryFilter, StorageMetadata, TransactionContext } from "./types.js";

export interface SQLiteAdapterOptions {
  dbPath: string;
}

export class SQLiteAdapter implements StorageAdapter {
  private db: Database.Database;
  private initialized = false;

  constructor(options: SQLiteAdapterOptions) {
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_records_tenant_collection
        ON records (tenant_id, collection);
    `);

    this.initialized = true;
  }

  async create<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    data: T,
  ): Promise<T & { id: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = { ...data, id };

    this.db
      .prepare(
        "INSERT INTO records (id, tenant_id, collection, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, tenantId, collection, JSON.stringify(record), now, now);

    return record;
  }

  async findById<T>(tenantId: string, collection: string, id: string): Promise<T | null> {
    const row = this.db
      .prepare("SELECT data FROM records WHERE id = ? AND tenant_id = ? AND collection = ?")
      .get(id, tenantId, collection) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.data) as T;
  }

  async findMany<T>(tenantId: string, collection: string, query: QueryFilter): Promise<T[]> {
    const conditions: string[] = ["tenant_id = ?", "collection = ?"];
    const params: unknown[] = [tenantId, collection];

    if (query.where) {
      for (const [key, value] of Object.entries(query.where)) {
        conditions.push(`json_extract(data, '$.' || ?) = ?`);
        params.push(key, value);
      }
    }

    let sql = `SELECT data FROM records WHERE ${conditions.join(" AND ")}`;

    if (query.orderBy && query.orderBy.length > 0) {
      const orderClauses = query.orderBy.map((o) => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(o.field)) {
          throw new Error(`Invalid order field: ${o.field}`);
        }
        const dir = o.direction === "desc" ? "DESC" : "ASC";
        return `json_extract(data, '$.' || '${o.field}') ${dir}`;
      });
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    if (query.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(query.limit);
    }

    if (query.offset !== undefined) {
      if (query.limit === undefined) {
        sql += " LIMIT -1";
      }
      sql += " OFFSET ?";
      params.push(query.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as { data: string }[];
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  async update<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    id: string,
    data: Partial<T>,
  ): Promise<T> {
    const existing = await this.findById<T>(tenantId, collection, id);
    if (!existing) {
      throw new Error(`Record not found: ${id} in collection ${collection} for tenant ${tenantId}`);
    }

    const updated = { ...existing, ...data, id };
    const now = new Date().toISOString();

    this.db
      .prepare(
        "UPDATE records SET data = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND collection = ?",
      )
      .run(JSON.stringify(updated), now, id, tenantId, collection);

    return updated as T;
  }

  async delete(tenantId: string, collection: string, id: string): Promise<void> {
    this.db
      .prepare("DELETE FROM records WHERE id = ? AND tenant_id = ? AND collection = ?")
      .run(id, tenantId, collection);
  }

  async transaction<R>(_tenantId: string, fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    const txContext: TransactionContext = {
      create: <T extends Record<string, unknown>>(
        txTenantId: string,
        collection: string,
        data: T,
      ) => this.create(txTenantId, collection, data),

      findById: <T>(txTenantId: string, collection: string, id: string) =>
        this.findById<T>(txTenantId, collection, id),

      update: <T extends Record<string, unknown>>(
        txTenantId: string,
        collection: string,
        id: string,
        data: Partial<T>,
      ) => this.update<T>(txTenantId, collection, id, data),

      delete: (txTenantId: string, collection: string, id: string) =>
        this.delete(txTenantId, collection, id),
    };

    // better-sqlite3 is synchronous, so we manually manage BEGIN/COMMIT/ROLLBACK
    // to support async transaction callbacks.
    this.db.exec("BEGIN");
    try {
      const result = await fn(txContext);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getMetadata(): StorageMetadata {
    return {
      adapterName: "sqlite",
      adapterVersion: "1.0.0",
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
