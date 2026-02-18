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

import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, ConfigValidationError } from "../../src/config/errors.js";
import { loadConfigFromFiles } from "../../src/config/index.js";

const FIXTURES_VALID = join(import.meta.dirname, "../fixtures/valid");
const FIXTURES_INVALID = join(import.meta.dirname, "../fixtures/invalid");

describe("fail-fast on invalid configuration", () => {
  const tempDirs: string[] = [];

  async function makeTempConfigDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jem-sec-attest-test-"));
    tempDirs.push(dir);
    await mkdir(join(dir, "tenants"), { recursive: true });
    return dir;
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("rejects a tenant file missing the required name field", async () => {
    const dir = await makeTempConfigDir();
    await copyFile(join(FIXTURES_VALID, "defaults.yaml"), join(dir, "defaults.yaml"));
    await copyFile(
      join(FIXTURES_INVALID, "missing-name.yaml"),
      join(dir, "tenants", "missing-name.yaml"),
    );

    await expect(loadConfigFromFiles(dir)).rejects.toThrow(ConfigValidationError);
    try {
      await loadConfigFromFiles(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const cve = error as ConfigValidationError;
      expect(cve.errors.length).toBeGreaterThanOrEqual(1);
      const messages = cve.errors.map((e) => e.message).join("; ");
      expect(messages).toMatch(/required|name|expected string/i);
    }
  });

  it("rejects a tenant file with an unknown field (strict mode)", async () => {
    const dir = await makeTempConfigDir();
    await copyFile(join(FIXTURES_VALID, "defaults.yaml"), join(dir, "defaults.yaml"));
    await copyFile(
      join(FIXTURES_INVALID, "unknown-field.yaml"),
      join(dir, "tenants", "unknown-field.yaml"),
    );

    await expect(loadConfigFromFiles(dir)).rejects.toThrow(ConfigValidationError);
    try {
      await loadConfigFromFiles(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const cve = error as ConfigValidationError;
      expect(cve.errors.length).toBeGreaterThanOrEqual(1);
      const messages = cve.errors.map((e) => e.message).join("; ");
      expect(messages).toMatch(/unrecognized/i);
    }
  });

  it("throws ConfigError for unresolved environment variables", async () => {
    const dir = await makeTempConfigDir();
    await copyFile(join(FIXTURES_VALID, "defaults.yaml"), join(dir, "defaults.yaml"));
    await copyFile(
      join(FIXTURES_INVALID, "unresolved-env-var.yaml"),
      join(dir, "tenants", "unresolved-env-var.yaml"),
    );

    // Pass an empty env object so TOTALLY_MISSING_VAR is guaranteed absent
    await expect(loadConfigFromFiles(dir, { env: {} })).rejects.toThrow(ConfigError);
    try {
      await loadConfigFromFiles(dir, { env: {} });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("TOTALLY_MISSING_VAR");
    }
  });

  it("throws ConfigError when the tenants directory is empty", async () => {
    const dir = await makeTempConfigDir();
    await copyFile(join(FIXTURES_VALID, "defaults.yaml"), join(dir, "defaults.yaml"));
    // tenants/ directory exists but is empty — no tenant files

    await expect(loadConfigFromFiles(dir)).rejects.toThrow(ConfigError);
    try {
      await loadConfigFromFiles(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("No tenant configuration files found");
    }
  });

  it("rejects duplicate hostnames across tenants", async () => {
    const dir = await makeTempConfigDir();
    await copyFile(join(FIXTURES_VALID, "defaults.yaml"), join(dir, "defaults.yaml"));
    await copyFile(
      join(FIXTURES_VALID, "tenants", "tenant-a.yaml"),
      join(dir, "tenants", "tenant-a.yaml"),
    );
    await copyFile(
      join(FIXTURES_INVALID, "duplicate-hostname.yaml"),
      join(dir, "tenants", "duplicate-hostname.yaml"),
    );

    await expect(loadConfigFromFiles(dir)).rejects.toThrow(ConfigValidationError);
    try {
      await loadConfigFromFiles(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const cve = error as ConfigValidationError;
      expect(cve.errors.length).toBeGreaterThanOrEqual(1);
      const messages = cve.errors.map((e) => e.message).join("; ");
      expect(messages).toContain("Duplicate hostname");
      expect(messages).toContain("a.example.com");
    }
  });
});
