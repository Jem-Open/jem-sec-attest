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
 * Public config API.
 * Orchestrates: load → substitute → validate → merge → hash → freeze.
 */

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { ConfigSnapshot, Tenant } from "../tenant/types";
import { substituteEnvVars } from "./env-substitute";
import { type ConfigErrorDetail, ConfigValidationError } from "./errors";
import { computeConfigHash } from "./hasher";
import type { ConfigProvider } from "./provider";
import { BaseConfigSchema, TenantConfigSchema } from "./schema";
import { getSnapshot as getSnapshotFromStore, setSnapshot } from "./snapshot";
import { deepMergeSettings, validateUniqueness } from "./validator";

export interface LoadConfigOptions {
  env?: Record<string, string | undefined>;
}

/**
 * Load, validate, and freeze the tenant configuration.
 * This is the main entry point for the config system.
 */
export async function loadConfig(
  provider: ConfigProvider,
  _options: LoadConfigOptions = {},
): Promise<ConfigSnapshot> {
  const errors: ConfigErrorDetail[] = [];

  // 1. Load and validate defaults
  const rawDefaults = await provider.loadDefaults();
  // We need raw text for env substitution. If provider gives us parsed object,
  // we need to load the raw text separately for substitution.
  // For now, we work with the parsed object directly since FileConfigProvider
  // already parses. We'll handle substitution at the raw text level
  // by re-reading files in a more complete implementation.
  // Actually, let's validate the parsed defaults directly.
  const defaultsResult = BaseConfigSchema.safeParse(rawDefaults);
  if (!defaultsResult.success) {
    for (const issue of defaultsResult.error.issues) {
      errors.push({
        path: issue.path.join("."),
        message: issue.message,
      });
    }
    throw new ConfigValidationError(errors);
  }
  const baseDefaults = defaultsResult.data.defaults;

  // 2. Load and validate tenant configs
  const rawTenants = await provider.loadTenants();
  const tenants: Tenant[] = [];

  for (const raw of rawTenants) {
    const tenantResult = TenantConfigSchema.safeParse(raw.content);
    if (!tenantResult.success) {
      for (const issue of tenantResult.error.issues) {
        errors.push({
          file: raw.sourceFile,
          path: issue.path.join("."),
          message: issue.message,
        });
      }
      continue;
    }

    const data = tenantResult.data;

    // 3. Deep merge with defaults
    const mergedSettings = deepMergeSettings(baseDefaults, data.settings);

    const tenant: Tenant = {
      id: raw.tenantId,
      name: data.name,
      hostnames: data.hostnames,
      emailDomains: data.emailDomains,
      settings: mergedSettings,
    };

    tenants.push(tenant);
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  // 4. Cross-tenant uniqueness validation
  validateUniqueness(tenants);

  // 5. Build indexes
  const hostnameIndex = new Map<string, string>();
  const emailDomainIndex = new Map<string, string>();

  for (const tenant of tenants) {
    for (const hostname of tenant.hostnames) {
      hostnameIndex.set(hostname.toLowerCase(), tenant.id);
    }
    for (const domain of tenant.emailDomains) {
      emailDomainIndex.set(domain.toLowerCase(), tenant.id);
    }
  }

  // 6. Compute hash
  const configHash = computeConfigHash(tenants);

  // 7. Build and freeze snapshot
  const tenantsMap = new Map<string, Tenant>();
  for (const tenant of tenants) {
    tenantsMap.set(tenant.id, Object.freeze(tenant));
  }

  const snapshot: ConfigSnapshot = Object.freeze({
    tenants: tenantsMap,
    hostnameIndex,
    emailDomainIndex,
    configHash,
    loadedAt: new Date(),
  });

  setSnapshot(snapshot);
  return snapshot;
}

/**
 * Load config with env var substitution on raw file text.
 * This is the full pipeline: read raw text → substitute → parse → validate → merge → hash.
 */
export async function loadConfigFromFiles(
  configDir: string,
  options: LoadConfigOptions = {},
): Promise<ConfigSnapshot> {
  const { FileConfigProvider } = await import("./file-provider");
  const provider = new FileConfigProvider({ configDir });
  const env = options.env;
  const errors: ConfigErrorDetail[] = [];
  const allSensitiveVars = new Set<string>();

  // Load raw text for defaults and substitute env vars
  const defaultsRaw = await provider.loadRawText(`${configDir}/defaults.yaml`);
  const defaultsSub = substituteEnvVars(defaultsRaw, `${configDir}/defaults.yaml`, env);
  for (const v of defaultsSub.sensitiveVars) allSensitiveVars.add(v);

  const defaultsParsed = parseYaml(defaultsSub.text);
  const defaultsResult = BaseConfigSchema.safeParse(defaultsParsed);
  if (!defaultsResult.success) {
    for (const issue of defaultsResult.error.issues) {
      errors.push({
        file: `${configDir}/defaults.yaml`,
        path: issue.path.join("."),
        message: issue.message,
      });
    }
    throw new ConfigValidationError(errors);
  }
  const baseDefaults = defaultsResult.data.defaults;

  // Load raw tenant files, substitute, parse, validate
  const rawTenants = await provider.loadTenants();
  const tenants: Tenant[] = [];

  for (const raw of rawTenants) {
    // Re-read raw text for substitution
    const tenantRaw = await readFile(raw.sourceFile, "utf-8");
    const tenantSub = substituteEnvVars(tenantRaw, raw.sourceFile, env);
    for (const v of tenantSub.sensitiveVars) allSensitiveVars.add(v);

    const tenantParsed = parseYaml(tenantSub.text);
    const tenantResult = TenantConfigSchema.safeParse(tenantParsed);
    if (!tenantResult.success) {
      for (const issue of tenantResult.error.issues) {
        errors.push({
          file: raw.sourceFile,
          path: issue.path.join("."),
          message: issue.message,
        });
      }
      continue;
    }

    const data = tenantResult.data;
    const mergedSettings = deepMergeSettings(baseDefaults, data.settings);

    tenants.push({
      id: raw.tenantId,
      name: data.name,
      hostnames: data.hostnames,
      emailDomains: data.emailDomains,
      settings: mergedSettings,
    });
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  validateUniqueness(tenants);

  const hostnameIndex = new Map<string, string>();
  const emailDomainIndex = new Map<string, string>();
  for (const tenant of tenants) {
    for (const hostname of tenant.hostnames) {
      hostnameIndex.set(hostname.toLowerCase(), tenant.id);
    }
    for (const domain of tenant.emailDomains) {
      emailDomainIndex.set(domain.toLowerCase(), tenant.id);
    }
  }

  const configHash = computeConfigHash(tenants);
  const tenantsMap = new Map<string, Tenant>();
  for (const tenant of tenants) {
    tenantsMap.set(tenant.id, Object.freeze(tenant));
  }

  const snapshot: ConfigSnapshot = Object.freeze({
    tenants: tenantsMap,
    hostnameIndex,
    emailDomainIndex,
    configHash,
    loadedAt: new Date(),
  });

  setSnapshot(snapshot);
  return snapshot;
}

/**
 * Get the current loaded config snapshot.
 * Re-exported from snapshot.ts for Node.js callers that import from this file.
 */
export { getSnapshot } from "./snapshot";

let _initPromise: Promise<ConfigSnapshot> | null = null;

/**
 * Ensures config is loaded, loading it lazily on first call.
 * Safe to call concurrently — subsequent calls share the same Promise.
 * Reads config directory from CONFIG_DIR env var or defaults to ./config.
 */
export async function ensureConfigLoaded(): Promise<ConfigSnapshot | null> {
  const existing = getSnapshotFromStore();
  if (existing) return existing;

  if (!_initPromise) {
    _initPromise = (async () => {
      const { join } = await import("node:path");
      const configDir = process.env.CONFIG_DIR ?? join(process.cwd(), "config");
      return loadConfigFromFiles(configDir, { env: process.env });
    })();
  }

  try {
    return await _initPromise;
  } catch (e) {
    _initPromise = null;
    console.error("[config] ensureConfigLoaded failed:", e);
    return null;
  }
}
