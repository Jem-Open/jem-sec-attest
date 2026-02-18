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
import { EmployeeRepository } from "../../../src/auth/employee-repository";
import type { Employee } from "../../../src/auth/types";
import type { StorageAdapter } from "../../../src/storage/adapter";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-001",
    tenantId: "acme-corp",
    idpSubject: "sub-abc123",
    email: "alice@acme.com",
    displayName: "Alice Example",
    firstSignInAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

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

describe("EmployeeRepository", () => {
  describe("findByIdpSubject", () => {
    let storage: StorageAdapter;
    let repo: EmployeeRepository;

    beforeEach(() => {
      storage = makeStorage();
      repo = new EmployeeRepository(storage);
    });

    it("returns the employee when findMany returns a match", async () => {
      const employee = makeEmployee();
      vi.mocked(storage.findMany).mockResolvedValue([employee]);

      const result = await repo.findByIdpSubject("acme-corp", "sub-abc123");

      expect(result).toEqual(employee);
    });

    it("returns null when findMany returns an empty array", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);

      const result = await repo.findByIdpSubject("acme-corp", "sub-abc123");

      expect(result).toBeNull();
    });

    it("queries the employees collection with the correct where clause", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);

      await repo.findByIdpSubject("acme-corp", "sub-abc123");

      expect(storage.findMany).toHaveBeenCalledWith("acme-corp", "employees", {
        where: { idpSubject: "sub-abc123" },
      });
    });

    it("passes the provided tenantId to storage.findMany", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);

      await repo.findByIdpSubject("globex-inc", "sub-xyz789");

      expect(storage.findMany).toHaveBeenCalledWith("globex-inc", "employees", expect.anything());
    });
  });

  describe("upsertFromClaims", () => {
    let storage: StorageAdapter;
    let repo: EmployeeRepository;
    const tenantId = "acme-corp";
    const claims = { sub: "sub-abc123", email: "alice@acme.com", name: "Alice Example" };

    beforeEach(() => {
      storage = makeStorage();
      repo = new EmployeeRepository(storage);
    });

    it("calls storage.create when no existing employee is found", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      const created = makeEmployee();
      vi.mocked(storage.create).mockResolvedValue(created as unknown as Record<string, unknown>);

      await repo.upsertFromClaims(tenantId, claims);

      expect(storage.create).toHaveBeenCalledOnce();
      expect(storage.update).not.toHaveBeenCalled();
    });

    it("sets firstSignInAt and lastSignInAt to ISO strings on creation", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      const created = makeEmployee();
      vi.mocked(storage.create).mockResolvedValue(created as unknown as Record<string, unknown>);

      await repo.upsertFromClaims(tenantId, claims);

      const createPayload = vi.mocked(storage.create).mock.calls[0][2] as Record<string, unknown>;
      expect(typeof createPayload.firstSignInAt).toBe("string");
      expect(typeof createPayload.lastSignInAt).toBe("string");
      expect(() => new Date(createPayload.firstSignInAt as string)).not.toThrow();
      expect(() => new Date(createPayload.lastSignInAt as string)).not.toThrow();
      // Both timestamps should be identical at creation time
      expect(createPayload.firstSignInAt).toBe(createPayload.lastSignInAt);
    });

    it("calls storage.update when an existing employee is found", async () => {
      const existing = makeEmployee();
      vi.mocked(storage.findMany).mockResolvedValue([existing]);
      const updated = makeEmployee({ email: "alice-new@acme.com", displayName: "Alice Updated" });
      vi.mocked(storage.update).mockResolvedValue(updated);

      await repo.upsertFromClaims(tenantId, {
        sub: "sub-abc123",
        email: "alice-new@acme.com",
        name: "Alice Updated",
      });

      expect(storage.update).toHaveBeenCalledOnce();
      expect(storage.create).not.toHaveBeenCalled();
    });

    it("updates email, displayName, and lastSignInAt on update", async () => {
      const existing = makeEmployee();
      vi.mocked(storage.findMany).mockResolvedValue([existing]);
      vi.mocked(storage.update).mockResolvedValue(existing);

      await repo.upsertFromClaims(tenantId, {
        sub: "sub-abc123",
        email: "alice-new@acme.com",
        name: "Alice Updated",
      });

      const updatePayload = vi.mocked(storage.update).mock.calls[0][3] as Record<string, unknown>;
      expect(updatePayload).toMatchObject({
        email: "alice-new@acme.com",
        displayName: "Alice Updated",
      });
      expect(typeof updatePayload.lastSignInAt).toBe("string");
      expect(() => new Date(updatePayload.lastSignInAt as string)).not.toThrow();
    });

    it("does not include firstSignInAt in the update payload", async () => {
      const existing = makeEmployee();
      vi.mocked(storage.findMany).mockResolvedValue([existing]);
      vi.mocked(storage.update).mockResolvedValue(existing);

      await repo.upsertFromClaims(tenantId, claims);

      const updatePayload = vi.mocked(storage.update).mock.calls[0][3] as Record<string, unknown>;
      expect(updatePayload).not.toHaveProperty("firstSignInAt");
    });

    it("wraps the operation in a transaction using the provided tenantId", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      const created = makeEmployee();
      vi.mocked(storage.create).mockResolvedValue(created as unknown as Record<string, unknown>);

      await repo.upsertFromClaims(tenantId, claims);

      expect(storage.transaction).toHaveBeenCalledOnce();
      expect(storage.transaction).toHaveBeenCalledWith(tenantId, expect.any(Function));
      // Verify the transaction callback was actually invoked (inner operations ran)
      expect(storage.findMany).toHaveBeenCalled();
    });

    it("returns the created employee when no existing record is found", async () => {
      const created = makeEmployee();
      vi.mocked(storage.findMany).mockResolvedValue([]);
      vi.mocked(storage.create).mockResolvedValue(created as unknown as Record<string, unknown>);

      const result = await repo.upsertFromClaims(tenantId, claims);

      expect(result).toEqual(created);
    });

    it("returns the updated employee when an existing record is found", async () => {
      const existing = makeEmployee();
      const updated = makeEmployee({
        email: "alice-new@acme.com",
        lastSignInAt: "2026-02-18T12:00:00.000Z",
      });
      vi.mocked(storage.findMany).mockResolvedValue([existing]);
      vi.mocked(storage.update).mockResolvedValue(updated);

      const result = await repo.upsertFromClaims(tenantId, {
        sub: "sub-abc123",
        email: "alice-new@acme.com",
        name: "Alice Example",
      });

      expect(result).toEqual(updated);
    });

    it("calls storage.update with the existing employee id", async () => {
      const existing = makeEmployee({ id: "emp-999" });
      vi.mocked(storage.findMany).mockResolvedValue([existing]);
      vi.mocked(storage.update).mockResolvedValue(existing);

      await repo.upsertFromClaims(tenantId, claims);

      expect(storage.update).toHaveBeenCalledWith(
        tenantId,
        "employees",
        "emp-999",
        expect.anything(),
      );
    });

    it("includes tenantId and idpSubject in the create payload", async () => {
      vi.mocked(storage.findMany).mockResolvedValue([]);
      const created = makeEmployee();
      vi.mocked(storage.create).mockResolvedValue(created as unknown as Record<string, unknown>);

      await repo.upsertFromClaims(tenantId, claims);

      const createPayload = vi.mocked(storage.create).mock.calls[0][2] as Record<string, unknown>;
      expect(createPayload.tenantId).toBe(tenantId);
      expect(createPayload.idpSubject).toBe(claims.sub);
    });
  });
});
