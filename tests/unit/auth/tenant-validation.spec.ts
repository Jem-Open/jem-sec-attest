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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateEmailDomainForTenant,
  validateTenantSlug,
} from "../../../src/auth/tenant-validation";
import type { ConfigSnapshot, Tenant } from "../../../src/tenant/types";

// Mock the config module's getSnapshot
vi.mock("../../../src/config/index", () => ({
  getSnapshot: vi.fn(),
}));

import { getSnapshot } from "../../../src/config/index";

const mockedGetSnapshot = vi.mocked(getSnapshot);

function makeTenant(overrides: Partial<Tenant> & { id: string; name: string }): Tenant {
  return {
    hostnames: [],
    emailDomains: [],
    settings: {},
    ...overrides,
  };
}

function makeSnapshot(tenants: Tenant[]): ConfigSnapshot {
  const tenantsMap = new Map<string, Tenant>();
  const hostnameIndex = new Map<string, string>();
  const emailDomainIndex = new Map<string, string>();

  for (const tenant of tenants) {
    tenantsMap.set(tenant.id, tenant);
    for (const hostname of tenant.hostnames) {
      hostnameIndex.set(hostname.toLowerCase(), tenant.id);
    }
    for (const domain of tenant.emailDomains) {
      emailDomainIndex.set(domain.toLowerCase(), tenant.id);
    }
  }

  return {
    tenants: tenantsMap,
    hostnameIndex,
    emailDomainIndex,
    configHash: "test-hash",
    loadedAt: new Date(),
  };
}

describe("validateTenantSlug", () => {
  const acme = makeTenant({
    id: "acme-corp",
    name: "Acme Corp",
    hostnames: ["acme.example.com"],
    emailDomains: ["acme.com"],
  });

  const globex = makeTenant({
    id: "globex-inc",
    name: "Globex Inc",
    hostnames: ["globex.example.com"],
    emailDomains: ["globex.com"],
  });

  beforeEach(() => {
    mockedGetSnapshot.mockReturnValue(makeSnapshot([acme, globex]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns valid result for a known tenant slug", () => {
    const result = validateTenantSlug("acme-corp");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.tenant.id).toBe("acme-corp");
      expect(result.tenant.name).toBe("Acme Corp");
    }
  });

  it("returns valid result for another known tenant slug", () => {
    const result = validateTenantSlug("globex-inc");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.tenant.id).toBe("globex-inc");
    }
  });

  it("returns failure for an unknown tenant slug", () => {
    const result = validateTenantSlug("unknown-corp");
    expect(result.valid).toBe(false);
  });

  it("returns failure for an empty slug", () => {
    const result = validateTenantSlug("");
    expect(result.valid).toBe(false);
  });

  it("returns failure when no config snapshot is loaded", () => {
    mockedGetSnapshot.mockReturnValue(null);
    const result = validateTenantSlug("acme-corp");
    expect(result.valid).toBe(false);
  });

  it("does not leak tenant existence info — failure result is identical regardless of reason", () => {
    const noSnapshot = (() => {
      mockedGetSnapshot.mockReturnValue(null);
      return validateTenantSlug("acme-corp");
    })();

    mockedGetSnapshot.mockReturnValue(makeSnapshot([acme, globex]));
    const unknownSlug = validateTenantSlug("unknown-corp");

    // Both failures have the same shape — no way to distinguish
    expect(noSnapshot).toEqual({ valid: false });
    expect(unknownSlug).toEqual({ valid: false });
  });
});

describe("validateEmailDomainForTenant", () => {
  it("accepts matching email domain", () => {
    const tenant = makeTenant({
      id: "acme-corp",
      name: "Acme Corp",
      emailDomains: ["acme.com", "acmecorp.com"],
    });
    expect(validateEmailDomainForTenant(tenant, "acme.com")).toBe(true);
  });

  it("accepts alternate email domain", () => {
    const tenant = makeTenant({
      id: "acme-corp",
      name: "Acme Corp",
      emailDomains: ["acme.com", "acmecorp.com"],
    });
    expect(validateEmailDomainForTenant(tenant, "acmecorp.com")).toBe(true);
  });

  it("rejects non-matching email domain when emailDomains are configured", () => {
    const tenant = makeTenant({
      id: "acme-corp",
      name: "Acme Corp",
      emailDomains: ["acme.com"],
    });
    expect(validateEmailDomainForTenant(tenant, "evil.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    const tenant = makeTenant({
      id: "acme-corp",
      name: "Acme Corp",
      emailDomains: ["ACME.COM"],
    });
    expect(validateEmailDomainForTenant(tenant, "acme.com")).toBe(true);
  });

  it("accepts any domain when no emailDomains are configured (non-strict)", () => {
    const tenant = makeTenant({
      id: "acme-corp",
      name: "Acme Corp",
      emailDomains: [],
    });
    expect(validateEmailDomainForTenant(tenant, "anything.com")).toBe(true);
  });
});
