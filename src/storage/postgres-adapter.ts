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
 * PostgreSQL-backed StorageAdapter implementation using postgres.js.
 * Constitution Principle III: Every query enforces tenant_id scoping.
 * Constitution Principle V: Pluggable Architecture.
 */

import crypto from "node:crypto";
import postgres from "postgres";
import type { StorageAdapter } from "./adapter.js";
import type { QueryFilter, StorageMetadata, TransactionContext } from "./types.js";

export interface PostgresAdapterOptions {
  connectionString: string;
  max?: number;
}

export class PostgresAdapter implements StorageAdapter {
  private sql: postgres.Sql;
  private initialized = false;

  constructor(options: PostgresAdapterOptions) {
    this.sql = postgres(options.connectionString, {
      max: options.max ?? 10,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.sql.unsafe(`
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          collection TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_records_tenant_collection
          ON records (tenant_id, collection);
      `);

      this.initialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize database schema: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async create<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    data: T,
  ): Promise<T & { id: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = { ...data, id };

    try {
      await this.sql`
        INSERT INTO records (id, tenant_id, collection, data, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${collection}, ${this.sql.json(record as unknown as postgres.JSONValue)}, ${now}, ${now})
      `;
    } catch (error) {
      throw new Error(
        `Failed to create record in ${collection}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    return record;
  }

  async findById<T>(tenantId: string, collection: string, id: string): Promise<T | null> {
    try {
      const rows = await this.sql`
        SELECT data FROM records
        WHERE id = ${id} AND tenant_id = ${tenantId} AND collection = ${collection}
      `;

      if (rows.length === 0) {
        return null;
      }

      return rows[0]!.data as T;
    } catch (error) {
      throw new Error(
        `Failed to find record ${id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async findMany<T>(tenantId: string, collection: string, query: QueryFilter): Promise<T[]> {
    try {
      const whereClauses: string[] = ["tenant_id = $1", "collection = $2"];
      const params: unknown[] = [tenantId, collection];
      let paramIndex = 3;

      if (query.where) {
        for (const [key, value] of Object.entries(query.where)) {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            throw new Error(`Invalid filter field: ${key}`);
          }
          whereClauses.push(`data->>'${key}' = $${paramIndex}`);
          paramIndex++;
          params.push(String(value));
        }
      }

      let sql = `SELECT data FROM records WHERE ${whereClauses.join(" AND ")}`;

      if (query.orderBy && query.orderBy.length > 0) {
        const orderClauses = query.orderBy.map((o) => {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(o.field)) {
            throw new Error(`Invalid order field: ${o.field}`);
          }
          const dir = o.direction === "desc" ? "DESC" : "ASC";
          return `data->>'${o.field}' ${dir}`;
        });
        sql += ` ORDER BY ${orderClauses.join(", ")}`;
      }

      if (query.limit !== undefined) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(query.limit);
        paramIndex++;
      }

      if (query.offset !== undefined) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(query.offset);
        paramIndex++;
      }

      const rows = await this.sql.unsafe(sql, params as postgres.SerializableParameter[]);
      return rows.map((row) => row.data as T);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Invalid order field:") ||
          error.message.startsWith("Invalid filter field:"))
      ) {
        throw error;
      }
      throw new Error(
        `Failed to query ${collection}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
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

    try {
      await this.sql`
        UPDATE records SET data = ${this.sql.json(updated as unknown as postgres.JSONValue)}, updated_at = ${now}
        WHERE id = ${id} AND tenant_id = ${tenantId} AND collection = ${collection}
      `;
    } catch (error) {
      throw new Error(
        `Failed to update record ${id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    return updated as T;
  }

  async delete(tenantId: string, collection: string, id: string): Promise<void> {
    try {
      await this.sql`
        DELETE FROM records
        WHERE id = ${id} AND tenant_id = ${tenantId} AND collection = ${collection}
      `;
    } catch (error) {
      throw new Error(
        `Failed to delete record ${id}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async transaction<R>(_tenantId: string, fn: (tx: TransactionContext) => Promise<R>): Promise<R> {
    const result = await this.sql.begin(async (txSql) => {
      const txAdapter = new PostgresTxAdapter(txSql);
      const txContext: TransactionContext = {
        create: <T extends Record<string, unknown>>(
          txTenantId: string,
          collection: string,
          data: T,
        ) => txAdapter.create<T>(txTenantId, collection, data),

        findById: <T>(txTenantId: string, collection: string, id: string) =>
          txAdapter.findById<T>(txTenantId, collection, id),

        update: <T extends Record<string, unknown>>(
          txTenantId: string,
          collection: string,
          id: string,
          data: Partial<T>,
        ) => txAdapter.update<T>(txTenantId, collection, id, data),

        delete: (txTenantId: string, collection: string, id: string) =>
          txAdapter.delete(txTenantId, collection, id),
      };

      return await fn(txContext);
    });
    return result as R;
  }

  getMetadata(): StorageMetadata {
    return {
      adapterName: "postgres",
      adapterVersion: "1.0.0",
    };
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

/**
 * Internal helper that executes CRUD operations within a postgres.js transaction.
 * Uses the transaction-scoped sql instance to ensure all operations are atomic.
 * Uses unsafe() because TypeScript's Omit strips call signatures from TransactionSql.
 */
class PostgresTxAdapter {
  constructor(private txSql: postgres.TransactionSql) {}

  async create<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    data: T,
  ): Promise<T & { id: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record = { ...data, id };

    await this.txSql.unsafe(
      "INSERT INTO records (id, tenant_id, collection, data, created_at, updated_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)",
      [id, tenantId, collection, JSON.stringify(record), now, now],
    );

    return record;
  }

  async findById<T>(tenantId: string, collection: string, id: string): Promise<T | null> {
    const rows = await this.txSql.unsafe(
      "SELECT data FROM records WHERE id = $1 AND tenant_id = $2 AND collection = $3",
      [id, tenantId, collection],
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0]!.data as T;
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

    await this.txSql.unsafe(
      "UPDATE records SET data = $1::jsonb, updated_at = $2 WHERE id = $3 AND tenant_id = $4 AND collection = $5",
      [JSON.stringify(updated), now, id, tenantId, collection],
    );

    return updated as T;
  }

  async delete(tenantId: string, collection: string, id: string): Promise<void> {
    await this.txSql.unsafe(
      "DELETE FROM records WHERE id = $1 AND tenant_id = $2 AND collection = $3",
      [id, tenantId, collection],
    );
  }
}
