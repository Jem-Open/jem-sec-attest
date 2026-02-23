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
 * Adapter factory — selects and manages a shared StorageAdapter singleton.
 * Constitution Principle V: Pluggable Architecture — adapter selected via configuration.
 * Constitution Principle I: Configuration-as-Code — selection via DATABASE_URL env var.
 */

import type { StorageAdapter } from "./adapter.js";
import { PostgresAdapter } from "./postgres-adapter.js";
import { SQLiteAdapter } from "./sqlite-adapter.js";

let instance: StorageAdapter | null = null;
let initPromise: Promise<StorageAdapter> | null = null;

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function createAdapter(): StorageAdapter {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && isPostgresUrl(databaseUrl)) {
    return new PostgresAdapter({ connectionString: databaseUrl });
  }

  return new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
}

/**
 * Returns a shared, initialized StorageAdapter singleton.
 * First call creates and initializes the adapter; subsequent calls return the same instance.
 * Adapter selection is based on DATABASE_URL environment variable:
 *   - postgres:// or postgresql:// prefix → PostgresAdapter
 *   - absent or other → SQLiteAdapter (backward compatible default)
 */
export function getStorage(): Promise<StorageAdapter> {
  if (instance) {
    return Promise.resolve(instance);
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const adapter = createAdapter();
    await adapter.initialize();
    instance = adapter;
    initPromise = null;
    return adapter;
  })();

  return initPromise;
}

/**
 * Closes the singleton adapter and resets state.
 * Used for graceful shutdown and test cleanup.
 */
export async function closeStorage(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
  initPromise = null;
}

/**
 * Resets the singleton without closing.
 * Used in tests to swap adapters between test suites.
 */
export function resetStorage(): void {
  instance = null;
  initPromise = null;
}
