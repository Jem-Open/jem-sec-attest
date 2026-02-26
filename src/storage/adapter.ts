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
 * StorageAdapter interface — pluggable storage backend.
 * Constitution Principle V: Pluggable Architecture.
 * Constitution Principle III: Every method enforces tenantId scoping.
 */

import type { QueryFilter, StorageMetadata, TransactionContext } from "./types";

export interface StorageAdapter {
  initialize(): Promise<void>;

  create<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    data: T,
  ): Promise<T & { id: string }>;

  findById<T>(tenantId: string, collection: string, id: string): Promise<T | null>;

  findMany<T>(tenantId: string, collection: string, query: QueryFilter): Promise<T[]>;

  update<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    id: string,
    data: Partial<T>,
  ): Promise<T>;

  delete(tenantId: string, collection: string, id: string): Promise<void>;

  transaction<R>(tenantId: string, fn: (tx: TransactionContext) => Promise<R>): Promise<R>;

  getMetadata(): StorageMetadata;

  close(): Promise<void>;
}
