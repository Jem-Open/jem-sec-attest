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

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest — applied before any import)
// ---------------------------------------------------------------------------

vi.mock("iron-session", () => ({
  getIronSession: vi.fn(),
}));

vi.mock("../../../src/config/index", () => ({
  getSnapshot: vi.fn(),
}));

vi.mock("../../../src/tenant/resolver", () => ({
  createResolver: vi.fn(),
}));

/**
 * Minimal NextResponse stub.  We only stub what the middleware actually uses:
 *   - NextResponse.next()     → pass-through marker
 *   - NextResponse.redirect() → redirect marker
 *   - NextResponse.json()     → JSON error marker
 *   - instance.cookies.set()  → cookie mutation (no-op)
 *
 * Using plain vi.fn() stubs avoids re-implementing the full class and means
 * the mock object is reset cleanly by vi.clearAllMocks() each test.
 */
vi.mock("next/server", () => {
  const makeResp = (status: number) => ({
    status,
    cookies: { set: vi.fn(), delete: vi.fn() },
  });

  return {
    NextResponse: {
      next: vi.fn((opts?: { request?: { headers?: Headers } }) => {
        const resp = { ...makeResp(200), __isNext: true, headers: new Map<string, string>() };
        if (opts?.request?.headers) {
          for (const [k, v] of opts.request.headers.entries()) {
            resp.headers.set(k, v);
          }
        }
        return resp;
      }),
      redirect: vi.fn((url: string | URL) => ({
        ...makeResp(307),
        __redirectUrl: String(url),
      })),
      json: vi.fn((data: unknown, init?: { status?: number }) => ({
        ...makeResp(init?.status ?? 200),
        __jsonData: data,
      })),
    },
  };
});

// ---------------------------------------------------------------------------
// Static imports — resolved after mocks are hoisted
// ---------------------------------------------------------------------------

import { getIronSession } from "iron-session";
import { middleware } from "../../../middleware";
import { getSnapshot } from "../../../src/config/index";
import { createResolver } from "../../../src/tenant/resolver";

const mockedGetSnapshot = vi.mocked(getSnapshot);
const mockedCreateResolver = vi.mocked(createResolver);
const mockedGetIronSession = vi.mocked(getIronSession);

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
  const acme = makeTenant("acme-corp");

  beforeEach(() => {
    process.env.SESSION_SECRET = "a".repeat(32);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.SESSION_SECRET = undefined;
  });

  it("passes through public paths without tenant resolution", async () => {
    const request = makeRequest("http://localhost/api/auth/foo", "localhost");
    const response = (await middleware(request as Parameters<typeof middleware>[0])) as Record<
      string,
      unknown
    >;
    expect(response.__isNext).toBe(true);
  });

  it("returns generic 404 for unresolvable hostnames", async () => {
    mockedGetSnapshot.mockReturnValue(makeSnapshot([acme]));
    mockedCreateResolver.mockReturnValue({
      resolve: () => null,
    } as ReturnType<typeof createResolver>);

    const request = makeRequest(
      "http://unknown.example.com/acme-corp/dashboard",
      "unknown.example.com",
    );
    const response = (await middleware(request as Parameters<typeof middleware>[0])) as Record<
      string,
      unknown
    >;

    expect(response.status).toBe(404);
    expect(response.__jsonData).toEqual({ error: "Not found." });
  });

  it("returns generic 404 when no config snapshot is loaded", async () => {
    mockedGetSnapshot.mockReturnValue(null);

    const request = makeRequest(
      "http://acme-corp.example.com/acme-corp/dashboard",
      "acme-corp.example.com",
    );
    const response = (await middleware(request as Parameters<typeof middleware>[0])) as Record<
      string,
      unknown
    >;

    expect(response.status).toBe(404);
    expect(response.__jsonData).toEqual({ error: "Not found." });
  });

  it("redirects to resolved tenant signin on session mismatch", async () => {
    mockedGetSnapshot.mockReturnValue(makeSnapshot([acme]));
    mockedCreateResolver.mockReturnValue({
      resolve: () => acme,
    } as ReturnType<typeof createResolver>);
    mockedGetIronSession.mockResolvedValue({
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
    } as unknown as Awaited<ReturnType<typeof getIronSession>>);

    const request = makeRequest(
      "http://acme-corp.example.com/other-tenant/dashboard",
      "acme-corp.example.com",
    );
    const response = (await middleware(request as Parameters<typeof middleware>[0])) as Record<
      string,
      unknown
    >;

    // Should redirect to the RESOLVED tenant's signin, not the session tenant
    expect(response.status).toBe(307);
    const redirectUrl = response.__redirectUrl as string;
    expect(redirectUrl).toContain("/acme-corp/auth/signin");
    expect(redirectUrl).not.toContain("/other-tenant/");
  });
});
