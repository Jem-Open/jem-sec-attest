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

// vi.mock calls are hoisted — place them before imports for clarity.
vi.mock("openid-client", () => ({
  discovery: vi.fn(),
  randomPKCECodeVerifier: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
}));

vi.mock("iron-session", () => ({
  sealData: vi.fn(),
  unsealData: vi.fn(),
}));

import { sealData, unsealData } from "iron-session";
import * as client from "openid-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OIDCAdapter } from "../../../src/auth/adapters/oidc-adapter";
import type { Tenant } from "../../../src/tenant/types";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------
const mockedDiscovery = vi.mocked(client.discovery);
const mockedRandomPKCECodeVerifier = vi.mocked(client.randomPKCECodeVerifier);
const mockedCalculatePKCECodeChallenge = vi.mocked(client.calculatePKCECodeChallenge);
const mockedBuildAuthorizationUrl = vi.mocked(client.buildAuthorizationUrl);
const mockedAuthorizationCodeGrant = vi.mocked(client.authorizationCodeGrant);
const mockedSealData = vi.mocked(sealData);
const mockedUnsealData = vi.mocked(unsealData);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ISSUER_URL = "https://idp.example.com";
const SESSION_SECRET = "a-very-long-secret-at-least-32-chars!!";
const OIDC_CLIENT_SECRET = "super-secret-value";

/** A fake openid-client Configuration object (shape is opaque to us). */
const fakeConfig = {} as client.Configuration;

function makeTenant(overrides?: Partial<Tenant["settings"]["auth"]>): Tenant {
  return {
    id: "acme-corp",
    name: "Acme Corp",
    hostnames: ["acme.example.com"],
    emailDomains: ["acme.com"],
    settings: {
      auth: {
        oidc: {
          issuerUrl: ISSUER_URL,
          clientId: "client-123",
          clientSecret: "${OIDC_CLIENT_SECRET}",
          redirectUri: "https://app.example.com/auth/callback",
          scopes: ["openid", "email", "profile"],
          logoutUrl: "https://idp.example.com/logout",
        },
        ...overrides,
      },
    },
  };
}

function makeTenantWithoutOidc(): Tenant {
  return {
    id: "bare-tenant",
    name: "Bare Tenant",
    hostnames: [],
    emailDomains: [],
    settings: {},
  };
}

// ---------------------------------------------------------------------------
// Global beforeEach / afterEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.OIDC_CLIENT_SECRET = OIDC_CLIENT_SECRET;

  // Default openid-client stubs
  mockedDiscovery.mockResolvedValue(fakeConfig);
  mockedRandomPKCECodeVerifier.mockReturnValue("pkce-verifier-abc");
  mockedCalculatePKCECodeChallenge.mockResolvedValue("pkce-challenge-xyz");
  mockedBuildAuthorizationUrl.mockReturnValue(new URL("https://idp.example.com/authorize?foo=bar"));
  mockedSealData.mockResolvedValue("sealed-state-cookie-value");
});

afterEach(() => {
  process.env.SESSION_SECRET = undefined;
  process.env.OIDC_CLIENT_SECRET = undefined;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCallbackRequest(opts: {
  code?: string;
  state?: string;
  stateCookie?: string;
  error?: string;
}): Request {
  const url = new URL("https://app.example.com/auth/callback");
  if (opts.error) url.searchParams.set("error", opts.error);
  if (opts.code !== undefined) url.searchParams.set("code", opts.code);
  if (opts.state !== undefined) url.searchParams.set("state", opts.state);

  const cookieHeader =
    opts.stateCookie !== undefined ? `jem_auth_state=${encodeURIComponent(opts.stateCookie)}` : "";

  return new Request(url.toString(), {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

// ---------------------------------------------------------------------------
// OIDCAdapter — initiateSignIn
// ---------------------------------------------------------------------------
describe("OIDCAdapter.initiateSignIn", () => {
  const adapter = new OIDCAdapter();

  it("throws 'OIDC not configured for tenant' when tenant has no OIDC config", async () => {
    const tenant = makeTenantWithoutOidc();
    const request = new Request("https://app.example.com/auth/signin");
    await expect(adapter.initiateSignIn(request, tenant)).rejects.toThrow(
      "OIDC not configured for tenant",
    );
  });

  it("returns a redirectUrl string on success", async () => {
    const tenant = makeTenant();
    const request = new Request("https://app.example.com/auth/signin");

    const result = await adapter.initiateSignIn(request, tenant);

    expect(result.redirectUrl).toBe("https://idp.example.com/authorize?foo=bar");
  });

  it("sets cookies.jem_auth_state on success", async () => {
    const tenant = makeTenant();
    const request = new Request("https://app.example.com/auth/signin");

    const result = await adapter.initiateSignIn(request, tenant);

    expect(result.cookies).toBeDefined();
    expect(result.cookies?.jem_auth_state).toBe("sealed-state-cookie-value");
  });

  it("builds authorization URL with S256 PKCE method", async () => {
    const tenant = makeTenant();
    const request = new Request("https://app.example.com/auth/signin");

    await adapter.initiateSignIn(request, tenant);

    expect(mockedBuildAuthorizationUrl).toHaveBeenCalledOnce();
    const [, params] = mockedBuildAuthorizationUrl.mock.calls[0];
    expect(params).toMatchObject({ code_challenge_method: "S256" });
    expect(params).toHaveProperty("code_challenge", "pkce-challenge-xyz");
  });

  it("seals { state, codeVerifier, issuerUrl } with TTL 600 into the cookie", async () => {
    const tenant = makeTenant();
    const request = new Request("https://app.example.com/auth/signin");

    await adapter.initiateSignIn(request, tenant);

    expect(mockedSealData).toHaveBeenCalledOnce();
    const [payload, options] = mockedSealData.mock.calls[0];
    expect(payload).toMatchObject({
      codeVerifier: "pkce-verifier-abc",
      issuerUrl: ISSUER_URL,
    });
    expect(typeof (payload as Record<string, unknown>).state).toBe("string");
    expect(options).toMatchObject({ ttl: 600 });
  });

  it("throws when SESSION_SECRET is missing", async () => {
    process.env.SESSION_SECRET = undefined;
    const tenant = makeTenant();
    const request = new Request("https://app.example.com/auth/signin");

    await expect(adapter.initiateSignIn(request, tenant)).rejects.toThrow(
      "SESSION_SECRET must be set and at least 32 characters",
    );
  });

  it("calls discovery with the issuerUrl and resolved client secret", async () => {
    // Use a unique issuerUrl per this test to guarantee a cache miss even
    // when the shared module-level configCache already holds ISSUER_URL from
    // earlier tests. vi.clearAllMocks() resets call counts but not the cache.
    const uniqueIssuerUrl = "https://idp-discovery-test.example.com";
    const tenant: Tenant = {
      ...makeTenant(),
      settings: {
        auth: {
          oidc: {
            issuerUrl: uniqueIssuerUrl,
            clientId: "client-123",
            clientSecret: "${OIDC_CLIENT_SECRET}",
            redirectUri: "https://app.example.com/auth/callback",
            scopes: ["openid", "email", "profile"],
          },
        },
      },
    };
    const request = new Request("https://app.example.com/auth/signin");

    await adapter.initiateSignIn(request, tenant);

    expect(mockedDiscovery).toHaveBeenCalledWith(
      new URL(uniqueIssuerUrl),
      "client-123",
      OIDC_CLIENT_SECRET,
    );
  });
});

// ---------------------------------------------------------------------------
// OIDCAdapter — handleCallback
// ---------------------------------------------------------------------------
describe("OIDCAdapter.handleCallback", () => {
  const adapter = new OIDCAdapter();
  const DEFAULT_STATE = "state-abc";
  const DEFAULT_CODE = "auth-code-123";
  const DEFAULT_SEALED_COOKIE = "valid-sealed-cookie";

  const storedStatePayload = {
    state: DEFAULT_STATE,
    codeVerifier: "verifier",
    issuerUrl: ISSUER_URL,
  };

  // Default happy-path stubs for the inner describe block
  beforeEach(() => {
    mockedUnsealData.mockResolvedValue(storedStatePayload);

    mockedAuthorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: "user-sub-001",
        email: "alice@acme.com",
        name: "Alice Smith",
        iss: ISSUER_URL,
      }),
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
  });

  function makeValidCallbackRequest(): Request {
    return makeCallbackRequest({
      code: DEFAULT_CODE,
      state: DEFAULT_STATE,
      stateCookie: DEFAULT_SEALED_COOKIE,
    });
  }

  it("returns { ok: false, reason: 'idp-error' } when IdP returns ?error=...", async () => {
    const request = makeCallbackRequest({
      error: "access_denied",
      stateCookie: DEFAULT_SEALED_COOKIE,
    });

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("idp-error");
      expect(result.message).toBe("access_denied");
    }
  });

  it("returns { ok: false, reason: 'missing-required-claims' } when code param is missing", async () => {
    const request = makeCallbackRequest({
      state: DEFAULT_STATE,
      stateCookie: DEFAULT_SEALED_COOKIE,
    });

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing-required-claims");
    }
  });

  it("returns { ok: false, reason: 'missing-required-claims' } when state param is missing", async () => {
    const request = makeCallbackRequest({
      code: DEFAULT_CODE,
      stateCookie: DEFAULT_SEALED_COOKIE,
    });

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing-required-claims");
    }
  });

  it("returns { ok: false, reason: 'state-mismatch' } when jem_auth_state cookie is absent", async () => {
    const url = new URL(
      `https://app.example.com/auth/callback?code=${DEFAULT_CODE}&state=${DEFAULT_STATE}`,
    );
    const request = new Request(url.toString()); // no cookie header

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("state-mismatch");
      expect(result.message).toContain("missing");
    }
  });

  it("returns { ok: false, reason: 'state-mismatch' } when cookie cannot be unsealed", async () => {
    mockedUnsealData.mockRejectedValueOnce(new Error("decryption failed"));
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("state-mismatch");
      expect(result.message).toContain("Invalid");
    }
  });

  it("returns { ok: false, reason: 'state-mismatch' } when stored state doesn't match returned state", async () => {
    mockedUnsealData.mockResolvedValueOnce({
      state: "DIFFERENT-state-value",
      codeVerifier: "verifier",
      issuerUrl: ISSUER_URL,
    });
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("state-mismatch");
      expect(result.message).toContain("mismatch");
    }
  });

  it("returns { ok: true, claims } on valid token exchange", async () => {
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims).toEqual({
        sub: "user-sub-001",
        email: "alice@acme.com",
        name: "Alice Smith",
        issuer: ISSUER_URL,
      });
    }
  });

  it("returns { ok: false, reason: 'missing-required-claims' } when claims() returns null", async () => {
    mockedAuthorizationCodeGrant.mockResolvedValueOnce({
      claims: () => undefined,
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing-required-claims");
      expect(result.message).toContain("No claims");
    }
  });

  it("returns { ok: false, reason: 'missing-required-claims' } when sub is missing", async () => {
    mockedAuthorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({
        email: "alice@acme.com",
        name: "Alice Smith",
        iss: ISSUER_URL,
      }),
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing-required-claims");
    }
  });

  it("returns { ok: false, reason: 'missing-required-claims' } when email is missing", async () => {
    mockedAuthorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({
        sub: "user-sub-001",
        name: "Alice Smith",
        iss: ISSUER_URL,
      }),
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing-required-claims");
    }
  });

  it("returns { ok: false, reason: 'token-exchange-failed' } when authorizationCodeGrant throws", async () => {
    mockedAuthorizationCodeGrant.mockRejectedValueOnce(new Error("network error"));
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("token-exchange-failed");
    }
  });

  it("returns { ok: false, reason: 'idp-error' } when tenant has no OIDC config", async () => {
    const tenant = makeTenantWithoutOidc();
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, tenant);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("idp-error");
      expect(result.message).toContain("OIDC not configured");
    }
  });

  it("uses preferred_username as name fallback when name claim is absent", async () => {
    mockedAuthorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({
        sub: "user-sub-001",
        email: "alice@acme.com",
        preferred_username: "alice_preferred",
        iss: ISSUER_URL,
      }),
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.name).toBe("alice_preferred");
    }
  });

  it("uses email as name fallback when neither name nor preferred_username is present", async () => {
    mockedAuthorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({
        sub: "user-sub-001",
        email: "alice@acme.com",
        iss: ISSUER_URL,
      }),
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
    const request = makeValidCallbackRequest();

    const result = await adapter.handleCallback(request, makeTenant());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.name).toBe("alice@acme.com");
    }
  });
});

// ---------------------------------------------------------------------------
// OIDCAdapter — signOut
// ---------------------------------------------------------------------------
describe("OIDCAdapter.signOut", () => {
  const adapter = new OIDCAdapter();
  const dummyRequest = new Request("https://app.example.com/auth/signout");

  it("returns the logoutUrl when it is a valid https URL", async () => {
    const tenant = makeTenant();
    // makeTenant() sets logoutUrl = "https://idp.example.com/logout"
    const result = await adapter.signOut(dummyRequest, tenant);
    expect(result.redirectUrl).toBe("https://idp.example.com/logout");
  });

  it("falls back to /{tenantId}/auth/signout-confirm when no logoutUrl is configured", async () => {
    const tenant: Tenant = {
      ...makeTenant(),
      settings: {
        auth: {
          oidc: {
            issuerUrl: ISSUER_URL,
            clientId: "client-123",
            clientSecret: "${OIDC_CLIENT_SECRET}",
            redirectUri: "https://app.example.com/auth/callback",
            scopes: ["openid", "email"],
            // logoutUrl intentionally omitted
          },
        },
      },
    };

    const result = await adapter.signOut(dummyRequest, tenant);
    expect(result.redirectUrl).toBe(`/${tenant.id}/auth/signout-confirm`);
  });

  it("falls back to internal page when logoutUrl uses http (not https)", async () => {
    const tenant: Tenant = {
      ...makeTenant(),
      settings: {
        auth: {
          oidc: {
            issuerUrl: ISSUER_URL,
            clientId: "client-123",
            clientSecret: "${OIDC_CLIENT_SECRET}",
            redirectUri: "https://app.example.com/auth/callback",
            scopes: ["openid", "email"],
            logoutUrl: "http://idp.example.com/logout",
          },
        },
      },
    };

    const result = await adapter.signOut(dummyRequest, tenant);
    expect(result.redirectUrl).toBe(`/${tenant.id}/auth/signout-confirm`);
  });

  it("falls back to internal page when logoutUrl is a malformed URL", async () => {
    const tenant: Tenant = {
      ...makeTenant(),
      settings: {
        auth: {
          oidc: {
            issuerUrl: ISSUER_URL,
            clientId: "client-123",
            clientSecret: "${OIDC_CLIENT_SECRET}",
            redirectUri: "https://app.example.com/auth/callback",
            scopes: ["openid", "email"],
            logoutUrl: "not a valid url ://??",
          },
        },
      },
    };

    const result = await adapter.signOut(dummyRequest, tenant);
    expect(result.redirectUrl).toBe(`/${tenant.id}/auth/signout-confirm`);
  });
});
