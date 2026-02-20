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

import { EvidenceRepository } from "@/evidence/evidence-repository";
import type { TrainingEvidence } from "@/evidence/schemas";
import type { StorageAdapter } from "@/storage/adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = "tenant-abc";
const ISO = "2026-02-20T10:00:00.000Z";
const ISO_EARLIER = "2026-02-19T10:00:00.000Z";
const ISO_LATER = "2026-02-21T10:00:00.000Z";

function createMockStorage(): StorageAdapter {
  const storage: StorageAdapter = {
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi
      .fn()
      .mockImplementation(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          create: (...args: Parameters<StorageAdapter["create"]>) => storage.create(...args),
          findById: (...args: Parameters<StorageAdapter["findById"]>) => storage.findById(...args),
          update: (...args: Parameters<StorageAdapter["update"]>) => storage.update(...args),
          delete: (...args: Parameters<StorageAdapter["delete"]>) => storage.delete(...args),
        }),
      ),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
    close: vi.fn(),
  };
  return storage;
}

function makeEvidence(overrides?: Partial<TrainingEvidence>): TrainingEvidence {
  return {
    id: "ev-001",
    tenantId: TENANT,
    sessionId: "sess-001",
    employeeId: "emp-1",
    schemaVersion: 1,
    evidence: {
      session: {
        sessionId: "sess-001",
        employeeId: "emp-1",
        tenantId: TENANT,
        attemptNumber: 1,
        totalAttempts: 1,
        status: "passed",
        createdAt: ISO,
        completedAt: ISO,
      },
      policyAttestation: {
        configHash: "abc123",
        roleProfileId: "rp-1",
        roleProfileVersion: 1,
        appVersion: "1.0.0",
        passThreshold: 0.7,
        maxAttempts: 3,
      },
      modules: [],
      outcome: {
        aggregateScore: 0.85,
        passed: true,
        passThreshold: 0.7,
        weakAreas: null,
        moduleScores: [],
      },
    },
    contentHash: "hash-abc",
    generatedAt: ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EvidenceRepository", () => {
  let storage: StorageAdapter;
  let repo: EvidenceRepository;

  beforeEach(() => {
    storage = createMockStorage();
    repo = new EvidenceRepository(storage);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("stores evidence in the evidence collection", async () => {
      const evidence = makeEvidence();
      const { id: _id, ...data } = evidence;
      const created = makeEvidence({ id: "ev-new" });

      vi.mocked(storage.create).mockResolvedValueOnce(
        created as unknown as typeof created & { id: string },
      );

      const result = await repo.create(TENANT, data);

      expect(storage.create).toHaveBeenCalledWith(TENANT, "evidence", data);
      expect(result.id).toBe("ev-new");
    });
  });

  // -------------------------------------------------------------------------
  // findBySessionId
  // -------------------------------------------------------------------------

  describe("findBySessionId", () => {
    it("queries by sessionId", async () => {
      const evidence = makeEvidence();
      vi.mocked(storage.findMany).mockResolvedValueOnce([evidence]);

      const result = await repo.findBySessionId(TENANT, "sess-001");

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "evidence", {
        where: { sessionId: "sess-001" },
        limit: 1,
      });
      expect(result).toEqual(evidence);
    });

    it("returns null when no evidence found", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      const result = await repo.findBySessionId(TENANT, "sess-999");

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("delegates to storage.findById", async () => {
      const evidence = makeEvidence();
      vi.mocked(storage.findById).mockResolvedValueOnce(evidence);

      const result = await repo.findById(TENANT, "ev-001");

      expect(storage.findById).toHaveBeenCalledWith(TENANT, "evidence", "ev-001");
      expect(result).toEqual(evidence);
    });
  });

  // -------------------------------------------------------------------------
  // listByTenant
  // -------------------------------------------------------------------------

  describe("listByTenant", () => {
    it("returns paginated results", async () => {
      const items = [makeEvidence({ id: "ev-1" }), makeEvidence({ id: "ev-2" })];
      vi.mocked(storage.findMany).mockResolvedValueOnce(items);

      const result = await repo.listByTenant(TENANT, {
        limit: 10,
        offset: 0,
      });

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "evidence",
        expect.objectContaining({
          orderBy: [{ field: "generatedAt", direction: "desc" }],
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("filters by employeeId", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.listByTenant(TENANT, { employeeId: "emp-42" });

      expect(storage.findMany).toHaveBeenCalledWith(
        TENANT,
        "evidence",
        expect.objectContaining({
          where: { employeeId: "emp-42" },
        }),
      );
    });

    it("post-filters by date range", async () => {
      const early = makeEvidence({ id: "ev-early", generatedAt: ISO_EARLIER });
      const middle = makeEvidence({ id: "ev-middle", generatedAt: ISO });
      const late = makeEvidence({ id: "ev-late", generatedAt: ISO_LATER });
      vi.mocked(storage.findMany).mockResolvedValueOnce([early, middle, late]);

      const result = await repo.listByTenant(TENANT, {
        from: ISO,
        to: ISO,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe("ev-middle");
      expect(result.total).toBe(1);
    });

    it("post-filters by outcome status", async () => {
      const passed = makeEvidence({
        id: "ev-passed",
        evidence: {
          ...makeEvidence().evidence,
          session: {
            ...makeEvidence().evidence.session,
            status: "passed",
          },
        },
      });
      const exhausted = makeEvidence({
        id: "ev-exhausted",
        evidence: {
          ...makeEvidence().evidence,
          session: {
            ...makeEvidence().evidence.session,
            status: "exhausted",
          },
        },
      });
      vi.mocked(storage.findMany).mockResolvedValueOnce([passed, exhausted]);

      const result = await repo.listByTenant(TENANT, {
        outcome: "passed",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe("ev-passed");
      expect(result.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Immutability — no update or delete
  // -------------------------------------------------------------------------

  describe("immutability", () => {
    it("does not expose update method", () => {
      expect((repo as Record<string, unknown>).update).toBeUndefined();
    });

    it("does not expose delete method", () => {
      expect((repo as Record<string, unknown>).delete).toBeUndefined();
    });
  });
});
