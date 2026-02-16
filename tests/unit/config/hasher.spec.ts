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

import { describe, expect, it } from "vitest";
import { computeConfigHash } from "../../../src/config/hasher.js";
import type { Tenant } from "../../../src/tenant/types.js";

function makeTenant(overrides: Partial<Tenant> & { id: string; name: string }): Tenant {
  return {
    hostnames: [],
    emailDomains: [],
    settings: {},
    ...overrides,
  };
}

describe("computeConfigHash", () => {
  it("returns a 64-character hex SHA-256 digest", () => {
    const tenants = [makeTenant({ id: "a", name: "A", hostnames: ["a.com"] })];
    const hash = computeConfigHash(tenants);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces deterministic output for the same input", () => {
    const tenants = [
      makeTenant({ id: "a", name: "A", hostnames: ["a.com"] }),
      makeTenant({ id: "b", name: "B", hostnames: ["b.com"] }),
    ];
    const hash1 = computeConfigHash(tenants);
    const hash2 = computeConfigHash(tenants);
    expect(hash1).toBe(hash2);
  });

  it("is independent of key insertion order (deterministic key sort)", () => {
    const tenant1: Tenant = {
      id: "a",
      name: "A",
      hostnames: ["a.com"],
      emailDomains: ["a.org"],
      settings: { branding: { primaryColor: "#000" }, features: { x: true } },
    };
    // Create same tenant with different property insertion order
    const tenant2: Tenant = {
      settings: { features: { x: true }, branding: { primaryColor: "#000" } },
      emailDomains: ["a.org"],
      hostnames: ["a.com"],
      name: "A",
      id: "a",
    };

    const hash1 = computeConfigHash([tenant1]);
    const hash2 = computeConfigHash([tenant2]);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different configs", () => {
    const tenants1 = [makeTenant({ id: "a", name: "A", hostnames: ["a.com"] })];
    const tenants2 = [makeTenant({ id: "a", name: "A", hostnames: ["b.com"] })];
    const hash1 = computeConfigHash(tenants1);
    const hash2 = computeConfigHash(tenants2);
    expect(hash1).not.toBe(hash2);
  });

  it("produces different hash when a setting changes", () => {
    const base = makeTenant({ id: "a", name: "A", hostnames: ["a.com"] });
    const modified = makeTenant({
      id: "a",
      name: "A",
      hostnames: ["a.com"],
      settings: { branding: { primaryColor: "#fff" } },
    });
    const hash1 = computeConfigHash([base]);
    const hash2 = computeConfigHash([modified]);
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty tenant array", () => {
    const hash = computeConfigHash([]);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
