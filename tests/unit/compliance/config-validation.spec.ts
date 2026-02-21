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
import { ComplianceConfigSchema } from "../../../src/compliance/schemas.js";
import { TenantConfigSchema } from "../../../src/config/schema.js";

describe("ComplianceConfigSchema", () => {
  const validConfig = {
    provider: "sprinto",
    apiKeyRef: "${ACME_SPRINTO_API_KEY}",
    workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    region: "us",
  };

  it("accepts a valid Sprinto config", () => {
    const result = ComplianceConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("applies retry defaults when retry block is omitted", () => {
    const result = ComplianceConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retry.maxAttempts).toBe(5);
      expect(result.data.retry.initialDelayMs).toBe(5000);
      expect(result.data.retry.maxDelayMs).toBe(300000);
    }
  });

  it("accepts custom retry settings", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      retry: { maxAttempts: 3, initialDelayMs: 2000, maxDelayMs: 60000 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retry.maxAttempts).toBe(3);
    }
  });

  it("rejects missing provider", () => {
    const { provider: _, ...noProvider } = validConfig;
    const result = ComplianceConfigSchema.safeParse(noProvider);
    expect(result.success).toBe(false);
  });

  it("rejects unknown provider", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      provider: "drata",
    });
    expect(result.success).toBe(false);
  });

  it("accepts apiKeyRef as plain string (post env-substitute resolution)", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      apiKeyRef: "resolved-api-key-value",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty apiKeyRef", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      apiKeyRef: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid workflowCheckId (not UUID)", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      workflowCheckId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid region", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      region: "australia",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid regions", () => {
    for (const region of ["us", "eu", "india"]) {
      const result = ComplianceConfigSchema.safeParse({ ...validConfig, region });
      expect(result.success).toBe(true);
    }
  });

  it("rejects retry maxAttempts outside range", () => {
    const tooLow = ComplianceConfigSchema.safeParse({
      ...validConfig,
      retry: { maxAttempts: 0 },
    });
    expect(tooLow.success).toBe(false);

    const tooHigh = ComplianceConfigSchema.safeParse({
      ...validConfig,
      retry: { maxAttempts: 11 },
    });
    expect(tooHigh.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = ComplianceConfigSchema.safeParse({
      ...validConfig,
      unknownField: "should fail",
    });
    expect(result.success).toBe(false);
  });
});

describe("TenantConfigSchema with compliance integration", () => {
  it("accepts tenant config with valid compliance block", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Acme Corp",
      hostnames: ["acme.example.com"],
      settings: {
        integrations: {
          compliance: {
            provider: "sprinto",
            apiKeyRef: "${ACME_SPRINTO_API_KEY}",
            workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            region: "us",
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tenant config without compliance block", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Acme Corp",
      hostnames: ["acme.example.com"],
      settings: {
        integrations: {
          webhookUrl: "https://hooks.example.com",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts tenant config with no integrations at all", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Acme Corp",
      hostnames: ["acme.example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects tenant config with invalid compliance block", () => {
    const result = TenantConfigSchema.safeParse({
      name: "Acme Corp",
      hostnames: ["acme.example.com"],
      settings: {
        integrations: {
          compliance: {
            provider: "sprinto",
            // missing apiKeyRef, workflowCheckId, region
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
