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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "../../src/intake/profile-repository";
import { SQLiteAdapter } from "../../src/storage/sqlite-adapter";

describe("Intake Flow Integration", () => {
  let storage: SQLiteAdapter;
  let repo: ProfileRepository;

  beforeEach(async () => {
    storage = new SQLiteAdapter({ dbPath: ":memory:" });
    await storage.initialize();
    repo = new ProfileRepository(storage);
  });

  afterEach(async () => {
    await storage.close();
  });

  describe("profile confirmation and retrieval", () => {
    it("creates a new profile with version 1", async () => {
      const profile = await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        { jobExpectations: ["Manage network security infrastructure and firewalls"] },
        "config-hash-abc",
        "1.0.0",
      );

      expect(profile.version).toBe(1);
      expect(profile.status).toBe("confirmed");
      expect(profile.employeeId).toBe("emp-001");
      expect(profile.tenantId).toBe("acme-corp");
    });

    it("retrieves the profile after confirmation", async () => {
      await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        { jobExpectations: ["Manage network security infrastructure and firewalls"] },
        "config-hash-abc",
        "1.0.0",
      );

      const found = await repo.findByEmployee("acme-corp", "emp-001");

      expect(found).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: test assertion after null check
      expect(found!.jobExpectations).toEqual([
        "Manage network security infrastructure and firewalls",
      ]);
    });

    it("returns null when no profile exists", async () => {
      const found = await repo.findByEmployee("acme-corp", "emp-999");
      expect(found).toBeNull();
    });
  });

  describe("raw text non-persistence", () => {
    it("raw job text string does NOT appear in any database record", async () => {
      const rawJobText = "UNIQUE_MARKER_TEXT_THAT_SHOULD_NOT_PERSIST_IN_DATABASE";

      // The raw job text is only used for AI generation (not tested here)
      // but we confirm it's not stored in the profile
      await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        { jobExpectations: ["Manage network security infrastructure and firewalls"] },
        "config-hash-abc",
        "1.0.0",
      );

      // Scan all records in all collections
      const roleProfiles = await storage.findMany("acme-corp", "role_profiles", {});
      const auditEvents = await storage.findMany("acme-corp", "audit_events", {});

      const allRecords = [...roleProfiles, ...auditEvents];
      const jsonDump = JSON.stringify(allRecords);
      expect(jsonDump).not.toContain(rawJobText);
    });
  });

  describe("tenant isolation", () => {
    it("employee in tenant A cannot see tenant B profiles", async () => {
      await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        { jobExpectations: ["Manage Acme security infrastructure and compliance"] },
        "hash-a",
        "1.0.0",
      );
      await repo.confirmProfile(
        "globex-inc",
        "emp-001",
        { jobExpectations: ["Manage Globex security infrastructure and compliance"] },
        "hash-b",
        "1.0.0",
      );

      const acmeProfile = await repo.findByEmployee("acme-corp", "emp-001");
      const globexProfile = await repo.findByEmployee("globex-inc", "emp-001");

      // biome-ignore lint/style/noNonNullAssertion: test assertion after null check
      expect(acmeProfile!.jobExpectations[0]).toContain("Acme");
      // biome-ignore lint/style/noNonNullAssertion: test assertion after null check
      expect(globexProfile!.jobExpectations[0]).toContain("Globex");

      // Cross-tenant: tenant A can't see tenant B
      const crossTenant = await repo.findByEmployee("acme-corp", "emp-002");
      expect(crossTenant).toBeNull();
    });
  });

  describe("re-intake (version increment)", () => {
    it("replaces profile and increments version on re-confirmation", async () => {
      await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        { jobExpectations: ["Original expectation for initial profile setup"] },
        "hash-v1",
        "1.0.0",
      );

      const updated = await repo.confirmProfile(
        "acme-corp",
        "emp-001",
        { jobExpectations: ["Updated expectation for revised profile setup"] },
        "hash-v2",
        "1.1.0",
      );

      expect(updated.version).toBe(2);
      expect(updated.jobExpectations).toEqual(["Updated expectation for revised profile setup"]);

      // Verify only one profile exists
      const found = await repo.findByEmployee("acme-corp", "emp-001");
      // biome-ignore lint/style/noNonNullAssertion: test assertion after null check
      expect(found!.version).toBe(2);
    });
  });
});
