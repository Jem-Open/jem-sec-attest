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
 * OIDC authentication adapter using openid-client v6.
 * Constitution Principle V: Pluggable Architecture (OIDC now, SAML future).
 * FR-001/FR-002: Tenant-aware OIDC sign-in with PKCE.
 */

import crypto from "node:crypto";
import { sealData, unsealData } from "iron-session";
import * as client from "openid-client";
import type { Tenant } from "../../tenant/types.js";
import type { AuthAdapter, AuthRedirect, AuthResult } from "./auth-adapter.js";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return secret;
}

// Cache discovered OIDC configuration per issuer URL
const configCache = new Map<string, client.Configuration>();

function resolveClientSecret(secretRef: string): string {
  const match = secretRef.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  if (!match?.[1]) throw new Error(`Invalid secret reference: ${secretRef}`);
  const value = process.env[match[1]];
  if (!value) throw new Error(`Missing environment variable: ${match[1]}`);
  return value;
}

async function getOrDiscoverConfig(oidcConfig: {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<client.Configuration> {
  let config = configCache.get(oidcConfig.issuerUrl);
  if (!config) {
    config = await client.discovery(
      new URL(oidcConfig.issuerUrl),
      oidcConfig.clientId,
      resolveClientSecret(oidcConfig.clientSecret),
    );
    configCache.set(oidcConfig.issuerUrl, config);
  }
  return config;
}

export class OIDCAdapter implements AuthAdapter {
  async initiateSignIn(_request: Request, tenant: Tenant): Promise<AuthRedirect> {
    const oidcConfig = tenant.settings.auth?.oidc;
    if (!oidcConfig) throw new Error("OIDC not configured for tenant");

    const config = await getOrDiscoverConfig(oidcConfig);

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = crypto.randomUUID();

    const redirectUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: oidcConfig.redirectUri,
      scope: oidcConfig.scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    // Store state and verifier in an encrypted temporary cookie (validated in callback)
    const sealedState = await sealData(
      { state, codeVerifier, issuerUrl: oidcConfig.issuerUrl },
      { password: getSessionSecret(), ttl: 600 },
    );

    return {
      redirectUrl: redirectUrl.toString(),
      cookies: {
        jem_auth_state: sealedState,
      },
    };
  }

  async handleCallback(request: Request, tenant: Tenant): Promise<AuthResult> {
    const oidcConfig = tenant.settings.auth?.oidc;
    if (!oidcConfig) return { ok: false, reason: "idp-error", message: "OIDC not configured" };

    const url = new URL(request.url);

    // Check for IdP error
    const idpError = url.searchParams.get("error");
    if (idpError) {
      return { ok: false, reason: "idp-error", message: idpError };
    }

    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    if (!code || !returnedState) {
      return { ok: false, reason: "missing-required-claims", message: "Missing code or state" };
    }

    // Read state from cookie (passed via header in middleware/route)
    const cookieHeader = request.headers.get("cookie") ?? "";
    const stateCookie = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("jem_auth_state="));
    if (!stateCookie) {
      return { ok: false, reason: "state-mismatch", message: "Auth state cookie missing" };
    }

    let storedState: { state: string; codeVerifier: string; issuerUrl: string };
    try {
      const sealedValue = decodeURIComponent(stateCookie.split("=").slice(1).join("="));
      storedState = await unsealData<{ state: string; codeVerifier: string; issuerUrl: string }>(
        sealedValue,
        { password: getSessionSecret(), ttl: 600 },
      );
    } catch {
      return { ok: false, reason: "state-mismatch", message: "Invalid auth state cookie" };
    }

    if (storedState.state !== returnedState) {
      return { ok: false, reason: "state-mismatch", message: "State parameter mismatch" };
    }

    // Exchange code for tokens
    try {
      const config = await getOrDiscoverConfig(oidcConfig);

      const tokens = await client.authorizationCodeGrant(config, new URL(request.url), {
        pkceCodeVerifier: storedState.codeVerifier,
        expectedState: storedState.state,
      });

      const claims = tokens.claims();
      if (!claims) {
        return { ok: false, reason: "missing-required-claims", message: "No claims in token" };
      }

      const sub = claims.sub;
      const email = claims.email as string | undefined;
      const name =
        (claims.name as string | undefined) ??
        (claims.preferred_username as string | undefined) ??
        email ??
        "Unknown";

      if (!sub || !email) {
        return {
          ok: false,
          reason: "missing-required-claims",
          message: "Missing sub or email claim",
        };
      }

      return {
        ok: true,
        claims: { sub, email, name, issuer: oidcConfig.issuerUrl },
      };
    } catch (err) {
      console.error("Token exchange failed:", err instanceof Error ? err.message : "Unknown error");
      return { ok: false, reason: "token-exchange-failed", message: "Token exchange failed" };
    }
  }

  async signOut(_request: Request, tenant: Tenant): Promise<AuthRedirect> {
    const logoutUrl = tenant.settings.auth?.oidc?.logoutUrl;

    // Validate logoutUrl scheme — only allow https to prevent open redirect
    if (logoutUrl) {
      let parsed: URL;
      try {
        parsed = new URL(logoutUrl);
      } catch {
        // Malformed URL — fall back to internal sign-out confirmation page
        return { redirectUrl: `/${tenant.id}/auth/signout-confirm` };
      }
      if (parsed.protocol !== "https:") {
        // Non-https URL — fall back to internal sign-out confirmation page
        return { redirectUrl: `/${tenant.id}/auth/signout-confirm` };
      }
    }

    return {
      redirectUrl: logoutUrl ?? `/${tenant.id}/auth/signout-confirm`,
    };
  }
}
