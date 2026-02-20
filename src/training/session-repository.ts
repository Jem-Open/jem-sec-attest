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
 * SessionRepository — CRUD for training sessions and modules with
 * optimistic concurrency via version counters.
 */

import type { StorageAdapter } from "../storage/adapter.js";
import type { TrainingModule, TrainingSession } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSIONS_COLLECTION = "training_sessions";
const MODULES_COLLECTION = "training_modules";

/**
 * Terminal session statuses that indicate a session is no longer active.
 * findActiveSession filters these out in application code because the
 * StorageAdapter does not support NOT IN queries.
 */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["passed", "exhausted", "abandoned"]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class VersionConflictError extends Error {
  constructor(entity: string, id: string) {
    super(`Version conflict: ${entity} '${id}' was modified by another request`);
    this.name = "VersionConflictError";
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SessionRepository {
  constructor(private readonly storage: StorageAdapter) {}

  /**
   * Create a new training session record.
   */
  async createSession(
    tenantId: string,
    data: Omit<TrainingSession, "id">,
  ): Promise<TrainingSession> {
    return this.storage.create<Omit<TrainingSession, "id">>(
      tenantId,
      SESSIONS_COLLECTION,
      data,
    ) as Promise<TrainingSession>;
  }

  /**
   * Find the active (non-terminal) session for the given employee.
   * Terminal statuses (passed, exhausted, abandoned) are filtered out
   * in application code because the StorageAdapter does not support NOT IN.
   */
  async findActiveSession(tenantId: string, employeeId: string): Promise<TrainingSession | null> {
    const sessions = await this.storage.findMany<TrainingSession>(tenantId, SESSIONS_COLLECTION, {
      where: { employeeId },
    });

    const active = sessions.find((s) => !TERMINAL_STATUSES.has(s.status));
    return active ?? null;
  }

  /**
   * Return all sessions for an employee ordered by createdAt descending.
   */
  async findSessionHistory(
    tenantId: string,
    employeeId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<TrainingSession[]> {
    return this.storage.findMany<TrainingSession>(tenantId, SESSIONS_COLLECTION, {
      where: { employeeId },
      orderBy: [{ field: "createdAt", direction: "desc" }],
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
    });
  }

  /**
   * Update session fields with optimistic concurrency.
   * Throws VersionConflictError if the current version does not match expectedVersion.
   *
   * The read-check-write sequence is wrapped in a storage transaction so that
   * concurrent callers cannot interleave between the findById and update steps
   * (eliminates the TOCTOU race condition).
   */
  async updateSession(
    tenantId: string,
    sessionId: string,
    data: Partial<TrainingSession>,
    expectedVersion: number,
  ): Promise<TrainingSession> {
    return this.storage.transaction<TrainingSession>(tenantId, async (tx) => {
      const existing = await tx.findById<TrainingSession>(tenantId, SESSIONS_COLLECTION, sessionId);

      if (existing === null || existing.version !== expectedVersion) {
        throw new VersionConflictError("TrainingSession", sessionId);
      }

      return tx.update<TrainingSession>(tenantId, SESSIONS_COLLECTION, sessionId, {
        ...data,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /**
   * Create multiple module records in sequence.
   * Returns the created modules with ids assigned by the storage layer.
   */
  async createModules(
    tenantId: string,
    modules: Array<Omit<TrainingModule, "id">>,
  ): Promise<TrainingModule[]> {
    const results: TrainingModule[] = [];
    for (const mod of modules) {
      const created = await this.storage.create<Omit<TrainingModule, "id">>(
        tenantId,
        MODULES_COLLECTION,
        mod,
      );
      results.push(created as TrainingModule);
    }
    return results;
  }

  /**
   * Return all modules for a session ordered by moduleIndex ascending.
   */
  async findModulesBySession(tenantId: string, sessionId: string): Promise<TrainingModule[]> {
    return this.storage.findMany<TrainingModule>(tenantId, MODULES_COLLECTION, {
      where: { sessionId },
      orderBy: [{ field: "moduleIndex", direction: "asc" }],
    });
  }

  /**
   * Find a specific module by session and zero-based index.
   * Returns null when no matching module exists.
   */
  async findModule(
    tenantId: string,
    sessionId: string,
    moduleIndex: number,
  ): Promise<TrainingModule | null> {
    const results = await this.storage.findMany<TrainingModule>(tenantId, MODULES_COLLECTION, {
      where: { sessionId, moduleIndex },
      limit: 1,
    });
    return results[0] ?? null;
  }

  /**
   * Update module fields with optimistic concurrency.
   * Throws VersionConflictError if the current version does not match expectedVersion.
   *
   * The read-check-write sequence is wrapped in a storage transaction so that
   * concurrent callers cannot interleave between the findById and update steps
   * (eliminates the TOCTOU race condition).
   */
  async updateModule(
    tenantId: string,
    moduleId: string,
    data: Partial<TrainingModule>,
    expectedVersion: number,
  ): Promise<TrainingModule> {
    return this.storage.transaction<TrainingModule>(tenantId, async (tx) => {
      const existing = await tx.findById<TrainingModule>(tenantId, MODULES_COLLECTION, moduleId);

      if (existing === null || existing.version !== expectedVersion) {
        throw new VersionConflictError("TrainingModule", moduleId);
      }

      return tx.update<TrainingModule>(tenantId, MODULES_COLLECTION, moduleId, {
        ...data,
        version: existing.version + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
}
