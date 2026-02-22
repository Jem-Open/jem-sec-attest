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

import type { StorageAdapter } from "@/storage/adapter";
import type { ConfigSnapshot, Tenant } from "@/tenant/types";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockStorage, mockGetSnapshot } = vi.hoisted(() => {
  const mockStorage: Record<string, ReturnType<typeof vi.fn>> = {
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation((_t: string, fn: () => unknown) => fn()),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
    close: vi.fn(),
  };
  const mockGetSnapshot = vi.fn();
  return { mockStorage, mockGetSnapshot };
});

vi.mock("@/config/index", () => ({
  getSnapshot: mockGetSnapshot,
}));

import { TranscriptPurger } from "@/retention/transcript-purger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTenant(id: string, retentionDays: number | null | undefined): Tenant {
  return {
    id,
    name: `Tenant ${id}`,
    hostnames: [`${id}.example.com`],
    emailDomains: [`${id}.com`],
    settings: {
      retention: {
        days: 90,
        transcripts: {
          enabled: true,
          retentionDays: retentionDays ?? null,
        },
      },
    } as Tenant["settings"],
  };
}

function makeSnapshot(tenants: Tenant[]): ConfigSnapshot {
  const tenantsMap = new Map<string, Tenant>();
  for (const t of tenants) {
    tenantsMap.set(t.id, t);
  }
  return {
    tenants: tenantsMap,
    hostnameIndex: new Map(),
    emailDomainIndex: new Map(),
    configHash: "test-hash",
    loadedAt: new Date(),
  };
}

/** Returns an ISO date string N days in the past. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TranscriptPurger", () => {
  let purger: TranscriptPurger;

  beforeEach(() => {
    vi.clearAllMocks();
    purger = new TranscriptPurger(mockStorage as unknown as StorageAdapter);
  });

  // -------------------------------------------------------------------------
  // purge()
  // -------------------------------------------------------------------------

  describe("purge()", () => {
    it("skips tenant with retentionDays: null and returns 0 processed", async () => {
      const tenant = makeTenant("acme", null);
      mockGetSnapshot.mockReturnValue(makeSnapshot([tenant]));

      const result = await purger.purge("acme");

      expect(result).toEqual({
        tenantId: "acme",
        modulesProcessed: 0,
        modulesPurged: 0,
        modulesSkipped: 0,
      });
      // Storage should never be queried
      expect(mockStorage.findMany).not.toHaveBeenCalled();
    });

    it("skips modules whose parent session is non-terminal (active)", async () => {
      const tenant = makeTenant("acme", 30);
      mockGetSnapshot.mockReturnValue(makeSnapshot([tenant]));

      mockStorage.findMany.mockResolvedValue([
        {
          id: "mod-1",
          sessionId: "sess-1",
          updatedAt: daysAgo(60),
          scenarioResponses: [{ freeTextResponse: "answer", llmRationale: "reason" }],
          quizAnswers: [],
        },
      ]);

      // Session is in "in_progress" state (non-terminal)
      mockStorage.findById.mockResolvedValue({ id: "sess-1", status: "in_progress" });

      const result = await purger.purge("acme");

      expect(result.modulesProcessed).toBe(1);
      expect(result.modulesSkipped).toBe(1);
      expect(result.modulesPurged).toBe(0);
      expect(mockStorage.update).not.toHaveBeenCalled();
    });

    it("nulls freeTextResponse and llmRationale while preserving other fields", async () => {
      const tenant = makeTenant("acme", 30);
      mockGetSnapshot.mockReturnValue(makeSnapshot([tenant]));

      mockStorage.findMany.mockResolvedValue([
        {
          id: "mod-1",
          sessionId: "sess-1",
          updatedAt: daysAgo(60),
          scenarioResponses: [
            {
              freeTextResponse: "my answer",
              llmRationale: "llm reasoning",
              score: 0.85,
              questionId: "q1",
            },
          ],
          quizAnswers: [
            {
              freeTextResponse: "quiz answer",
              llmRationale: "quiz reasoning",
              score: 1.0,
              choiceId: "c1",
            },
          ],
        },
      ]);

      mockStorage.findById.mockResolvedValue({ id: "sess-1", status: "passed" });
      mockStorage.update.mockResolvedValue({});

      await purger.purge("acme");

      expect(mockStorage.update).toHaveBeenCalledOnce();
      const [tenantId, collection, id, data] = mockStorage.update.mock.calls[0];
      expect(tenantId).toBe("acme");
      expect(collection).toBe("training_modules");
      expect(id).toBe("mod-1");

      // freeTextResponse and llmRationale should be null (per retention contract)
      expect(data.scenarioResponses[0].freeTextResponse).toBeNull();
      expect(data.scenarioResponses[0].llmRationale).toBeNull();
      // Other fields preserved
      expect(data.scenarioResponses[0].score).toBe(0.85);
      expect(data.scenarioResponses[0].questionId).toBe("q1");

      expect(data.quizAnswers[0].freeTextResponse).toBeNull();
      expect(data.quizAnswers[0].llmRationale).toBeNull();
      expect(data.quizAnswers[0].score).toBe(1.0);
      expect(data.quizAnswers[0].choiceId).toBe("c1");
    });

    it("returns accurate PurgeResult counts", async () => {
      const tenant = makeTenant("acme", 30);
      mockGetSnapshot.mockReturnValue(makeSnapshot([tenant]));

      mockStorage.findMany.mockResolvedValue([
        // Module 1: terminal session, has content -> purged
        {
          id: "mod-1",
          sessionId: "sess-1",
          updatedAt: daysAgo(60),
          scenarioResponses: [{ freeTextResponse: "text" }],
          quizAnswers: [],
        },
        // Module 2: non-terminal session -> skipped
        {
          id: "mod-2",
          sessionId: "sess-2",
          updatedAt: daysAgo(60),
          scenarioResponses: [{ freeTextResponse: "text" }],
          quizAnswers: [],
        },
        // Module 3: terminal session, has content -> purged
        {
          id: "mod-3",
          sessionId: "sess-3",
          updatedAt: daysAgo(45),
          scenarioResponses: [],
          quizAnswers: [{ freeTextResponse: "quiz text", llmRationale: "reason" }],
        },
        // Module 4: not past cutoff -> not processed (updatedAt is recent)
        {
          id: "mod-4",
          sessionId: "sess-4",
          updatedAt: daysAgo(5),
          scenarioResponses: [{ freeTextResponse: "recent" }],
          quizAnswers: [],
        },
      ]);

      mockStorage.findById.mockImplementation(
        (_tenantId: string, _collection: string, id: string) => {
          if (id === "sess-1") return Promise.resolve({ id: "sess-1", status: "passed" });
          if (id === "sess-2") return Promise.resolve({ id: "sess-2", status: "in_progress" });
          if (id === "sess-3") return Promise.resolve({ id: "sess-3", status: "exhausted" });
          return Promise.resolve(null);
        },
      );
      mockStorage.update.mockResolvedValue({});

      const result = await purger.purge("acme");

      // mod-1, mod-2, mod-3 are past cutoff -> processed = 3
      // mod-2 is non-terminal -> skipped = 1
      // mod-1, mod-3 are terminal with content -> purged = 2
      expect(result).toEqual({
        tenantId: "acme",
        modulesProcessed: 3,
        modulesPurged: 2,
        modulesSkipped: 1,
      });
    });

    it("skips modules with no free-text content", async () => {
      const tenant = makeTenant("acme", 30);
      mockGetSnapshot.mockReturnValue(makeSnapshot([tenant]));

      mockStorage.findMany.mockResolvedValue([
        {
          id: "mod-1",
          sessionId: "sess-1",
          updatedAt: daysAgo(60),
          scenarioResponses: [{ score: 0.9, questionId: "q1" }],
          quizAnswers: [{ score: 1.0, choiceId: "c1" }],
        },
      ]);

      mockStorage.findById.mockResolvedValue({ id: "sess-1", status: "abandoned" });

      const result = await purger.purge("acme");

      // Module is processed and session is terminal, but no free-text content
      // so it is neither purged nor skipped (just falls through)
      expect(result.modulesProcessed).toBe(1);
      expect(result.modulesPurged).toBe(0);
      expect(result.modulesSkipped).toBe(0);
      expect(mockStorage.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // purgeAll()
  // -------------------------------------------------------------------------

  describe("purgeAll()", () => {
    it("iterates over all tenants and returns results for each", async () => {
      const tenantA = makeTenant("alpha", 30);
      const tenantB = makeTenant("beta", null);
      const tenantC = makeTenant("gamma", 60);
      mockGetSnapshot.mockReturnValue(makeSnapshot([tenantA, tenantB, tenantC]));

      // Alpha has one module to purge
      mockStorage.findMany.mockImplementation((tenantId: string) => {
        if (tenantId === "alpha") {
          return Promise.resolve([
            {
              id: "mod-a1",
              sessionId: "sess-a1",
              updatedAt: daysAgo(90),
              scenarioResponses: [{ freeTextResponse: "text" }],
              quizAnswers: [],
            },
          ]);
        }
        // gamma has no modules
        return Promise.resolve([]);
      });

      mockStorage.findById.mockResolvedValue({ id: "sess-a1", status: "passed" });
      mockStorage.update.mockResolvedValue({});

      const results = await purger.purgeAll();

      expect(results).toHaveLength(3);

      // alpha: 1 processed, 1 purged
      const alphaResult = results.find((r) => r.tenantId === "alpha");
      expect(alphaResult).toEqual({
        tenantId: "alpha",
        modulesProcessed: 1,
        modulesPurged: 1,
        modulesSkipped: 0,
      });

      // beta: retentionDays is null -> skipped entirely
      const betaResult = results.find((r) => r.tenantId === "beta");
      expect(betaResult).toEqual({
        tenantId: "beta",
        modulesProcessed: 0,
        modulesPurged: 0,
        modulesSkipped: 0,
      });

      // gamma: no modules -> 0 across the board
      const gammaResult = results.find((r) => r.tenantId === "gamma");
      expect(gammaResult).toEqual({
        tenantId: "gamma",
        modulesProcessed: 0,
        modulesPurged: 0,
        modulesSkipped: 0,
      });
    });

    it("returns empty array when snapshot is null", async () => {
      mockGetSnapshot.mockReturnValue(null);

      const results = await purger.purgeAll();

      expect(results).toEqual([]);
    });
  });
});
