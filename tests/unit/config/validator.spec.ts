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

import { describe, expect, it } from "vitest";
import { ConfigValidationError } from "../../../src/config/errors.js";
import {
  deepMergeSettings,
  validateDefaults,
  validateTenantConfig,
  validateUniqueness,
} from "../../../src/config/validator.js";
import type { Tenant, TenantSettings } from "../../../src/tenant/types.js";

describe("deepMergeSettings", () => {
  it("returns defaults when overrides are empty", () => {
    const defaults: TenantSettings = {
      branding: { primaryColor: "#000" },
      features: { featureA: true },
    };
    const result = deepMergeSettings(defaults, {});
    expect(result.branding?.primaryColor).toBe("#000");
    expect(result.features?.featureA).toBe(true);
  });

  it("overrides specific values while keeping defaults for unspecified", () => {
    const defaults: TenantSettings = {
      branding: { primaryColor: "#000", displayName: "Default" },
      features: { featureA: true, featureB: false },
    };
    const overrides: TenantSettings = {
      branding: { primaryColor: "#fff" },
      features: { featureB: true },
    };
    const result = deepMergeSettings(defaults, overrides);
    expect(result.branding?.primaryColor).toBe("#fff");
    expect(result.branding?.displayName).toBe("Default");
    expect(result.features?.featureB).toBe(true);
  });

  it("adds new fields from overrides not in defaults", () => {
    const defaults: TenantSettings = {
      branding: { primaryColor: "#000" },
    };
    const overrides: TenantSettings = {
      retention: { days: 30 },
    };
    const result = deepMergeSettings(defaults, overrides);
    expect(result.branding?.primaryColor).toBe("#000");
    expect(result.retention?.days).toBe(30);
  });

  it("replaces arrays (does not concatenate)", () => {
    const defaults: TenantSettings = {
      features: { a: true, b: true },
    };
    const overrides: TenantSettings = {
      features: { a: false },
    };
    const result = deepMergeSettings(defaults, overrides);
    // features is Record, deep merged: a overridden, b kept
    expect(result.features?.a).toBe(false);
    expect(result.features?.b).toBe(true);
  });
});

describe("validateDefaults", () => {
  it("validates a correct defaults YAML", () => {
    const raw =
      "defaults:\n  branding:\n    primaryColor: '#000'\n  features:\n    featureA: true\n";
    const result = validateDefaults(raw, "defaults.yaml");
    expect(result.defaults.defaults.branding?.primaryColor).toBe("#000");
    expect(result.sensitiveVars.size).toBe(0);
  });

  it("throws ConfigValidationError for invalid defaults", () => {
    const raw = "invalid: true\n";
    expect(() => validateDefaults(raw, "defaults.yaml")).toThrow(ConfigValidationError);
  });

  it("tracks sensitive vars in defaults", () => {
    const raw = "defaults:\n  integrations:\n    webhookUrl: ${MY_SECRET}\n";
    const result = validateDefaults(raw, "defaults.yaml", { MY_SECRET: "s3cret" });
    expect(result.sensitiveVars.has("MY_SECRET")).toBe(true);
  });
});

describe("validateTenantConfig", () => {
  it("validates a correct tenant YAML", () => {
    const raw =
      'name: "Test"\nhostnames:\n  - test.example.com\nemailDomains:\n  - test.com\nsettings:\n  branding:\n    displayName: "Test"\n';
    const result = validateTenantConfig(raw, "tenants/test.yaml", "test");
    expect(result.tenant.id).toBe("test");
    expect(result.tenant.name).toBe("Test");
    expect(result.tenant.hostnames).toEqual(["test.example.com"]);
  });

  it("throws ConfigValidationError for invalid tenant YAML", () => {
    const raw = "invalid: true\n";
    expect(() => validateTenantConfig(raw, "tenants/bad.yaml", "bad")).toThrow(
      ConfigValidationError,
    );
  });

  it("substitutes env vars in tenant config", () => {
    const raw =
      'name: "Test"\nhostnames:\n  - test.example.com\nsettings:\n  integrations:\n    webhookUrl: ${HOOK_SECRET}\n';
    const result = validateTenantConfig(raw, "tenants/test.yaml", "test", {
      HOOK_SECRET: "https://hook.example.com",
    });
    expect(result.tenant.settings.integrations?.webhookUrl).toBe("https://hook.example.com");
    expect(result.sub.sensitiveVars.has("HOOK_SECRET")).toBe(true);
  });
});

describe("validateUniqueness", () => {
  const makeTenant = (partial: Partial<Tenant> & { id: string; name: string }): Tenant => ({
    hostnames: [],
    emailDomains: [],
    settings: {},
    ...partial,
  });

  it("passes for unique tenants", () => {
    const tenants = [
      makeTenant({ id: "a", name: "A", hostnames: ["a.com"], emailDomains: ["a.org"] }),
      makeTenant({ id: "b", name: "B", hostnames: ["b.com"], emailDomains: ["b.org"] }),
    ];
    expect(() => validateUniqueness(tenants)).not.toThrow();
  });

  it("rejects duplicate hostnames", () => {
    const tenants = [
      makeTenant({ id: "a", name: "A", hostnames: ["shared.com"] }),
      makeTenant({ id: "b", name: "B", hostnames: ["shared.com"] }),
    ];
    expect(() => validateUniqueness(tenants)).toThrow(ConfigValidationError);
  });

  it("rejects duplicate hostnames case-insensitively", () => {
    const tenants = [
      makeTenant({ id: "a", name: "A", hostnames: ["Shared.COM"] }),
      makeTenant({ id: "b", name: "B", hostnames: ["shared.com"] }),
    ];
    expect(() => validateUniqueness(tenants)).toThrow(ConfigValidationError);
  });

  it("rejects duplicate email domains", () => {
    const tenants = [
      makeTenant({ id: "a", name: "A", hostnames: ["a.com"], emailDomains: ["shared.org"] }),
      makeTenant({ id: "b", name: "B", hostnames: ["b.com"], emailDomains: ["shared.org"] }),
    ];
    expect(() => validateUniqueness(tenants)).toThrow(ConfigValidationError);
  });

  it("rejects duplicate tenant IDs", () => {
    const tenants = [
      makeTenant({ id: "same", name: "A", hostnames: ["a.com"] }),
      makeTenant({ id: "same", name: "B", hostnames: ["b.com"] }),
    ];
    expect(() => validateUniqueness(tenants)).toThrow(ConfigValidationError);
  });

  it("aggregates all uniqueness errors", () => {
    const tenants = [
      makeTenant({
        id: "same",
        name: "A",
        hostnames: ["shared.com"],
        emailDomains: ["shared.org"],
      }),
      makeTenant({
        id: "same",
        name: "B",
        hostnames: ["shared.com"],
        emailDomains: ["shared.org"],
      }),
    ];
    try {
      validateUniqueness(tenants);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const cve = error as ConfigValidationError;
      expect(cve.errors.length).toBeGreaterThanOrEqual(3); // duplicate id + hostname + email
    }
  });

  it("rejects duplicate email domains case-insensitively", () => {
    const tenants = [
      makeTenant({ id: "a", name: "A", hostnames: ["a.com"], emailDomains: ["Shared.ORG"] }),
      makeTenant({ id: "b", name: "B", hostnames: ["b.com"], emailDomains: ["shared.org"] }),
    ];
    expect(() => validateUniqueness(tenants)).toThrow(ConfigValidationError);
    try {
      validateUniqueness(tenants);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const cve = error as ConfigValidationError;
      expect(cve.errors).toHaveLength(1);
      expect(cve.errors[0]?.message).toContain("Duplicate email domain");
    }
  });

  it("aggregates multiple distinct error types with specific messages", () => {
    const tenants = [
      makeTenant({ id: "x", name: "X", hostnames: ["dup.com"], emailDomains: ["dup.org"] }),
      makeTenant({ id: "y", name: "Y", hostnames: ["dup.com"], emailDomains: ["dup.org"] }),
      makeTenant({ id: "y", name: "Z", hostnames: ["unique.com"], emailDomains: ["unique.org"] }),
    ];
    try {
      validateUniqueness(tenants);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const cve = error as ConfigValidationError;
      const messages = cve.errors.map((e) => e.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Duplicate hostname"),
          expect.stringContaining("Duplicate email domain"),
          expect.stringContaining("Duplicate tenant ID"),
        ]),
      );
      expect(cve.errors.length).toBe(3);
    }
  });
});
