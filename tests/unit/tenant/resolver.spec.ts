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

import { beforeEach, describe, expect, it } from "vitest";
import { type TenantResolverImpl, createResolver } from "../../../src/tenant/resolver.js";
import type { ConfigSnapshot, Tenant } from "../../../src/tenant/types.js";

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

describe("TenantResolver", () => {
  const acme = makeTenant({
    id: "acme-corp",
    name: "Acme Corp",
    hostnames: ["acme.example.com", "acme-legacy.example.com"],
    emailDomains: ["acme.com", "acmecorp.com"],
  });

  const globex = makeTenant({
    id: "globex-inc",
    name: "Globex Inc",
    hostnames: ["globex.example.com"],
    emailDomains: ["globex.com"],
  });

  let resolver: TenantResolverImpl;

  beforeEach(() => {
    const snapshot = makeSnapshot([acme, globex]);
    resolver = createResolver(snapshot);
  });

  describe("hostname resolution", () => {
    it("resolves tenant by hostname", () => {
      const result = resolver.resolve({ hostname: "acme.example.com" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("acme-corp");
    });

    it("resolves tenant by alternate hostname", () => {
      const result = resolver.resolve({ hostname: "acme-legacy.example.com" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("acme-corp");
    });

    it("resolves second tenant by hostname", () => {
      const result = resolver.resolve({ hostname: "globex.example.com" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("globex-inc");
    });

    it("hostname matching is case-insensitive", () => {
      const result = resolver.resolve({ hostname: "ACME.EXAMPLE.COM" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("acme-corp");
    });
  });

  describe("email domain resolution", () => {
    it("resolves tenant by email domain", () => {
      const result = resolver.resolve({ emailDomain: "acme.com" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("acme-corp");
    });

    it("resolves tenant by alternate email domain", () => {
      const result = resolver.resolve({ emailDomain: "acmecorp.com" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("acme-corp");
    });

    it("email domain matching is case-insensitive", () => {
      const result = resolver.resolve({ emailDomain: "GLOBEX.COM" });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("globex-inc");
    });
  });

  describe("precedence: hostname > email domain", () => {
    it("hostname takes precedence when both match different tenants", () => {
      const result = resolver.resolve({
        hostname: "acme.example.com",
        emailDomain: "globex.com",
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("acme-corp");
    });

    it("falls back to email domain when hostname does not match", () => {
      const result = resolver.resolve({
        hostname: "unknown.example.com",
        emailDomain: "globex.com",
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe("globex-inc");
    });
  });

  describe("no match", () => {
    it("returns null when hostname does not match any tenant", () => {
      const result = resolver.resolve({ hostname: "unknown.example.com" });
      expect(result).toBeNull();
    });

    it("returns null when email domain does not match any tenant", () => {
      const result = resolver.resolve({ emailDomain: "unknown.com" });
      expect(result).toBeNull();
    });

    it("returns null when both hostname and email domain do not match", () => {
      const result = resolver.resolve({
        hostname: "unknown.example.com",
        emailDomain: "unknown.com",
      });
      expect(result).toBeNull();
    });

    it("returns null when no context is provided", () => {
      const result = resolver.resolve({});
      expect(result).toBeNull();
    });
  });
});
