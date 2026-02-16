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
 * FileConfigProvider — reads YAML/JSON tenant configs from a local directory.
 * Constitution Principle V: Pluggable Architecture — reference implementation.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, parse as parsePath } from "node:path";
import { parse as parseYaml } from "yaml";
import { ConfigError } from "./errors.js";
import type {
  ConfigProvider,
  FileConfigProviderOptions,
  RawConfig,
  RawTenantConfig,
} from "./provider.js";

const SUPPORTED_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);

export class FileConfigProvider implements ConfigProvider {
  private readonly configDir: string;
  private readonly defaultsFile: string;
  private readonly tenantsDir: string;

  constructor(options: FileConfigProviderOptions) {
    this.configDir = options.configDir;
    this.defaultsFile = options.defaultsFile ?? "defaults.yaml";
    this.tenantsDir = options.tenantsDir ?? "tenants";
  }

  async loadDefaults(): Promise<RawConfig> {
    const filePath = join(this.configDir, this.defaultsFile);
    try {
      const content = await readFile(filePath, "utf-8");
      return this.parseFile(content, filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ConfigError({
          file: filePath,
          message: `Defaults file not found: ${filePath}`,
        });
      }
      throw error;
    }
  }

  async loadTenants(): Promise<RawTenantConfig[]> {
    const tenantsPath = join(this.configDir, this.tenantsDir);
    let entries: string[];

    try {
      entries = await readdir(tenantsPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ConfigError({
          file: tenantsPath,
          message: `Tenants directory not found: ${tenantsPath}`,
        });
      }
      throw error;
    }

    const tenantFiles = entries.filter((f) => {
      const ext = parsePath(f).ext.toLowerCase();
      return SUPPORTED_EXTENSIONS.has(ext);
    });

    if (tenantFiles.length === 0) {
      throw new ConfigError({
        file: tenantsPath,
        message: "No tenant configuration files found in tenants directory",
      });
    }

    const tenants: RawTenantConfig[] = [];
    for (const file of tenantFiles.sort()) {
      const filePath = join(tenantsPath, file);
      const raw = await readFile(filePath, "utf-8");
      const { name } = parsePath(file);
      tenants.push({
        content: this.parseFile(raw, filePath),
        sourceFile: filePath,
        tenantId: name,
      });
    }

    return tenants;
  }

  /**
   * Returns the raw text content of a file (before env substitution).
   * Used by the validator to perform substitution on raw text.
   */
  async loadRawText(filePath: string): Promise<string> {
    return readFile(filePath, "utf-8");
  }

  private parseFile(content: string, filePath: string): RawConfig {
    const ext = parsePath(filePath).ext.toLowerCase();
    try {
      if (ext === ".json") {
        return JSON.parse(content) as RawConfig;
      }
      return parseYaml(content) as RawConfig;
    } catch (error) {
      throw new ConfigError({
        file: filePath,
        message: `Failed to parse ${ext === ".json" ? "JSON" : "YAML"}: ${(error as Error).message}`,
      });
    }
  }
}
