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
 * Sign-in API route — initiates OIDC authorization code flow.
 * FR-001: Redirects browser to IdP authorization endpoint.
 * FR-006: Returns generic 404 for invalid tenant slugs (enumeration protection).
 */

import { AuditLogger } from "@/audit/audit-logger";
import { OIDCAdapter } from "@/auth/adapters/oidc-adapter";
import { createAuthConfigErrorEvent, logAuthEvent } from "@/auth/audit";
import { validateTenantSlug } from "@/auth/tenant-validation";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { NextResponse } from "next/server";

const storage = new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
const auditLogger = new AuditLogger(storage);

const oidcAdapter = new OIDCAdapter();

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params;

  // Validate tenant slug — generic 404 prevents enumeration
  const lookup = validateTenantSlug(tenantSlug);
  if (!lookup.valid) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const { tenant } = lookup;

  try {
    const result = await oidcAdapter.initiateSignIn(request, tenant);

    const response = NextResponse.redirect(result.redirectUrl);

    // Set temporary auth state cookie
    if (result.cookies) {
      for (const [name, value] of Object.entries(result.cookies)) {
        response.cookies.set(name, value, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 600, // 10 minutes
        });
      }
    }

    return response;
  } catch (error) {
    // Log config error and redirect to error page
    const isMissing = error instanceof Error && error.message.includes("not configured");
    const auditReason = isMissing ? "missing-oidc-config" : "invalid-oidc-config";
    const redirectCode = isMissing ? "missing_config" : "invalid_config";

    await storage.initialize();
    await logAuthEvent(auditLogger, createAuthConfigErrorEvent(tenantSlug, auditReason, request));

    return NextResponse.redirect(
      new URL(`/${tenantSlug}/auth/error?code=${redirectCode}`, request.url),
    );
  }
}
