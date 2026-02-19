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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileRepository } from "../../../src/intake/profile-repository";
import type { StorageAdapter } from "../../../src/storage/adapter";

function makeStorage(): StorageAdapter {
  return {
    initialize: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi
      .fn()
      .mockImplementation((_tenantId: string, fn: () => Promise<unknown>) => fn()),
    getMetadata: vi.fn(),
    close: vi.fn(),
  } as unknown as StorageAdapter;
}

describe("ProfileRepository", () => {
  let storage: StorageAdapter;
  let repo: ProfileRepository;

  beforeEach(() => {
    storage = makeStorage();
    repo = new ProfileRepository(storage);
  });

  describe("findByEmployee", () => {
    it("returns profile when found", async () => {
      const profile = {
        id: "profile-001",
        tenantId: "acme-corp",
        employeeId: "emp-001",
        jobExpectations: ["Manage network security"],
        status: "confirmed",
        version: 1,
      };
      vi.mocked(storage.findMany).mockResolvedValue([profile]);

      const result = await repo.findByEmployee("acme-corp", "emp-001");

      expect(result).toEqual(profile);
      expect(storage.findMany).toHaveBeenCalledWith("acme-corp", "role_profiles", {
        where: { employeeId: "emp-001" },
      });
    });

    it("returns null when no profile exists", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);

      const result = await repo.findByEmployee("acme-corp", "emp-001");

      expect(result).toBeNull();
    });

    it("enforces tenant isolation in query", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);

      await repo.findByEmployee("globex-inc", "emp-001");

      expect(storage.findMany).toHaveBeenCalledWith(
        "globex-inc",
        "role_profiles",
        expect.anything(),
      );
    });
  });

  describe("confirmProfile", () => {
    const confirmation = {
      jobExpectations: ["Manage network security infrastructure and firewalls"],
    };

    it("creates new profile (version 1) when none exists", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      const created = {
        id: "profile-001",
        tenantId: "acme-corp",
        employeeId: "emp-001",
        ...confirmation,
        status: "confirmed",
        version: 1,
        configHash: "hash-abc",
        appVersion: "1.0.0",
      };
      vi.mocked(storage.create).mockResolvedValue(created as unknown as Record<string, unknown>);

      const result = await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        confirmation,
        "hash-abc",
        "1.0.0",
      );

      expect(storage.create).toHaveBeenCalledOnce();
      expect(storage.update).not.toHaveBeenCalled();
      expect(result.version).toBe(1);
    });

    it("updates existing profile with incremented version", async () => {
      const existing = {
        id: "profile-001",
        tenantId: "acme-corp",
        employeeId: "emp-001",
        jobExpectations: ["Old expectation that was previously set"],
        status: "confirmed",
        version: 1,
      };
      vi.mocked(storage.findMany).mockResolvedValue([existing]);
      const updated = { ...existing, ...confirmation, version: 2 };
      vi.mocked(storage.update).mockResolvedValue(updated);

      const _result = await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        confirmation,
        "hash-abc",
        "1.0.0",
      );

      expect(storage.update).toHaveBeenCalledOnce();
      expect(storage.create).not.toHaveBeenCalled();
    });

    it("wraps operation in a transaction", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      vi.mocked(storage.create).mockResolvedValue({} as unknown as Record<string, unknown>);

      await repo.confirmProfile("acme-corp", "emp-001", confirmation, "hash", "1.0.0");

      expect(storage.transaction).toHaveBeenCalledOnce();
      expect(storage.transaction).toHaveBeenCalledWith("acme-corp", expect.any(Function));
    });

    it("uses the correct tenantId for tenant isolation", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      vi.mocked(storage.create).mockResolvedValue({} as unknown as Record<string, unknown>);

      await repo.confirmProfile("globex-inc", "emp-002", confirmation, "hash", "1.0.0");

      expect(storage.transaction).toHaveBeenCalledWith("globex-inc", expect.any(Function));
    });
  });
});
