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

// vi.mock calls are hoisted — place them before imports for clarity.
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RemediationPlanError,
  generateRemediationCurriculum,
} from "../../../src/training/remediation-planner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModel(): LanguageModel {
  return {} as LanguageModel;
}

function makeWeakAreas(areas: string[] = ["Phishing Awareness", "Password Management"]) {
  return areas;
}

function makeRoleProfile(
  jobExpectations: string[] = ["Manage network security", "Conduct audits"],
) {
  return { jobExpectations };
}

function makeTenantTrainingConfig(maxModules = 4) {
  return { maxModules };
}

function makeMockAiResult(
  modules = [
    {
      title: "Phishing Awareness Training",
      topicArea: "Phishing Awareness",
      jobExpectationIndices: [0],
    },
    {
      title: "Password Management Best Practices",
      topicArea: "Password Management",
      jobExpectationIndices: [1],
    },
  ],
) {
  return { object: { modules } };
}

// ---------------------------------------------------------------------------
// generateRemediationCurriculum
// ---------------------------------------------------------------------------

describe("generateRemediationCurriculum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject with the correct model and schema", async () => {
    const model = makeMockModel();
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(makeMockAiResult() as any);

    await generateRemediationCurriculum(
      makeWeakAreas(),
      makeRoleProfile(),
      makeTenantTrainingConfig(),
      model,
    );

    expect(vi.mocked(generateObject).mock.calls[0][0].model).toBe(model);
    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.schema).toBeDefined();
    expect(typeof callArgs.schema.parse).toBe("function");
  });

  it("system prompt mentions remediation and retraining", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(makeMockAiResult() as any);

    await generateRemediationCurriculum(
      makeWeakAreas(),
      makeRoleProfile(),
      makeTenantTrainingConfig(),
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toMatch(/remediation/i);
    expect(callArgs.system).toMatch(/retraining/i);
  });

  it("user prompt wraps weak areas in <weak_areas> XML tags", async () => {
    const weakAreas = ["Phishing Awareness", "Password Management"];
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(makeMockAiResult() as any);

    await generateRemediationCurriculum(
      weakAreas,
      makeRoleProfile(),
      makeTenantTrainingConfig(),
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<weak_areas>");
    expect(callArgs.prompt).toContain("</weak_areas>");
    expect(callArgs.prompt).toContain("Phishing Awareness");
    expect(callArgs.prompt).toContain("Password Management");
  });

  it("user prompt wraps role profile in <role_profile> XML tags", async () => {
    const jobExpectations = ["Manage network security", "Conduct security audits"];
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(makeMockAiResult() as any);

    await generateRemediationCurriculum(
      makeWeakAreas(),
      { jobExpectations },
      makeTenantTrainingConfig(),
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<role_profile>");
    expect(callArgs.prompt).toContain("</role_profile>");
    expect(callArgs.prompt).toContain("Manage network security");
    expect(callArgs.prompt).toContain("Conduct security audits");
  });

  it("user prompt includes maxModules constraint", async () => {
    const maxModules = 5;
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(makeMockAiResult() as any);

    await generateRemediationCurriculum(
      makeWeakAreas(),
      makeRoleProfile(),
      { maxModules },
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain(String(maxModules));
  });

  it("returns a valid CurriculumOutline with generatedAt added", async () => {
    const aiModules = [
      {
        title: "Phishing Awareness Training",
        topicArea: "Phishing Awareness",
        jobExpectationIndices: [0],
      },
    ];
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: { modules: aiModules } } as any);

    const result = await generateRemediationCurriculum(
      ["Phishing Awareness"],
      makeRoleProfile(),
      makeTenantTrainingConfig(),
      makeMockModel(),
    );

    expect(result.modules).toEqual(aiModules);
    expect(result.generatedAt).toBeDefined();
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it("throws RemediationPlanError with code 'ai_unavailable' when generateObject throws", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(
      generateRemediationCurriculum(
        makeWeakAreas(),
        makeRoleProfile(),
        makeTenantTrainingConfig(),
        makeMockModel(),
      ),
    ).rejects.toThrow(RemediationPlanError);

    await expect(
      generateRemediationCurriculum(
        makeWeakAreas(),
        makeRoleProfile(),
        makeTenantTrainingConfig(),
        makeMockModel(),
      ),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  it("throws RemediationPlanError with code 'planning_failed' when result has empty modules", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: { modules: [] } } as any);

    await expect(
      generateRemediationCurriculum(
        makeWeakAreas(),
        makeRoleProfile(),
        makeTenantTrainingConfig(),
        makeMockModel(),
      ),
    ).rejects.toThrow(RemediationPlanError);

    await expect(
      generateRemediationCurriculum(
        makeWeakAreas(),
        makeRoleProfile(),
        makeTenantTrainingConfig(),
        makeMockModel(),
      ),
    ).rejects.toMatchObject({ code: "planning_failed" });
  });

  it("RemediationPlanError has correct name, message, and code properties", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Network timeout"));

    let thrownError: unknown;
    try {
      await generateRemediationCurriculum(
        makeWeakAreas(),
        makeRoleProfile(),
        makeTenantTrainingConfig(),
        makeMockModel(),
      );
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(RemediationPlanError);
    const error = thrownError as RemediationPlanError;
    expect(error.name).toBe("RemediationPlanError");
    expect(error.message).toContain("Network timeout");
    expect(error.code).toBe("ai_unavailable");
  });

  it("sets temperature to 0", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(makeMockAiResult() as any);

    await generateRemediationCurriculum(
      makeWeakAreas(),
      makeRoleProfile(),
      makeTenantTrainingConfig(),
      makeMockModel(),
    );

    expect(vi.mocked(generateObject).mock.calls[0][0].temperature).toBe(0);
  });
});
