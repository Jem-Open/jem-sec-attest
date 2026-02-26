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
 * Sign-out API route — destroys session and redirects to IdP logout.
 * FR-006: Returns generic 404 for invalid tenant slugs (enumeration protection).
 * FR-005: Session destruction on sign-out.
 */

import { AuditLogger } from "@/audit/audit-logger";
import { OIDCAdapter } from "@/auth/adapters/oidc-adapter";
import { createSignOutEvent, logAuthEvent } from "@/auth/audit";
import { normalizeRequestUrl } from "@/auth/normalize-url";
import { destroySession, getSession } from "@/auth/session/session-manager";
import { validateTenantSlug } from "@/auth/tenant-validation";
import { getStorage } from "@/storage/factory";
import { NextResponse } from "next/server";

const oidcAdapter = new OIDCAdapter();

async function handleSignOut(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const normalizedUrl = normalizeRequestUrl(request);

  // CSRF protection: validate Origin header matches the request host
  const origin = request.headers.get("origin");
  const rawHost = request.headers.get("host");
  let expectedHost: string | null = null;
  if (rawHost) {
    try {
      expectedHost = new URL(`http://${rawHost}`).host;
    } catch {
      expectedHost = null;
    }
  }
  let originHost: string | null = null;
  if (origin) {
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
  }
  // Allow if Origin is absent (same-origin POST) or matches expected host
  if (!expectedHost || (originHost && originHost !== expectedHost)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenant: tenantSlug } = await params;

  // Validate tenant slug — generic 404 prevents enumeration
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

  const storage = await getStorage();
  const auditLogger = new AuditLogger(storage);

  // Read current session for audit logging
  const session = await getSession();
  const employee = session.employee;

  if (employee) {
    // Log sign-out audit event before destroying session
    await logAuthEvent(
      auditLogger,
      createSignOutEvent(tenantSlug, employee.employeeId, employee.idpIssuer, request),
    );
  }

  // Destroy session
  await destroySession();

  // Get IdP logout redirect
  const result = await oidcAdapter.signOut(request, tenant);

  if (result.redirectUrl) {
    return NextResponse.redirect(result.redirectUrl);
  }

  // No IdP logout URL configured — redirect to confirmation page
  return NextResponse.redirect(new URL(`/${tenantSlug}/auth/signout-confirm`, normalizedUrl));
}

export async function POST(request: Request, context: { params: Promise<{ tenant: string }> }) {
  return handleSignOut(request, context);
}
