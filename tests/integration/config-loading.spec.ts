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

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { redactSensitiveValues } from "../../src/config/env-substitute.js";
import { FileConfigProvider } from "../../src/config/file-provider.js";
import { loadConfig, loadConfigFromFiles } from "../../src/config/index.js";

const VALID_FIXTURES = join(import.meta.dirname, "../fixtures/valid");

describe("Config loading pipeline (integration)", () => {
  it("loads valid config fixtures successfully", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);

    expect(snapshot.tenants.size).toBe(2);
    expect(snapshot.tenants.has("tenant-a")).toBe(true);
    expect(snapshot.tenants.has("tenant-b")).toBe(true);
  });

  it("merges tenant settings with defaults", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const tenantA = snapshot.tenants.get("tenant-a");
    expect(tenantA).toBeDefined();

    // Overridden values
    expect(tenantA?.settings.branding?.displayName).toBe("Tenant A Portal");
    expect(tenantA?.settings.features?.featureB).toBe(true);

    // Inherited defaults
    expect(tenantA?.settings.branding?.primaryColor).toBe("#000000");
    expect(tenantA?.settings.features?.featureA).toBe(true);
    expect(tenantA?.settings.retention?.days).toBe(90);
  });

  it("builds hostname and email domain indexes", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);

    expect(snapshot.hostnameIndex.get("a.example.com")).toBe("tenant-a");
    expect(snapshot.hostnameIndex.get("b.example.com")).toBe("tenant-b");
    expect(snapshot.emailDomainIndex.get("tenant-a.com")).toBe("tenant-a");
    expect(snapshot.emailDomainIndex.get("tenant-b.com")).toBe("tenant-b");
  });

  it("produces a config hash", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);

    expect(snapshot.configHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces deterministic hash across loads", async () => {
    const snapshot1 = await loadConfigFromFiles(VALID_FIXTURES);
    const snapshot2 = await loadConfigFromFiles(VALID_FIXTURES);

    expect(snapshot1.configHash).toBe(snapshot2.configHash);
  });

  it("substitutes env vars with ${VAR:-default} syntax", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const tenantB = snapshot.tenants.get("tenant-b");
    expect(tenantB).toBeDefined();

    // tenant-b.yaml uses ${TEST_WEBHOOK_URL:-http://localhost:9999/hook}
    expect(tenantB?.settings.integrations?.webhookUrl).toBe("http://localhost:9999/hook");
  });

  it("substitutes env vars from environment", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES, {
      env: { TEST_WEBHOOK_URL: "https://real-hook.example.com" },
    });
    const tenantB = snapshot.tenants.get("tenant-b");
    expect(tenantB).toBeDefined();

    expect(tenantB?.settings.integrations?.webhookUrl).toBe("https://real-hook.example.com");
  });

  it("sets loadedAt timestamp", async () => {
    const before = new Date();
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const after = new Date();

    expect(snapshot.loadedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(snapshot.loadedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

const GOLDEN_FIXTURES = join(import.meta.dirname, "../fixtures/golden");
const EXPECTED_GOLDEN_HASH = "ae3d7cfac5f1382cffa16ea9dcc3cdad9a9d8e5a463231599109dc4bbd81a147";

describe("Golden fixture hash determinism (integration)", () => {
  it("golden config produces expected hash", async () => {
    const snapshot = await loadConfigFromFiles(GOLDEN_FIXTURES);
    expect(snapshot.configHash).toBe(EXPECTED_GOLDEN_HASH);
  });

  it("golden config hash is stable across loads", async () => {
    const snapshot1 = await loadConfigFromFiles(GOLDEN_FIXTURES);
    const snapshot2 = await loadConfigFromFiles(GOLDEN_FIXTURES);
    expect(snapshot1.configHash).toBe(snapshot2.configHash);
    expect(snapshot1.configHash).toBe(EXPECTED_GOLDEN_HASH);
  });
});

describe("Env var security (integration)", () => {
  it("resolves a sensitive env var (ACME_WEBHOOK_SECRET) into tenant settings", async () => {
    const secretValue = "super-secret-webhook-value";
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES, {
      env: { TEST_WEBHOOK_URL: secretValue },
    });
    const tenantB = snapshot.tenants.get("tenant-b");
    expect(tenantB).toBeDefined();

    // The secret value should be resolved in the tenant's settings
    expect(tenantB?.settings.integrations?.webhookUrl).toBe(secretValue);
  });

  it("redactSensitiveValues correctly redacts the resolved secret value", async () => {
    const secretValue = "top-secret-hook-url";
    const envKey = "ACME_WEBHOOK_SECRET";
    const originalEnv = process.env[envKey];
    process.env[envKey] = secretValue;
    try {
      // Simulate a config object that contains the resolved secret value
      const configObj: Record<string, unknown> = {
        webhookUrl: secretValue,
        displayName: "Tenant B Portal",
        nested: {
          anotherSecret: secretValue,
          safeSetting: "visible",
        },
      };

      const redacted = redactSensitiveValues(configObj, new Set([envKey]));

      expect(redacted.webhookUrl).toBe("[REDACTED]");
      expect(redacted.displayName).toBe("Tenant B Portal");
      const nested = redacted.nested as Record<string, unknown>;
      expect(nested.anotherSecret).toBe("[REDACTED]");
      expect(nested.safeSetting).toBe("visible");
    } finally {
      if (originalEnv === undefined) {
        Reflect.deleteProperty(process.env, envKey);
      } else {
        process.env[envKey] = originalEnv;
      }
    }
  });
});

describe("loadConfig via ConfigProvider (integration)", () => {
  it("loads config through the provider interface", async () => {
    const provider = new FileConfigProvider({ configDir: VALID_FIXTURES });
    const snapshot = await loadConfig(provider);

    expect(snapshot.tenants.size).toBe(2);
    expect(snapshot.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.hostnameIndex.size).toBeGreaterThan(0);
    expect(snapshot.emailDomainIndex.size).toBeGreaterThan(0);
    expect(snapshot.loadedAt).toBeInstanceOf(Date);
  });
});
