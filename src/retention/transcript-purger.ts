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
 * Transcript purger — removes expired free-text content from training modules.
 * FR-012: Automatic purge respecting retention period.
 * FR-013: Audit events are NOT subject to transcript retention.
 * Clarification: Purge skips active sessions; retries on next run.
 */

import { getSnapshot } from "../config/index";
import type { StorageAdapter } from "../storage/adapter";

const TERMINAL_STATUSES = new Set(["passed", "exhausted", "abandoned"]);

export interface PurgeResult {
  tenantId: string;
  modulesProcessed: number;
  modulesPurged: number;
  modulesSkipped: number;
}

interface ModuleRecord {
  id: string;
  sessionId: string;
  scenarioResponses: Array<{
    freeTextResponse?: string;
    llmRationale?: string;
    [key: string]: unknown;
  }>;
  quizAnswers: Array<{
    freeTextResponse?: string;
    llmRationale?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface SessionRecord {
  id: string;
  status: string;
  [key: string]: unknown;
}

export class TranscriptPurger {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async purge(tenantId: string): Promise<PurgeResult> {
    const snapshot = getSnapshot();
    const tenant = snapshot?.tenants.get(tenantId);
    const retentionConfig = tenant?.settings?.retention as
      | { transcripts?: { retentionDays?: number | null } }
      | undefined;
    const retentionDays = retentionConfig?.transcripts?.retentionDays;

    if (retentionDays == null) {
      return { tenantId, modulesProcessed: 0, modulesPurged: 0, modulesSkipped: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    // Find all modules for this tenant
    const modules = await this.storage.findMany<ModuleRecord>(tenantId, "training_modules", {});

    let processed = 0;
    let purged = 0;
    let skipped = 0;

    for (const mod of modules) {
      const updatedAt = (mod as Record<string, unknown>).updatedAt as string | undefined;
      if (!updatedAt || updatedAt > cutoffIso) {
        continue;
      }

      processed++;

      // Check if parent session is terminal
      const session = await this.storage.findById<SessionRecord>(
        tenantId,
        "training_sessions",
        mod.sessionId,
      );

      if (!session || !TERMINAL_STATUSES.has(session.status)) {
        skipped++;
        continue;
      }

      // Check if there is any free-text content to purge
      const hasContent =
        mod.scenarioResponses?.some((r) => r.freeTextResponse || r.llmRationale) ||
        mod.quizAnswers?.some((a) => a.freeTextResponse || a.llmRationale);

      if (!hasContent) {
        continue;
      }

      // Null out free-text fields
      const purgedScenarios = mod.scenarioResponses?.map((r) => ({
        ...r,
        freeTextResponse: null,
        llmRationale: null,
      }));

      const purgedQuizAnswers = mod.quizAnswers?.map((a) => ({
        ...a,
        freeTextResponse: null,
        llmRationale: null,
      }));

      await this.storage.update(tenantId, "training_modules", mod.id, {
        scenarioResponses: purgedScenarios,
        quizAnswers: purgedQuizAnswers,
      });

      purged++;
    }

    return {
      tenantId,
      modulesProcessed: processed,
      modulesPurged: purged,
      modulesSkipped: skipped,
    };
  }

  async purgeAll(): Promise<PurgeResult[]> {
    const snapshot = getSnapshot();
    if (!snapshot) {
      return [];
    }

    const results: PurgeResult[] = [];
    for (const tenantId of snapshot.tenants.keys()) {
      const result = await this.purge(tenantId);
      results.push(result);
    }

    return results;
  }
}
