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
 * Unit tests for middleware tenant-session validation enhancements.
 * T023: Verify generic 404 for unresolvable hostnames and correct
 *       redirect URL on tenant mismatch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigSnapshot, Tenant } from "../../../src/tenant/types";

// Mock dependencies before importing middleware
vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

vi.mock("../../../src/config/index", () => ({
  getSnapshot: vi.fn(),
}));

vi.mock("../../../src/tenant/resolver", () => ({
  createResolver: vi.fn(),
}));

// Minimal NextRequest / NextResponse mock for middleware testing
vi.mock("next/server", () => {
  class MockNextResponse {
    status: number;
    body: unknown;
    headers: Map<string, string>;
    cookies: { set: () => void; delete: () => void };

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers ?? {}));
      this.cookies = { set: () => {}, delete: () => {} };
    }

    static next(opts?: { request?: { headers?: Headers } }) {
      const resp = new MockNextResponse(null, { status: 200 });
      if (opts?.request?.headers) {
        for (const [k, v] of opts.request.headers.entries()) {
          resp.headers.set(k, v);
        }
      }
      (resp as Record<string, unknown>).__isNext = true;
      return resp;
    }

    static redirect(url: string | URL) {
      const resp = new MockNextResponse(null, { status: 307 });
      (resp as Record<string, unknown>).__redirectUrl = String(url);
      return resp;
    }

    static json(data: unknown, init?: { status?: number }) {
      const resp = new MockNextResponse(JSON.stringify(data), {
        status: init?.status ?? 200,
      });
      (resp as Record<string, unknown>).__jsonData = data;
      return resp;
    }
  }

  return {
    NextResponse: MockNextResponse,
  };
});

import { getIronSession } from "iron-session";
import { getSnapshot } from "../../../src/config/index";
import { createResolver } from "../../../src/tenant/resolver";

const _mockedGetSnapshot = vi.mocked(getSnapshot);
const _mockedCreateResolver = vi.mocked(createResolver);
const _mockedGetIronSession = vi.mocked(getIronSession);

function makeTenant(id: string): Tenant {
  return {
    id,
    name: `Tenant ${id}`,
    hostnames: [`${id}.example.com`],
    emailDomains: [`${id}.com`],
    settings: {},
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

function makeRequest(
  url: string,
  host: string,
): {
  nextUrl: { pathname: string };
  url: string;
  headers: { get: (name: string) => string | null };
} {
  const parsedUrl = new URL(url);
  return {
    nextUrl: { pathname: parsedUrl.pathname },
    url,
    headers: {
      get: (name: string) => {
        if (name === "host") return host;
        return null;
      },
    },
  };
}

describe("middleware", () => {
  let middleware: (request: unknown) => Promise<unknown>;
  const acme = makeTenant("acme-corp");

  beforeEach(async () => {
    process.env.SESSION_SECRET = "a".repeat(32);

    // Re-import middleware for each test to get fresh module state
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock("iron-session", () => ({
      getIronSession: vi.fn(),
    }));
    vi.doMock("../../../src/config/index", () => ({
      getSnapshot: vi.fn(),
    }));
    vi.doMock("../../../src/tenant/resolver", () => ({
      createResolver: vi.fn(),
    }));
    vi.doMock("next/server", () => {
      class MockNextResponse {
        status: number;
        body: unknown;
        headers: Map<string, string>;
        cookies: { set: () => void; delete: () => void };

        constructor(body?: unknown, init?: { status?: number }) {
          this.body = body;
          this.status = init?.status ?? 200;
          this.headers = new Map();
          this.cookies = { set: () => {}, delete: () => {} };
        }

        static next(opts?: { request?: { headers?: Headers } }) {
          const resp = new MockNextResponse(null, { status: 200 });
          if (opts?.request?.headers) {
            for (const [k, v] of opts.request.headers.entries()) {
              resp.headers.set(k, v);
            }
          }
          (resp as Record<string, unknown>).__isNext = true;
          return resp;
        }

        static redirect(url: string | URL) {
          const resp = new MockNextResponse(null, { status: 307 });
          (resp as Record<string, unknown>).__redirectUrl = String(url);
          return resp;
        }

        static json(data: unknown, init?: { status?: number }) {
          const resp = new MockNextResponse(JSON.stringify(data), {
            status: init?.status ?? 200,
          });
          (resp as Record<string, unknown>).__jsonData = data;
          return resp;
        }
      }
      return { NextResponse: MockNextResponse };
    });

    const mod = await import("../../../middleware");
    middleware = mod.middleware as (request: unknown) => Promise<unknown>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.SESSION_SECRET = undefined;
  });

  it("passes through public paths without tenant resolution", async () => {
    const request = makeRequest("http://localhost/api/auth/foo", "localhost");
    const response = (await middleware(request)) as Record<string, unknown>;
    expect(response.__isNext).toBe(true);
  });

  it("returns generic 404 for unresolvable hostnames", async () => {
    const { getSnapshot: gs } = await import("../../../src/config/index");
    vi.mocked(gs).mockReturnValue(makeSnapshot([acme]));

    const { createResolver: cr } = await import("../../../src/tenant/resolver");
    vi.mocked(cr).mockReturnValue({
      resolve: () => null,
    } as ReturnType<typeof cr>);

    const request = makeRequest(
      "http://unknown.example.com/acme-corp/dashboard",
      "unknown.example.com",
    );
    const response = (await middleware(request)) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(response.__jsonData).toEqual({ error: "Not found." });
  });

  it("returns generic 404 when no config snapshot is loaded", async () => {
    const { getSnapshot: gs } = await import("../../../src/config/index");
    vi.mocked(gs).mockReturnValue(null);

    const request = makeRequest(
      "http://acme-corp.example.com/acme-corp/dashboard",
      "acme-corp.example.com",
    );
    const response = (await middleware(request)) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(response.__jsonData).toEqual({ error: "Not found." });
  });

  it("redirects to resolved tenant signin on session mismatch", async () => {
    const { getSnapshot: gs } = await import("../../../src/config/index");
    vi.mocked(gs).mockReturnValue(makeSnapshot([acme]));

    const { createResolver: cr } = await import("../../../src/tenant/resolver");
    vi.mocked(cr).mockReturnValue({
      resolve: () => acme,
    } as ReturnType<typeof cr>);

    const { getIronSession: gis } = await import("iron-session");
    vi.mocked(gis).mockResolvedValue({
      employee: {
        sessionId: "sess-1",
        tenantId: "other-tenant", // Mismatch!
        employeeId: "emp-1",
        email: "user@other.com",
        displayName: "User",
        idpIssuer: "https://idp.other.com",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      },
      destroy: vi.fn(),
      save: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof gis>>);

    const request = makeRequest(
      "http://acme-corp.example.com/other-tenant/dashboard",
      "acme-corp.example.com",
    );
    const response = (await middleware(request)) as Record<string, unknown>;

    // Should redirect to the RESOLVED tenant's signin, not the session tenant
    expect(response.status).toBe(307);
    const redirectUrl = response.__redirectUrl as string;
    expect(redirectUrl).toContain("/acme-corp/auth/signin");
    expect(redirectUrl).not.toContain("/other-tenant/");
  });
});
