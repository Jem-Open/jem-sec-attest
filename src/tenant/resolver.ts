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
 * TenantResolver — resolves tenants from hostname or email domain.
 * Precedence: hostname > emailDomain (FR-006).
 * Lookups are O(1) via pre-built indexes. Case-insensitive.
 */

import type { ConfigSnapshot, Tenant, TenantResolverContext } from "./types.js";

export class TenantResolverImpl {
  private readonly tenants: ReadonlyMap<string, Tenant>;
  private readonly hostnameIndex: ReadonlyMap<string, string>;
  private readonly emailDomainIndex: ReadonlyMap<string, string>;

  constructor(snapshot: ConfigSnapshot) {
    this.tenants = snapshot.tenants;
    this.hostnameIndex = snapshot.hostnameIndex;
    this.emailDomainIndex = snapshot.emailDomainIndex;
  }

  /**
   * Resolve the tenant for the given context.
   * Precedence: hostname > emailDomain.
   * Returns null if no match found.
   */
  resolve(context: TenantResolverContext): Tenant | null {
    if (context.hostname) {
      const tenantId = this.hostnameIndex.get(context.hostname.toLowerCase());
      if (tenantId) {
        return this.tenants.get(tenantId) ?? null;
      }
    }

    if (context.emailDomain) {
      const tenantId = this.emailDomainIndex.get(context.emailDomain.toLowerCase());
      if (tenantId) {
        return this.tenants.get(tenantId) ?? null;
      }
    }

    return null;
  }
}

/**
 * Factory function to create a TenantResolver from a ConfigSnapshot.
 */
export function createResolver(snapshot: ConfigSnapshot): TenantResolverImpl {
  return new TenantResolverImpl(snapshot);
}
