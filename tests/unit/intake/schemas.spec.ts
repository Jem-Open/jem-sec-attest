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
  IntakeSubmissionSchema,
  ProfileConfirmationSchema,
  RoleProfileExtractionSchema,
} from "../../../src/intake/schemas";

describe("IntakeSubmissionSchema", () => {
  it("rejects jobText shorter than 50 characters", () => {
    const result = IntakeSubmissionSchema.safeParse({ jobText: "x".repeat(49) });
    expect(result.success).toBe(false);
  });

  it("rejects jobText longer than 10000 characters", () => {
    const result = IntakeSubmissionSchema.safeParse({ jobText: "x".repeat(10_001) });
    expect(result.success).toBe(false);
  });

  it("accepts jobText at exactly 50 characters", () => {
    const result = IntakeSubmissionSchema.safeParse({ jobText: "x".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("accepts jobText at exactly 10000 characters", () => {
    const result = IntakeSubmissionSchema.safeParse({ jobText: "x".repeat(10_000) });
    expect(result.success).toBe(true);
  });

  it("rejects missing jobText", () => {
    const result = IntakeSubmissionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("RoleProfileExtractionSchema", () => {
  it("rejects empty jobExpectations array", () => {
    const result = RoleProfileExtractionSchema.safeParse({ jobExpectations: [] });
    expect(result.success).toBe(false);
  });

  it("accepts array with 1 item", () => {
    const result = RoleProfileExtractionSchema.safeParse({
      jobExpectations: ["x".repeat(10)],
    });
    expect(result.success).toBe(true);
  });

  it("accepts array with 15 items", () => {
    const items = Array.from({ length: 15 }, () => "x".repeat(10));
    const result = RoleProfileExtractionSchema.safeParse({ jobExpectations: items });
    expect(result.success).toBe(true);
  });

  it("rejects array with more than 15 items", () => {
    const items = Array.from({ length: 16 }, () => "x".repeat(10));
    const result = RoleProfileExtractionSchema.safeParse({ jobExpectations: items });
    expect(result.success).toBe(false);
  });

  it("rejects strings shorter than 10 characters", () => {
    const result = RoleProfileExtractionSchema.safeParse({
      jobExpectations: ["x".repeat(9)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects strings longer than 500 characters", () => {
    const result = RoleProfileExtractionSchema.safeParse({
      jobExpectations: ["x".repeat(501)],
    });
    expect(result.success).toBe(false);
  });

  it("accepts strings at boundary lengths (10 and 500 chars)", () => {
    const result = RoleProfileExtractionSchema.safeParse({
      jobExpectations: ["x".repeat(10), "x".repeat(500)],
    });
    expect(result.success).toBe(true);
  });
});

describe("ProfileConfirmationSchema", () => {
  it("mirrors extraction constraints - rejects empty array", () => {
    const result = ProfileConfirmationSchema.safeParse({ jobExpectations: [] });
    expect(result.success).toBe(false);
  });

  it("accepts valid job expectations (1-15 items)", () => {
    const result = ProfileConfirmationSchema.safeParse({
      jobExpectations: Array.from({ length: 15 }, () => "x".repeat(10)),
    });
    expect(result.success).toBe(true);
  });

  it("rejects strings shorter than 10 chars", () => {
    const result = ProfileConfirmationSchema.safeParse({
      jobExpectations: ["x".repeat(9)],
    });
    expect(result.success).toBe(false);
  });
});
