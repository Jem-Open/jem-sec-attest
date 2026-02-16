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
 * Contract definitions for the multi-tenant configuration system.
 * These interfaces define the boundaries between modules.
 *
 * NOTE: This file is a design artifact, not production code.
 * It will be moved to src/ during implementation.
 */

// ─── ConfigProvider ──────────────────────────────────────────────

/**
 * Abstraction over how tenant configuration files are loaded.
 * Constitution Principle V: Pluggable Architecture — config provider
 * must be an adapter interface (file system, Git, remote vault).
 */
export interface ConfigProvider {
  /**
   * Load the base/default configuration.
   * @throws ConfigLoadError if defaults file is missing or unparseable.
   */
  loadDefaults(): Promise<RawConfig>;

  /**
   * Discover and load all tenant configuration files.
   * @returns Array of raw tenant configs with source file metadata.
   * @throws ConfigLoadError if the config directory is empty or unreadable.
   */
  loadTenants(): Promise<RawTenantConfig[]>;
}

/**
 * Reference implementation: reads YAML/JSON from a local directory.
 */
export interface FileConfigProviderOptions {
  /** Path to the config directory. Defaults to ./config */
  configDir: string;
  /** Filename for the defaults file. Defaults to defaults.yaml */
  defaultsFile?: string;
  /** Subdirectory for tenant files. Defaults to tenants/ */
  tenantsDir?: string;
}

// ─── Raw Config Types (pre-validation) ──────────────────────────

export interface RawConfig {
  [key: string]: unknown;
}

export interface RawTenantConfig {
  /** The raw parsed content (before env substitution and validation). */
  content: RawConfig;
  /** Source file path, used in error messages. */
  sourceFile: string;
  /** Tenant ID derived from filename (e.g., acme-corp.yaml → acme-corp). */
  tenantId: string;
}

// ─── Validated Config Types ─────────────────────────────────────

export interface TenantSettings {
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    displayName?: string;
  };
  features?: Record<string, boolean>;
  integrations?: {
    webhookUrl?: string;
    ssoProvider?: string;
  };
  retention?: {
    days?: number;
  };
  [key: string]: unknown;
}

export interface Tenant {
  id: string;
  name: string;
  hostnames: string[];
  emailDomains: string[];
  settings: TenantSettings;
}

// ─── ConfigSnapshot (immutable after load) ──────────────────────

export interface ConfigSnapshot {
  tenants: ReadonlyMap<string, Tenant>;
  hostnameIndex: ReadonlyMap<string, string>;
  emailDomainIndex: ReadonlyMap<string, string>;
  configHash: string;
  loadedAt: Date;
}

// ─── TenantResolver ─────────────────────────────────────────────

export interface TenantResolverContext {
  /** Hostname from the incoming HTTP request (e.g., Host header). */
  hostname?: string;
  /** Email domain extracted from the authenticated user's email. */
  emailDomain?: string;
}

export interface TenantResolver {
  /**
   * Resolve the tenant for the given request/user context.
   * Precedence: hostname > emailDomain.
   *
   * @returns The resolved Tenant, or null if no match.
   */
  resolve(context: TenantResolverContext): Tenant | null;
}

// ─── StorageAdapter ─────────────────────────────────────────────

/**
 * Minimal storage adapter interface.
 * Constitution Principle V: Pluggable — relational DB, object store.
 * Constitution Principle III: Every method enforces tenantId scoping.
 */
export interface StorageAdapter {
  /** Initialize the adapter (run migrations, verify schema). */
  initialize(): Promise<void>;

  /** Store a record. */
  create<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    data: T,
  ): Promise<T & { id: string }>;

  /** Retrieve a record by ID. */
  findById<T>(tenantId: string, collection: string, id: string): Promise<T | null>;

  /** Query records with filters. */
  findMany<T>(tenantId: string, collection: string, query: QueryFilter): Promise<T[]>;

  /** Update a record by ID. */
  update<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    id: string,
    data: Partial<T>,
  ): Promise<T>;

  /** Delete a record by ID. */
  delete(tenantId: string, collection: string, id: string): Promise<void>;

  /** Execute operations within a transaction. */
  transaction<R>(tenantId: string, fn: (tx: TransactionContext) => Promise<R>): Promise<R>;

  /** Return adapter metadata for audit evidence. */
  getMetadata(): StorageMetadata;

  /** Graceful shutdown. */
  close(): Promise<void>;
}

export interface QueryFilter {
  where?: Record<string, unknown>;
  orderBy?: { field: string; direction: "asc" | "desc" }[];
  limit?: number;
  offset?: number;
}

export interface TransactionContext {
  create<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    data: T,
  ): Promise<T & { id: string }>;
  findById<T>(tenantId: string, collection: string, id: string): Promise<T | null>;
  update<T extends Record<string, unknown>>(
    tenantId: string,
    collection: string,
    id: string,
    data: Partial<T>,
  ): Promise<T>;
  delete(tenantId: string, collection: string, id: string): Promise<void>;
}

export interface StorageMetadata {
  adapterName: string;
  adapterVersion: string;
}

// ─── Errors ─────────────────────────────────────────────────────

export interface ConfigError {
  /** Source file that caused the error (if applicable). */
  file?: string;
  /** JSON path to the offending field (e.g., "settings.branding.logoUrl"). */
  path?: string;
  /** Human-readable error message. */
  message: string;
}
