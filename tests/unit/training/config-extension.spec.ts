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

import { TenantSettingsSchema, TrainingConfigSchema } from "@/config/schema.js";
import { describe, expect, it } from "vitest";

describe("TrainingConfigSchema", () => {
  it("applies all defaults when given an empty object", () => {
    const result = TrainingConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passThreshold).toBe(0.7);
      expect(result.data.maxAttempts).toBe(3);
      expect(result.data.maxModules).toBe(8);
      expect(result.data.enableRemediation).toBe(true);
    }
  });

  it("accepts all custom values within valid ranges", () => {
    const result = TrainingConfigSchema.safeParse({
      passThreshold: 0.85,
      maxAttempts: 5,
      maxModules: 12,
      enableRemediation: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passThreshold).toBe(0.85);
      expect(result.data.maxAttempts).toBe(5);
      expect(result.data.maxModules).toBe(12);
      expect(result.data.enableRemediation).toBe(false);
    }
  });

  it("accepts passThreshold boundary values 0 and 1", () => {
    const resultMin = TrainingConfigSchema.safeParse({ passThreshold: 0 });
    expect(resultMin.success).toBe(true);

    const resultMax = TrainingConfigSchema.safeParse({ passThreshold: 1 });
    expect(resultMax.success).toBe(true);
  });

  it("rejects passThreshold greater than 1", () => {
    const result = TrainingConfigSchema.safeParse({ passThreshold: 1.01 });
    expect(result.success).toBe(false);
  });

  it("rejects passThreshold less than 0", () => {
    const result = TrainingConfigSchema.safeParse({ passThreshold: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects maxAttempts of 0 (min is 1)", () => {
    const result = TrainingConfigSchema.safeParse({ maxAttempts: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects maxAttempts greater than 10", () => {
    const result = TrainingConfigSchema.safeParse({ maxAttempts: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer maxAttempts", () => {
    const result = TrainingConfigSchema.safeParse({ maxAttempts: 2.5 });
    expect(result.success).toBe(false);
  });

  it("rejects maxModules of 0 (min is 1)", () => {
    const result = TrainingConfigSchema.safeParse({ maxModules: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects maxModules greater than 20", () => {
    const result = TrainingConfigSchema.safeParse({ maxModules: 21 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer maxModules", () => {
    const result = TrainingConfigSchema.safeParse({ maxModules: 4.9 });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = TrainingConfigSchema.safeParse({ unknownField: true });
    expect(result.success).toBe(false);
  });

  it("accepts partial config and fills remaining fields with defaults", () => {
    const result = TrainingConfigSchema.safeParse({ passThreshold: 0.9 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passThreshold).toBe(0.9);
      expect(result.data.maxAttempts).toBe(3);
      expect(result.data.maxModules).toBe(8);
      expect(result.data.enableRemediation).toBe(true);
    }
  });

  it("accepts partial config with only maxAttempts specified", () => {
    const result = TrainingConfigSchema.safeParse({ maxAttempts: 7 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passThreshold).toBe(0.7);
      expect(result.data.maxAttempts).toBe(7);
      expect(result.data.maxModules).toBe(8);
      expect(result.data.enableRemediation).toBe(true);
    }
  });

  it("accepts partial config with only enableRemediation specified", () => {
    const result = TrainingConfigSchema.safeParse({ enableRemediation: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enableRemediation).toBe(false);
      expect(result.data.passThreshold).toBe(0.7);
    }
  });
});

describe("TenantSettingsSchema with training", () => {
  it("validates existing configs without a training block (training is optional)", () => {
    const result = TenantSettingsSchema.safeParse({
      branding: { displayName: "Acme" },
      features: { featureA: true },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty settings object (training absent)", () => {
    const result = TenantSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts settings with a fully-specified training block", () => {
    const result = TenantSettingsSchema.safeParse({
      training: {
        passThreshold: 0.8,
        maxAttempts: 4,
        maxModules: 10,
        enableRemediation: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts settings with an empty training block (all defaults apply)", () => {
    const result = TenantSettingsSchema.safeParse({ training: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.training?.passThreshold).toBe(0.7);
      expect(result.data.training?.maxAttempts).toBe(3);
      expect(result.data.training?.maxModules).toBe(8);
      expect(result.data.training?.enableRemediation).toBe(true);
    }
  });

  it("accepts settings with a partial training block", () => {
    const result = TenantSettingsSchema.safeParse({
      training: { passThreshold: 0.75, maxModules: 6 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.training?.passThreshold).toBe(0.75);
      expect(result.data.training?.maxModules).toBe(6);
      expect(result.data.training?.maxAttempts).toBe(3);
      expect(result.data.training?.enableRemediation).toBe(true);
    }
  });

  it("rejects settings with invalid training values (passThreshold > 1)", () => {
    const result = TenantSettingsSchema.safeParse({
      training: { passThreshold: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects settings with invalid training values (negative maxAttempts)", () => {
    const result = TenantSettingsSchema.safeParse({
      training: { maxAttempts: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects settings with invalid training values (maxModules exceeds 20)", () => {
    const result = TenantSettingsSchema.safeParse({
      training: { maxModules: 25 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields in the training block (strict mode)", () => {
    const result = TenantSettingsSchema.safeParse({
      training: { unknownOption: "yes" },
    });
    expect(result.success).toBe(false);
  });

  it("combines training with other settings sections correctly", () => {
    const result = TenantSettingsSchema.safeParse({
      branding: { primaryColor: "#123456" },
      retention: { days: 180 },
      training: { passThreshold: 0.6 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branding?.primaryColor).toBe("#123456");
      expect(result.data.retention?.days).toBe(180);
      expect(result.data.training?.passThreshold).toBe(0.6);
    }
  });
});
