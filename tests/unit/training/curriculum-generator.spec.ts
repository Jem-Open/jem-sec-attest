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
  generateText: vi.fn(),
  Output: { object: vi.fn((opts: unknown) => opts) },
}));

import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CurriculumGenerationError,
  generateCurriculum,
} from "../../../src/training/curriculum-generator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModel(): LanguageModel {
  return {} as LanguageModel;
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
      title: "Network Security Fundamentals",
      topicArea: "Network Security",
      jobExpectationIndices: [0],
    },
    {
      title: "Security Audit Practices",
      topicArea: "Audit",
      jobExpectationIndices: [1],
    },
  ],
) {
  return { output: { modules } };
}

// ---------------------------------------------------------------------------
// generateCurriculum
// ---------------------------------------------------------------------------

describe("generateCurriculum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateText with the correct model", async () => {
    const model = makeMockModel();
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeMockAiResult() as any);

    await generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), model);

    expect(vi.mocked(generateText).mock.calls[0][0].model).toBe(model);
  });

  it("calls generateText with an output option that wraps a schema", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeMockAiResult() as any);

    await generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel());

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.output).toBeDefined();
  });

  it("system prompt mentions security training curriculum designer", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeMockAiResult() as any);

    await generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel());

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toMatch(/security training curriculum designer/i);
  });

  it("user prompt contains jobExpectations wrapped in <role_profile> XML tags", async () => {
    const jobExpectations = ["Manage network security", "Conduct security audits"];
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeMockAiResult() as any);

    await generateCurriculum({ jobExpectations }, makeTenantTrainingConfig(), makeMockModel());

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<role_profile>");
    expect(callArgs.prompt).toContain("</role_profile>");
    expect(callArgs.prompt).toContain("Manage network security");
    expect(callArgs.prompt).toContain("Conduct security audits");
  });

  it("user prompt includes maxModules constraint", async () => {
    const maxModules = 6;
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeMockAiResult() as any);

    await generateCurriculum(makeRoleProfile(), { maxModules }, makeMockModel());

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.prompt).toContain(String(maxModules));
  });

  it("returns a valid CurriculumOutline with generatedAt added", async () => {
    const aiModules = [
      {
        title: "Network Security Fundamentals",
        topicArea: "Network Security",
        jobExpectationIndices: [0],
      },
    ];
    vi.mocked(generateText).mockResolvedValue({
      output: { modules: aiModules },
      // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    } as any);

    const result = await generateCurriculum(
      makeRoleProfile(),
      makeTenantTrainingConfig(),
      makeMockModel(),
    );

    expect(result.modules).toEqual(aiModules);
    expect(result.generatedAt).toBeDefined();
    // generatedAt should be a valid ISO datetime string
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it("throws CurriculumGenerationError with code 'ai_unavailable' when generateText throws", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(
      generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel()),
    ).rejects.toThrow(CurriculumGenerationError);

    await expect(
      generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel()),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  it("throws CurriculumGenerationError with code 'generation_failed' when result has empty modules", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue({ output: { modules: [] } } as any);

    await expect(
      generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel()),
    ).rejects.toThrow(CurriculumGenerationError);

    await expect(
      generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("throws CurriculumGenerationError with code 'generation_failed' when jobExpectationIndices are out of bounds", async () => {
    const jobExpectations = ["Manage network security"]; // only index 0 is valid
    const aiModules = [
      {
        title: "Module A",
        topicArea: "Topic",
        jobExpectationIndices: [0, 5], // index 5 is out of bounds
      },
    ];
    vi.mocked(generateText).mockResolvedValue({
      output: { modules: aiModules },
      // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    } as any);

    await expect(
      generateCurriculum({ jobExpectations }, makeTenantTrainingConfig(), makeMockModel()),
    ).rejects.toThrow(CurriculumGenerationError);

    await expect(
      generateCurriculum({ jobExpectations }, makeTenantTrainingConfig(), makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("CurriculumGenerationError has correct name, message, and code properties", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("Network timeout"));

    let thrownError: unknown;
    try {
      await generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel());
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(CurriculumGenerationError);
    const error = thrownError as CurriculumGenerationError;
    expect(error.name).toBe("CurriculumGenerationError");
    expect(error.message).toContain("Network timeout");
    expect(error.code).toBe("ai_unavailable");
  });

  it("sets temperature to 0", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeMockAiResult() as any);

    await generateCurriculum(makeRoleProfile(), makeTenantTrainingConfig(), makeMockModel());

    expect(vi.mocked(generateText).mock.calls[0][0].temperature).toBe(0);
  });
});
