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
 * Contract tests for ConfigProvider interface implementations.
 * Constitution Principle V: Pluggable Architecture.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config/errors.js";
import { FileConfigProvider } from "../../src/config/file-provider.js";
import type { ConfigProvider } from "../../src/config/provider.js";

/**
 * Reusable contract test suite for ConfigProvider implementations.
 * Any implementation of ConfigProvider should pass these tests.
 */
function runConfigProviderContractTests(
  name: string,
  factory: () => ConfigProvider | Promise<ConfigProvider>,
): void {
  describe(`ConfigProvider contract: ${name}`, () => {
    let provider: ConfigProvider;
    let tempDirs: string[] = [];

    beforeEach(async () => {
      provider = await factory();
    });

    afterEach(async () => {
      // Clean up temporary directories
      for (const dir of tempDirs) {
        await rm(dir, { recursive: true, force: true });
      }
      tempDirs = [];
    });

    it("loadDefaults() returns a valid raw config object with a 'defaults' key", async () => {
      const config = await provider.loadDefaults();

      expect(config).toBeDefined();
      expect(typeof config).toBe("object");
      expect(config).toHaveProperty("defaults");
      expect(typeof config.defaults).toBe("object");
    });

    it("loadTenants() returns an array of RawTenantConfig with sourceFile and tenantId", async () => {
      const tenants = await provider.loadTenants();

      expect(Array.isArray(tenants)).toBe(true);
      expect(tenants.length).toBeGreaterThan(0);

      for (const tenant of tenants) {
        expect(tenant).toHaveProperty("content");
        expect(tenant).toHaveProperty("sourceFile");
        expect(tenant).toHaveProperty("tenantId");
        expect(typeof tenant.content).toBe("object");
        expect(typeof tenant.sourceFile).toBe("string");
        expect(typeof tenant.tenantId).toBe("string");
        expect(tenant.sourceFile).not.toBe("");
        expect(tenant.tenantId).not.toBe("");
      }
    });

    it("loadTenants() throws ConfigError when tenants directory is empty", async () => {
      // Create a temporary directory with defaults.yaml but empty tenants/
      const tempDir = join(import.meta.dirname, `../../temp-test-${Date.now()}`);
      tempDirs.push(tempDir);

      await mkdir(tempDir, { recursive: true });
      await mkdir(join(tempDir, "tenants"), { recursive: true });
      await writeFile(join(tempDir, "defaults.yaml"), "defaults:\n  test: true\n", "utf-8");

      const emptyProvider = new FileConfigProvider({ configDir: tempDir });

      await expect(emptyProvider.loadTenants()).rejects.toThrow(ConfigError);
      await expect(emptyProvider.loadTenants()).rejects.toThrow(
        "No tenant configuration files found in tenants directory",
      );
    });

    it("loadDefaults() throws ConfigError when defaults file is missing", async () => {
      // Create a temporary directory without defaults.yaml
      const tempDir = join(import.meta.dirname, `../../temp-test-${Date.now()}`);
      tempDirs.push(tempDir);

      await mkdir(tempDir, { recursive: true });

      const missingDefaultsProvider = new FileConfigProvider({ configDir: tempDir });

      await expect(missingDefaultsProvider.loadDefaults()).rejects.toThrow(ConfigError);
      await expect(missingDefaultsProvider.loadDefaults()).rejects.toThrow(
        /Defaults file not found/,
      );
    });
  });
}

// Run contract tests with FileConfigProvider using valid test fixtures
runConfigProviderContractTests("FileConfigProvider", () => {
  const validFixturesPath = join(import.meta.dirname, "../fixtures/valid");
  return new FileConfigProvider({ configDir: validFixturesPath });
});
