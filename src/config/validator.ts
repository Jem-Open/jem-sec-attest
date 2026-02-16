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
 * Config validation pipeline:
 * 1. Substitute env vars in raw text
 * 2. Parse YAML
 * 3. Validate individual files against Zod schema
 * 4. Deep merge tenant settings with defaults
 * 5. Validate merged config
 * 6. Check cross-tenant uniqueness (hostnames, email domains, tenant IDs)
 */

import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";
import type { Tenant, TenantSettings } from "../tenant/types.js";
import { type SubstitutionResult, substituteEnvVars } from "./env-substitute.js";
import { type ConfigErrorDetail, ConfigValidationError } from "./errors.js";
import { type BaseConfigParsed, BaseConfigSchema, TenantConfigSchema } from "./schema.js";

export interface ValidatedConfig {
  tenants: Tenant[];
  sensitiveVars: ReadonlySet<string>;
}

/**
 * Deep merge two TenantSettings objects. Tenant values win over defaults.
 * Arrays are replaced, not concatenated. Objects are recursively merged.
 */
export function deepMergeSettings(
  defaults: TenantSettings,
  overrides: TenantSettings,
): TenantSettings {
  const result: Record<string, unknown> = {};

  const allKeys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);

  for (const key of allKeys) {
    const defaultVal = (defaults as Record<string, unknown>)[key];
    const overrideVal = (overrides as Record<string, unknown>)[key];

    if (overrideVal === undefined) {
      result[key] = defaultVal;
    } else if (defaultVal === undefined) {
      result[key] = overrideVal;
    } else if (
      typeof defaultVal === "object" &&
      defaultVal !== null &&
      !Array.isArray(defaultVal) &&
      typeof overrideVal === "object" &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMergeSettings(defaultVal as TenantSettings, overrideVal as TenantSettings);
    } else {
      result[key] = overrideVal;
    }
  }

  return result as TenantSettings;
}

function zodErrorToDetails(error: ZodError, sourceFile: string): ConfigErrorDetail[] {
  return error.issues.map((issue) => ({
    file: sourceFile,
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/**
 * Validate a raw defaults file text (after env substitution + parse).
 */
export function validateDefaults(
  rawText: string,
  sourceFile: string,
  env?: Record<string, string | undefined>,
): { defaults: BaseConfigParsed; sensitiveVars: ReadonlySet<string> } {
  const sub = substituteEnvVars(rawText, sourceFile, env);
  const parsed = parseYaml(sub.text);
  const result = BaseConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new ConfigValidationError(zodErrorToDetails(result.error, sourceFile));
  }

  return { defaults: result.data, sensitiveVars: sub.sensitiveVars };
}

/**
 * Validate a single tenant config file (after env substitution + parse).
 */
export function validateTenantConfig(
  rawText: string,
  sourceFile: string,
  tenantId: string,
  env?: Record<string, string | undefined>,
): { tenant: Tenant; sub: SubstitutionResult } {
  const sub = substituteEnvVars(rawText, sourceFile, env);
  const parsed = parseYaml(sub.text);
  const result = TenantConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new ConfigValidationError(zodErrorToDetails(result.error, sourceFile));
  }

  const data = result.data;
  const tenant: Tenant = {
    id: tenantId,
    name: data.name,
    hostnames: data.hostnames,
    emailDomains: data.emailDomains,
    settings: data.settings,
  };

  return { tenant, sub };
}

/**
 * Check global uniqueness of hostnames, email domains, and tenant IDs.
 */
export function validateUniqueness(tenants: Tenant[]): void {
  const errors: ConfigErrorDetail[] = [];
  const hostnameSeen = new Map<string, string>();
  const emailDomainSeen = new Map<string, string>();
  const tenantIdSeen = new Map<string, boolean>();

  for (const tenant of tenants) {
    if (tenantIdSeen.has(tenant.id)) {
      errors.push({
        message: `Duplicate tenant ID: "${tenant.id}"`,
      });
    }
    tenantIdSeen.set(tenant.id, true);

    for (const hostname of tenant.hostnames) {
      const lower = hostname.toLowerCase();
      const existing = hostnameSeen.get(lower);
      if (existing) {
        errors.push({
          message: `Duplicate hostname "${hostname}" claimed by tenants "${existing}" and "${tenant.id}"`,
        });
      }
      hostnameSeen.set(lower, tenant.id);
    }

    for (const domain of tenant.emailDomains) {
      const lower = domain.toLowerCase();
      const existing = emailDomainSeen.get(lower);
      if (existing) {
        errors.push({
          message: `Duplicate email domain "${domain}" claimed by tenants "${existing}" and "${tenant.id}"`,
        });
      }
      emailDomainSeen.set(lower, tenant.id);
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
}
