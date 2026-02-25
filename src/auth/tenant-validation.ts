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
 * Tenant slug validation for auth route handlers.
 * Returns generic 404 for invalid/unknown slugs to prevent tenant enumeration.
 * FR-006: Tenant isolation — never leak tenant existence.
 */

import { ensureConfigLoaded } from "../config/index";
import type { Tenant } from "../tenant/types";

export interface TenantValidationResult {
  valid: true;
  tenant: Tenant;
}

export interface TenantValidationFailure {
  valid: false;
}

export type TenantLookupResult = TenantValidationResult | TenantValidationFailure;

/**
 * Validate that a tenant slug maps to a known tenant.
 * Returns the Tenant object if valid, or a failure result.
 * The caller should return a generic 404 on failure — never reveal
 * whether the slug was syntactically invalid vs. simply unknown.
 * Lazily loads config on first call if not already loaded.
 *
 * When `hostname` is provided and the tenant has configured hostnames,
 * validates that the request hostname matches one of them (case-insensitive).
 * This prevents cross-tenant access via a valid slug on an unrelated hostname.
 */
export async function validateTenantSlug(
  slug: string,
  hostname?: string,
): Promise<TenantLookupResult> {
  const snapshot = await ensureConfigLoaded();
  if (!snapshot) {
    return { valid: false };
  }

  const tenant = snapshot.tenants.get(slug);
  if (!tenant) {
    return { valid: false };
  }

  if (hostname && tenant.hostnames.length > 0) {
    const normalizedHostname = hostname.toLowerCase();
    const hostnameMatch = tenant.hostnames.some((h) => h.toLowerCase() === normalizedHostname);
    if (!hostnameMatch) {
      return { valid: false };
    }
  }

  return { valid: true, tenant };
}

/**
 * Validate that an email domain is allowed for the given tenant.
 * If the tenant has emailDomains configured, the email domain must
 * match one of them. If no emailDomains are configured, all domains
 * are accepted (non-strict mode).
 */
export function validateEmailDomainForTenant(tenant: Tenant, emailDomain: string): boolean {
  // If no email domains are configured, accept all (non-strict)
  if (tenant.emailDomains.length === 0) {
    return true;
  }

  const normalizedDomain = emailDomain.toLowerCase();
  return tenant.emailDomains.some((d) => d.toLowerCase() === normalizedDomain);
}
