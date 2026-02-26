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
 * OIDC callback API route — exchanges authorization code for tokens.
 * FR-002: Code exchange with PKCE verification.
 * FR-006: Returns generic 404 for invalid tenant slugs (enumeration protection).
 * FR-006: Email domain validation against tenant (tenant-mismatch detection).
 * FR-014: JIT employee provisioning on first sign-in.
 * FR-005: Encrypted session creation with tenant binding.
 */

import crypto from "node:crypto";
import { AuditLogger } from "@/audit/audit-logger";
import { OIDCAdapter } from "@/auth/adapters/oidc-adapter";
import { createAuthFailureEvent, createSignInEvent, logAuthEvent } from "@/auth/audit";
import { EmployeeRepository } from "@/auth/employee-repository";
import { normalizeRequestUrl } from "@/auth/normalize-url";
import { createSession } from "@/auth/session/session-manager";
import { validateEmailDomainForTenant, validateTenantSlug } from "@/auth/tenant-validation";
import { getStorage } from "@/storage/factory";
import { NextResponse } from "next/server";

const oidcAdapter = new OIDCAdapter();

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params;

  // Validate tenant slug — generic 404 prevents enumeration
  const rawHost = request.headers.get("host");
  let hostname: string | undefined;
  if (rawHost) {
    try {
      hostname = new URL(`http://${rawHost}`).hostname;
    } catch {
      hostname = undefined;
    }
  }
  const lookup = await validateTenantSlug(tenantSlug, hostname);
  if (!lookup.valid) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const { tenant } = lookup;

  const normalizedUrl = normalizeRequestUrl(request);
  const storage = await getStorage();
  const employeeRepo = new EmployeeRepository(storage);
  const auditLogger = new AuditLogger(storage);

  const normalizedRequest = new Request(normalizedUrl, request);
  const result = await oidcAdapter.handleCallback(normalizedRequest, tenant);

  if (!result.ok) {
    await logAuthEvent(auditLogger, createAuthFailureEvent(tenantSlug, result.reason, request));
    return NextResponse.redirect(
      new URL(`/${tenantSlug}/auth/error?code=${result.reason}`, normalizedUrl),
    );
  }

  // Email domain validation against tenant's configured emailDomains.
  // If the tenant has emailDomains configured and the IdP returns claims
  // for a domain not matching the tenant, reject with tenant-mismatch.
  if (typeof result.claims.email !== "string" || !result.claims.email) {
    await logAuthEvent(
      auditLogger,
      createAuthFailureEvent(tenantSlug, "missing-required-claims", request, result.claims.issuer),
    );
    return NextResponse.redirect(
      new URL(`/${tenantSlug}/auth/error?code=auth_failed`, normalizedUrl),
    );
  }
  const emailParts = result.claims.email.split("@");
  if (emailParts.length !== 2 || !emailParts[1]) {
    await logAuthEvent(
      auditLogger,
      createAuthFailureEvent(tenantSlug, "missing-required-claims", request, result.claims.issuer),
    );
    return NextResponse.redirect(
      new URL(`/${tenantSlug}/auth/error?code=auth_failed`, normalizedUrl),
    );
  }
  const emailDomain = emailParts[1];
  if (!validateEmailDomainForTenant(tenant, emailDomain)) {
    await logAuthEvent(
      auditLogger,
      createAuthFailureEvent(tenantSlug, "tenant-mismatch", request, result.claims.issuer),
    );
    return NextResponse.redirect(
      new URL(`/${tenantSlug}/auth/error?code=auth_failed`, normalizedUrl),
    );
  }

  // JIT provision employee
  const employee = await employeeRepo.upsertFromClaims(tenantSlug, {
    sub: result.claims.sub,
    email: result.claims.email,
    name: result.claims.name,
  });

  // Get tenant session TTL from config (default 1 hour)
  const sessionTtlSeconds = tenant.settings.auth?.sessionTtlSeconds ?? 3600;
  const sessionTtlMs = sessionTtlSeconds * 1000;

  // Create session
  const now = Date.now();
  await createSession({
    sessionId: crypto.randomUUID(),
    tenantId: tenantSlug,
    employeeId: employee.id,
    email: employee.email,
    displayName: employee.displayName,
    idpIssuer: result.claims.issuer,
    createdAt: now,
    expiresAt: now + sessionTtlMs,
  });

  // Log sign-in audit event
  await logAuthEvent(
    auditLogger,
    createSignInEvent(tenantSlug, employee.id, result.claims.issuer, request),
  );

  // Clear auth state cookie and redirect to dashboard
  const response = NextResponse.redirect(new URL(`/${tenantSlug}/dashboard`, normalizedUrl));
  response.cookies.delete("jem_auth_state");
  return response;
}
