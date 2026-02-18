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
 * Next.js middleware for session validation and tenant context.
 * - Validates session cookie presence
 * - Extracts tenant from hostname
 * - Validates session tenantId matches resolved tenant
 * - Returns generic 404 for unresolvable hostnames (no tenant leakage)
 * - Passes tenant context via request headers
 * - Excludes auth routes and static assets from protection
 */

import { getIronSession } from "iron-session";
import { type NextRequest, NextResponse } from "next/server";
import type { EmployeeSession } from "./src/auth/types";
import { getSnapshot } from "./src/config/index";
import { createResolver } from "./src/tenant/resolver";

const PUBLIC_PATHS = ["/api/auth/", "/_next/", "/favicon.ico"];

interface SessionData {
  employee?: EmployeeSession;
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return true;
  }
  // Tenant auth pages: /[tenant]/auth/*
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[1] === "auth") {
    return true;
  }
  return false;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return secret;
}

/**
 * Resolve tenant from hostname using the config snapshot.
 * Returns the tenant slug (id) or null if hostname is unresolvable.
 */
function resolveTenantFromHostname(hostname: string): string | null {
  const snapshot = getSnapshot();
  if (!snapshot) {
    return null;
  }
  const resolver = createResolver(snapshot);
  const tenant = resolver.resolve({ hostname });
  return tenant?.id ?? null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hostname = request.headers.get("host")?.split(":")[0] ?? "";

  // Resolve tenant from hostname — return generic 404 for unresolvable
  // hostnames to prevent tenant existence leakage (enumeration protection)
  const resolvedTenantId = resolveTenantFromHostname(hostname);
  if (!resolvedTenantId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Extract tenant slug from first path segment
  const segments = pathname.split("/").filter(Boolean);
  const tenantSlug = segments[0];

  if (!tenantSlug) {
    // Root path "/" with a resolved tenant — redirect to the tenant's root.
    // This prevents unauthenticated access to "/" and avoids bypassing
    // session validation for any content served at the root path.
    return NextResponse.redirect(new URL(`/${resolvedTenantId}`, request.url));
  }

  // Read session from encrypted cookie
  const session = await getIronSession<SessionData>(request, NextResponse.next(), {
    password: getSessionSecret(),
    cookieName: "jem_session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  });

  const employee = session.employee;

  // No valid session — redirect to sign-in using the RESOLVED tenant
  // (always use the current hostname's tenant, not a path-based slug)
  if (!employee) {
    const signInUrl = new URL(`/${resolvedTenantId}/auth/signin`, request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Session expired — redirect to sign-in using resolved tenant.
  // Explicitly clear the session cookie on the redirect response because
  // iron-session's session.destroy() only mutates the response passed to
  // getIronSession, not the new redirect response we return here.
  if (employee.expiresAt < Date.now()) {
    const signInUrl = new URL(`/${resolvedTenantId}/auth/signin`, request.url);
    const redirectResponse = NextResponse.redirect(signInUrl);
    redirectResponse.cookies.set("jem_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return redirectResponse;
  }

  // Tenant mismatch — session tenantId doesn't match the resolved tenant.
  // This prevents cross-tenant session reuse. Redirect uses the CURRENT
  // hostname's resolved tenant, not the session's stale tenant.
  if (employee.tenantId !== resolvedTenantId) {
    const signInUrl = new URL(`/${resolvedTenantId}/auth/signin`, request.url);
    const redirectResponse = NextResponse.redirect(signInUrl);
    redirectResponse.cookies.set("jem_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return redirectResponse;
  }

  // Pass tenant context via headers for downstream route handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", resolvedTenantId);
  requestHeaders.set("x-employee-id", employee.employeeId);
  requestHeaders.set("x-hostname", hostname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
