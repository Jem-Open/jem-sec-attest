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

import type { StorageAdapter } from "@/storage/adapter.js";
import { SessionRepository, VersionConflictError } from "@/training/session-repository.js";
import type { TrainingModule, TrainingSession } from "@/training/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";
const TENANT = "tenant-abc";

function createMockStorage(): StorageAdapter {
  // The tx context delegates to the same vi.fn() instances on the storage object
  // so that tests can set up expectations on storage.findById / storage.update
  // and have them honoured when the repository calls tx.findById / tx.update
  // inside a transaction callback.
  const storage: StorageAdapter = {
    initialize: vi.fn(),
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

function makeSession(overrides?: Partial<TrainingSession>): TrainingSession {
  return {
    id: "sess-001",
    tenantId: TENANT,
    employeeId: "emp-1",
    roleProfileId: "rp-1",
    roleProfileVersion: 1,
    configHash: "abc123",
    appVersion: "1.0.0",
    status: "in-progress",
    attemptNumber: 1,
    curriculum: {
      modules: [{ title: "Module 1", topicArea: "Security", jobExpectationIndices: [0] }],
      generatedAt: ISO,
    },
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
    ...overrides,
  };
}

function makeModule(overrides?: Partial<TrainingModule>): TrainingModule {
  return {
    id: "mod-001",
    tenantId: TENANT,
    sessionId: "sess-001",
    moduleIndex: 0,
    title: "Module 1",
    topicArea: "Security",
    jobExpectationIndices: [0],
    status: "locked",
    content: null,
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionRepository", () => {
  let storage: StorageAdapter;
  let repo: SessionRepository;

  beforeEach(() => {
    storage = createMockStorage();
    repo = new SessionRepository(storage);
  });

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------

  describe("createSession", () => {
    it("calls storage.create with the sessions collection and correct tenantId", async () => {
      const sessionData = makeSession({ id: undefined as unknown as string });
      const { id, ...data } = sessionData;
      void id;

      const created = makeSession();
      vi.mocked(storage.create).mockResolvedValueOnce(
        created as unknown as typeof created & { id: string },
      );

      await repo.createSession(TENANT, data as Omit<TrainingSession, "id">);

      expect(storage.create).toHaveBeenCalledWith(TENANT, "training_sessions", data);
    });

    it("returns the session with id assigned by the storage layer", async () => {
      const data = makeSession() as Omit<TrainingSession, "id">;
      const created = makeSession({ id: "new-id" });
      vi.mocked(storage.create).mockResolvedValueOnce(
        created as unknown as typeof created & { id: string },
      );

      const result = await repo.createSession(TENANT, data);

      expect(result.id).toBe("new-id");
    });
  });

  // -------------------------------------------------------------------------
  // findActiveSession
  // -------------------------------------------------------------------------

  describe("findActiveSession", () => {
    it("returns an in-progress session for the employee", async () => {
      const session = makeSession({ status: "in-progress" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([session]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toEqual(session);
      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_sessions", {
        where: { employeeId: "emp-1" },
      });
    });

    it("returns null when no sessions exist for the employee", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toBeNull();
    });

    it("filters out sessions with status 'passed'", async () => {
      const passedSession = makeSession({ status: "passed" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([passedSession]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toBeNull();
    });

    it("filters out sessions with status 'exhausted'", async () => {
      const exhaustedSession = makeSession({ status: "exhausted" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([exhaustedSession]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toBeNull();
    });

    it("filters out sessions with status 'abandoned'", async () => {
      const abandonedSession = makeSession({ status: "abandoned" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([abandonedSession]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toBeNull();
    });

    it("returns the first non-terminal session when mixed statuses exist", async () => {
      const passedSession = makeSession({ id: "s1", status: "passed" });
      const activeSession = makeSession({ id: "s2", status: "in-progress" });
      const abandonedSession = makeSession({ id: "s3", status: "abandoned" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([
        passedSession,
        activeSession,
        abandonedSession,
      ]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toEqual(activeSession);
    });

    it("returns an evaluating session as active", async () => {
      const session = makeSession({ status: "evaluating" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([session]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toEqual(session);
    });

    it("returns a curriculum-generating session as active", async () => {
      const session = makeSession({ status: "curriculum-generating" });
      vi.mocked(storage.findMany).mockResolvedValueOnce([session]);

      const result = await repo.findActiveSession(TENANT, "emp-1");

      expect(result).toEqual(session);
    });

    it("passes correct tenantId to storage", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findActiveSession("other-tenant", "emp-1");

      expect(storage.findMany).toHaveBeenCalledWith(
        "other-tenant",
        "training_sessions",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findSessionHistory
  // -------------------------------------------------------------------------

  describe("findSessionHistory", () => {
    it("returns sessions ordered by createdAt desc", async () => {
      const sessions = [makeSession({ id: "s2" }), makeSession({ id: "s1" })];
      vi.mocked(storage.findMany).mockResolvedValueOnce(sessions);

      const result = await repo.findSessionHistory(TENANT, "emp-1");

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_sessions", {
        where: { employeeId: "emp-1" },
        orderBy: [{ field: "createdAt", direction: "desc" }],
      });
      expect(result).toEqual(sessions);
    });

    it("respects limit option", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findSessionHistory(TENANT, "emp-1", { limit: 5 });

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_sessions", {
        where: { employeeId: "emp-1" },
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: 5,
      });
    });

    it("respects offset option", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findSessionHistory(TENANT, "emp-1", { offset: 10 });

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_sessions", {
        where: { employeeId: "emp-1" },
        orderBy: [{ field: "createdAt", direction: "desc" }],
        offset: 10,
      });
    });

    it("respects both limit and offset options together", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findSessionHistory(TENANT, "emp-1", { limit: 3, offset: 6 });

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_sessions", {
        where: { employeeId: "emp-1" },
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: 3,
        offset: 6,
      });
    });

    it("passes correct tenantId to storage", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findSessionHistory("other-tenant", "emp-1");

      expect(storage.findMany).toHaveBeenCalledWith(
        "other-tenant",
        "training_sessions",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateSession
  // -------------------------------------------------------------------------

  describe("updateSession", () => {
    it("updates the session when version matches", async () => {
      const existing = makeSession({ version: 2 });
      const updated = makeSession({ version: 3, status: "evaluating" });

      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce(updated);

      const result = await repo.updateSession(TENANT, "sess-001", { status: "evaluating" }, 2);

      expect(result).toEqual(updated);
    });

    it("calls storage.findById with correct tenantId, collection, and id", async () => {
      const existing = makeSession({ version: 1 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce(existing);

      await repo.updateSession(TENANT, "sess-001", {}, 1);

      expect(storage.findById).toHaveBeenCalledWith(TENANT, "training_sessions", "sess-001");
    });

    it("calls storage.update with incremented version and updated updatedAt", async () => {
      const existing = makeSession({ version: 1 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce({ ...existing, version: 2 });

      await repo.updateSession(TENANT, "sess-001", { status: "evaluating" }, 1);

      expect(storage.update).toHaveBeenCalledWith(
        TENANT,
        "training_sessions",
        "sess-001",
        expect.objectContaining({
          status: "evaluating",
          version: 2,
          updatedAt: expect.any(String) as string,
        }),
      );
    });

    it("throws VersionConflictError when version does not match", async () => {
      const existing = makeSession({ version: 3 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);

      await expect(repo.updateSession(TENANT, "sess-001", {}, 1)).rejects.toThrow(
        VersionConflictError,
      );
    });

    it("VersionConflictError message contains the session id", async () => {
      const existing = makeSession({ version: 5 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);

      await expect(repo.updateSession(TENANT, "sess-001", {}, 2)).rejects.toThrow("sess-001");
    });

    it("passes correct tenantId to both findById and update", async () => {
      const existing = makeSession({ version: 1 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce(existing);

      await repo.updateSession("other-tenant", "sess-001", {}, 1);

      expect(storage.findById).toHaveBeenCalledWith(
        "other-tenant",
        expect.any(String),
        expect.any(String),
      );
      expect(storage.update).toHaveBeenCalledWith(
        "other-tenant",
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // createModules
  // -------------------------------------------------------------------------

  describe("createModules", () => {
    it("calls storage.create once per module", async () => {
      const mod1 = makeModule({ id: undefined as unknown as string, moduleIndex: 0 });
      const mod2 = makeModule({ id: undefined as unknown as string, moduleIndex: 1 });
      const { id: _id1, ...data1 } = mod1;
      const { id: _id2, ...data2 } = mod2;

      vi.mocked(storage.create)
        .mockResolvedValueOnce({ ...data1, id: "m1" } as unknown as ReturnType<
          StorageAdapter["create"]
        > extends Promise<infer U>
          ? U
          : never)
        .mockResolvedValueOnce({ ...data2, id: "m2" } as unknown as ReturnType<
          StorageAdapter["create"]
        > extends Promise<infer U>
          ? U
          : never);

      const result = await repo.createModules(TENANT, [
        data1 as Omit<TrainingModule, "id">,
        data2 as Omit<TrainingModule, "id">,
      ]);

      expect(storage.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it("calls storage.create with the modules collection", async () => {
      const mod = makeModule();
      const { id: _id, ...data } = mod;
      vi.mocked(storage.create).mockResolvedValueOnce({
        ...data,
        id: "m1",
      } as unknown as ReturnType<StorageAdapter["create"]> extends Promise<infer U> ? U : never);

      await repo.createModules(TENANT, [data as Omit<TrainingModule, "id">]);

      expect(storage.create).toHaveBeenCalledWith(TENANT, "training_modules", data);
    });

    it("returns modules with ids assigned by the storage layer", async () => {
      const mod = makeModule();
      const { id: _id, ...data } = mod;
      const created = { ...data, id: "generated-id" };
      vi.mocked(storage.create).mockResolvedValueOnce(
        created as unknown as ReturnType<StorageAdapter["create"]> extends Promise<infer U>
          ? U
          : never,
      );

      const result = await repo.createModules(TENANT, [data as Omit<TrainingModule, "id">]);

      expect(result[0]?.id).toBe("generated-id");
    });

    it("returns an empty array when given an empty input", async () => {
      const result = await repo.createModules(TENANT, []);

      expect(storage.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("passes correct tenantId to storage for each module", async () => {
      const mod = makeModule();
      const { id: _id, ...data } = mod;
      vi.mocked(storage.create).mockResolvedValueOnce({
        ...data,
        id: "m1",
      } as unknown as ReturnType<StorageAdapter["create"]> extends Promise<infer U> ? U : never);

      await repo.createModules("other-tenant", [data as Omit<TrainingModule, "id">]);

      expect(storage.create).toHaveBeenCalledWith(
        "other-tenant",
        "training_modules",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findModulesBySession
  // -------------------------------------------------------------------------

  describe("findModulesBySession", () => {
    it("queries the modules collection filtered by sessionId", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findModulesBySession(TENANT, "sess-001");

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_modules", {
        where: { sessionId: "sess-001" },
        orderBy: [{ field: "moduleIndex", direction: "asc" }],
      });
    });

    it("returns all modules for the session ordered by moduleIndex asc", async () => {
      const m0 = makeModule({ moduleIndex: 0 });
      const m1 = makeModule({ moduleIndex: 1 });
      vi.mocked(storage.findMany).mockResolvedValueOnce([m0, m1]);

      const result = await repo.findModulesBySession(TENANT, "sess-001");

      expect(result).toEqual([m0, m1]);
    });

    it("returns an empty array when no modules exist", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      const result = await repo.findModulesBySession(TENANT, "sess-999");

      expect(result).toEqual([]);
    });

    it("passes correct tenantId to storage", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findModulesBySession("other-tenant", "sess-001");

      expect(storage.findMany).toHaveBeenCalledWith(
        "other-tenant",
        "training_modules",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // findModule
  // -------------------------------------------------------------------------

  describe("findModule", () => {
    it("returns the module matching the given sessionId and moduleIndex", async () => {
      const m = makeModule({ sessionId: "sess-001", moduleIndex: 2 });
      vi.mocked(storage.findMany).mockResolvedValueOnce([m]);

      const result = await repo.findModule(TENANT, "sess-001", 2);

      expect(result).toEqual(m);
    });

    it("queries with both sessionId and moduleIndex in the where clause", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findModule(TENANT, "sess-001", 3);

      expect(storage.findMany).toHaveBeenCalledWith(TENANT, "training_modules", {
        where: { sessionId: "sess-001", moduleIndex: 3 },
        limit: 1,
      });
    });

    it("returns null when no module matches", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      const result = await repo.findModule(TENANT, "sess-001", 99);

      expect(result).toBeNull();
    });

    it("passes correct tenantId to storage", async () => {
      vi.mocked(storage.findMany).mockResolvedValueOnce([]);

      await repo.findModule("other-tenant", "sess-001", 0);

      expect(storage.findMany).toHaveBeenCalledWith(
        "other-tenant",
        "training_modules",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateModule
  // -------------------------------------------------------------------------

  describe("updateModule", () => {
    it("updates the module when version matches", async () => {
      const existing = makeModule({ version: 1 });
      const updated = makeModule({ version: 2, status: "learning" });

      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce(updated);

      const result = await repo.updateModule(TENANT, "mod-001", { status: "learning" }, 1);

      expect(result).toEqual(updated);
    });

    it("calls storage.findById with the modules collection", async () => {
      const existing = makeModule({ version: 1 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce(existing);

      await repo.updateModule(TENANT, "mod-001", {}, 1);

      expect(storage.findById).toHaveBeenCalledWith(TENANT, "training_modules", "mod-001");
    });

    it("calls storage.update with incremented version and updated updatedAt", async () => {
      const existing = makeModule({ version: 2 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce({ ...existing, version: 3 });

      await repo.updateModule(TENANT, "mod-001", { status: "scenario-active" }, 2);

      expect(storage.update).toHaveBeenCalledWith(
        TENANT,
        "training_modules",
        "mod-001",
        expect.objectContaining({
          status: "scenario-active",
          version: 3,
          updatedAt: expect.any(String) as string,
        }),
      );
    });

    it("throws VersionConflictError when version does not match", async () => {
      const existing = makeModule({ version: 4 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);

      await expect(repo.updateModule(TENANT, "mod-001", {}, 2)).rejects.toThrow(
        VersionConflictError,
      );
    });

    it("VersionConflictError message contains the module id", async () => {
      const existing = makeModule({ version: 4 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);

      await expect(repo.updateModule(TENANT, "mod-001", {}, 1)).rejects.toThrow("mod-001");
    });

    it("passes correct tenantId to both findById and update", async () => {
      const existing = makeModule({ version: 1 });
      vi.mocked(storage.findById).mockResolvedValueOnce(existing);
      vi.mocked(storage.update).mockResolvedValueOnce(existing);

      await repo.updateModule("other-tenant", "mod-001", {}, 1);

      expect(storage.findById).toHaveBeenCalledWith(
        "other-tenant",
        expect.any(String),
        expect.any(String),
      );
      expect(storage.update).toHaveBeenCalledWith(
        "other-tenant",
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // VersionConflictError
  // -------------------------------------------------------------------------

  describe("VersionConflictError", () => {
    it("has name 'VersionConflictError'", () => {
      const err = new VersionConflictError("TrainingSession", "sess-001");
      expect(err.name).toBe("VersionConflictError");
    });

    it("is an instance of Error", () => {
      const err = new VersionConflictError("TrainingModule", "mod-001");
      expect(err).toBeInstanceOf(Error);
    });

    it("message contains the entity and id", () => {
      const err = new VersionConflictError("TrainingSession", "sess-xyz");
      expect(err.message).toContain("TrainingSession");
      expect(err.message).toContain("sess-xyz");
    });
  });
});
