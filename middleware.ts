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
import { getSnapshot } from "./src/config/snapshot";
import { createResolver } from "./src/tenant/resolver";

const PUBLIC_PATHS = ["/api/auth/", "/api/health/", "/_next/", "/favicon.ico"];

interface SessionData {
  employee?: EmployeeSession;
}

function isPublicPath(pathname: string): boolean {
  // Exact match for paths that have a trailing-slash variant in PUBLIC_PATHS
  // (e.g. "/api/health") so that the bare path is still public but
  // "/api/health-anything" is not.
  if (pathname === "/api/health") {
    return true;
  }
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
 * Returns the tenant slug (id), or null if the snapshot is loaded but the
 * hostname is unresolvable (enumeration protection).
 * Returns undefined when the snapshot is not available in this runtime context
 * (e.g., Edge Runtime — config is loaded lazily in Node.js route handlers).
 */
function resolveTenantFromHostname(hostname: string): string | null | undefined {
  const snapshot = getSnapshot();
  if (!snapshot) {
    // Config not available in this runtime context; caller should fall back
    // to URL-path-based tenant resolution.
    return undefined;
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

  // Extract tenant slug from first path segment (used for page-route redirects)
  const segments = pathname.split("/").filter(Boolean);
  const tenantSlug = segments[0];

  // Resolve tenant from hostname.
  // - If the config snapshot is loaded: strict hostname check (enumeration protection).
  // - If the snapshot is not yet loaded (Edge Runtime): hostnameResult === undefined.
  //   In that case, we defer full tenant validation to the route handlers and use the
  //   employee session to set tenant context headers.
  const hostnameResult = resolveTenantFromHostname(hostname);
  const snapshotLoaded = hostnameResult !== undefined;

  // When snapshot is loaded: enforce hostname-based tenant resolution (404 on mismatch).
  // When snapshot is not loaded: allow the request through; route handlers validate.
  //
  // Safety net: all tenant-scoped route handlers call ensureConfigLoaded() and validate
  // the tenant slug against the loaded config snapshot (returning 404 on failure) before
  // serving any data. Auth routes (signin, callback, signout) use validateTenantSlug()
  // which wraps ensureConfigLoaded(). Protected routes (intake, training) call
  // ensureConfigLoaded() directly and check snapshot.tenants.get(tenantSlug). This
  // ensures tenant isolation even when the Edge Runtime cannot load config synchronously.
  if (snapshotLoaded && !hostnameResult) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Resolved tenant for headers and redirect targets.
  // Prefer hostname resolution when available; fall back to URL slug (page routes only).
  // API routes starting with /api/ use the employee session tenant set later.
  const resolvedTenantId = snapshotLoaded ? (hostnameResult as string) : (tenantSlug ?? null);

  if (!tenantSlug) {
    // No tenant slug in the path and no hostname-resolved tenant — cannot
    // determine a redirect target, so return 404 instead of redirecting to
    // "/null" (which would be a broken URL).
    if (resolvedTenantId === null) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
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

  // When snapshot is not loaded, use the employee's session tenantId for context.
  // Route handlers will perform their own tenant validation.
  const effectiveTenantId = snapshotLoaded
    ? (resolvedTenantId as string)
    : (employee?.tenantId ?? resolvedTenantId ?? null);

  // No valid session — redirect to sign-in
  if (!employee) {
    const redirectTenant = effectiveTenantId ?? tenantSlug ?? "unknown";
    const signInUrl = new URL(`/${redirectTenant}/auth/signin`, request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Session expired — redirect to sign-in and clear the cookie
  if (employee.expiresAt < Date.now()) {
    const signInUrl = new URL(`/${effectiveTenantId ?? "unknown"}/auth/signin`, request.url);
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

  // Tenant mismatch — only enforce when the snapshot is loaded and hostname resolution
  // is authoritative. Skip when snapshot is not available (Edge context).
  if (snapshotLoaded && employee.tenantId !== (effectiveTenantId as string)) {
    const signInUrl = new URL(`/${effectiveTenantId ?? "unknown"}/auth/signin`, request.url);
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
  if (effectiveTenantId) {
    requestHeaders.set("x-tenant-id", effectiveTenantId);
  }
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
