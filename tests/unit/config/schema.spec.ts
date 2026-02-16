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
import {
  BaseConfigSchema,
  TenantConfigSchema,
  TenantSettingsSchema,
} from "../../../src/config/schema.js";

describe("TenantConfigSchema", () => {
  it("validates a complete tenant config", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Acme Corp",
      hostnames: ["acme.example.com"],
      emailDomains: ["acme.com"],
      settings: {
        branding: { primaryColor: "#ff0000" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("requires name field", () => {
    const result = TenantConfigSchema.safeParse({
      hostnames: ["acme.example.com"],
    });
    expect(result.success).toBe(false);
  });

  it("requires non-empty name", () => {
    const result = TenantConfigSchema.safeParse({
      name: "",
      hostnames: ["acme.example.com"],
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one hostname or email domain", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Test",
      hostnames: [],
      emailDomains: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("At least one"))).toBe(true);
    }
  });

  it("accepts tenant with only hostnames", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Test",
      hostnames: ["test.example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts tenant with only email domains", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Test",
      emailDomains: ["test.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Test",
      hostnames: ["test.example.com"],
      unknownField: "value",
    });
    expect(result.success).toBe(false);
  });

  it("defaults hostnames and emailDomains to empty arrays", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Test",
      hostnames: ["test.example.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emailDomains).toEqual([]);
    }
  });
});

describe("TenantSettingsSchema", () => {
  it("validates complete settings", () => {
    const result = TenantSettingsSchema.safeParse({
      branding: {
        logoUrl: "https://example.com/logo.png",
        primaryColor: "#ff0000",
        displayName: "Test Portal",
      },
      features: { featureA: true, featureB: false },
      integrations: { webhookUrl: "https://hook.example.com", ssoProvider: "okta" },
      retention: { days: 365 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty settings", () => {
    const result = TenantSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields in branding (strict)", () => {
    const result = TenantSettingsSchema.safeParse({
      branding: { unknownProp: "value" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict)", () => {
    const result = TenantSettingsSchema.safeParse({
      unknownSection: { foo: "bar" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative retention days", () => {
    const result = TenantSettingsSchema.safeParse({
      retention: { days: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer retention days", () => {
    const result = TenantSettingsSchema.safeParse({
      retention: { days: 30.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe("BaseConfigSchema", () => {
  it("validates a complete base config", () => {
    const result = BaseConfigSchema.safeParse({
      defaults: {
        branding: { primaryColor: "#000" },
        features: { featureA: true },
        integrations: { webhookUrl: "" },
        retention: { days: 90 },
      },
    });
    expect(result.success).toBe(true);
  });

  it("requires defaults field", () => {
    const result = BaseConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict)", () => {
    const result = BaseConfigSchema.safeParse({
      defaults: { features: {} },
      extra: "field",
    });
    expect(result.success).toBe(false);
  });
});
