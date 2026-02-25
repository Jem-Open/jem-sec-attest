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
  ModuleGenerationError,
  generateModuleContent,
} from "../../../src/training/module-generator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModel(): LanguageModel {
  return {} as LanguageModel;
}

function makeMockObject() {
  return {
    instruction: "Learn about phishing awareness and how to identify suspicious emails.",
    scenarios: [
      {
        id: "sc-1",
        narrative: "You receive an email asking you to reset your password. What do you do?",
        responseType: "multiple-choice" as const,
        options: [
          { key: "A", text: "Click the link immediately", correct: false },
          { key: "B", text: "Verify the sender and report to IT", correct: true },
          { key: "C", text: "Ignore it", correct: false },
        ],
      },
      {
        id: "sc-2",
        narrative: "Describe the steps you would take to verify a suspicious email.",
        responseType: "free-text" as const,
        rubric:
          "Award marks for mentioning sender verification, link inspection, and IT reporting.",
      },
    ],
    quizQuestions: [
      {
        id: "q-1",
        text: "Which of these is a common phishing indicator?",
        responseType: "multiple-choice" as const,
        options: [
          { key: "A", text: "Sender is from your company domain", correct: false },
          { key: "B", text: "Urgent request to click a link", correct: true },
          { key: "C", text: "Email contains your name", correct: false },
        ],
      },
      {
        id: "q-2",
        text: "Explain what you should do if you accidentally clicked a phishing link.",
        responseType: "free-text" as const,
        rubric:
          "Award marks for: disconnect from network, contact IT immediately, change passwords.",
      },
    ],
  };
}

const MODULE_OUTLINE = {
  title: "Phishing Awareness",
  topicArea: "Email Security",
  jobExpectationIndices: [0, 2],
};

const ROLE_PROFILE = {
  jobExpectations: [
    "Handle sensitive customer data securely",
    "Manage vendor relationships",
    "Respond to security incidents appropriately",
    "Maintain compliance with data protection policies",
  ],
};

// ---------------------------------------------------------------------------
// generateModuleContent tests
// ---------------------------------------------------------------------------

describe("generateModuleContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateObject with the provided model", async () => {
    const model = makeMockModel();
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, model);

    expect(vi.mocked(generateObject).mock.calls[0][0].model).toBe(model);
  });

  it("calls generateObject with a schema object", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.schema).toBeDefined();
  });

  it("system prompt identifies role as security training content creator", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toMatch(/security training/i);
  });

  it("system prompt contains injection mitigation language about untrusted data", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toMatch(/untrusted/i);
  });

  it("user prompt wraps module outline in <module_outline> XML boundary", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<module_outline>");
    expect(callArgs.prompt).toContain("</module_outline>");
  });

  it("user prompt wraps relevant job expectations in <role_profile> XML boundary", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<role_profile>");
    expect(callArgs.prompt).toContain("</role_profile>");
  });

  it("user prompt filters jobExpectations by jobExpectationIndices", async () => {
    // jobExpectationIndices [0, 2] should include indices 0 and 2, not 1 and 3
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    // Index 0 and 2 from ROLE_PROFILE.jobExpectations
    expect(callArgs.prompt).toContain("Handle sensitive customer data securely");
    expect(callArgs.prompt).toContain("Respond to security incidents appropriately");
    // Index 1 and 3 should NOT be included
    expect(callArgs.prompt).not.toContain("Manage vendor relationships");
    expect(callArgs.prompt).not.toContain("Maintain compliance with data protection policies");
  });

  it("returns valid ModuleContent with generatedAt added", async () => {
    const mockObj = makeMockObject();
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: mockObj } as any);

    const result = await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    expect(result.instruction).toBe(mockObj.instruction);
    expect(result.scenarios).toEqual(mockObj.scenarios);
    expect(result.quiz.questions).toEqual(mockObj.quizQuestions);
    expect(result.generatedAt).toBeDefined();
    // generatedAt should be a valid ISO 8601 datetime string
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  it("throws ModuleGenerationError with code 'ai_unavailable' when generateObject throws", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toThrow(ModuleGenerationError);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  it("throws ModuleGenerationError with code 'generation_failed' when scenarios are empty", async () => {
    const mockObj = { ...makeMockObject(), scenarios: [] };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: mockObj } as any);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toThrow(ModuleGenerationError);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("throws ModuleGenerationError with code 'generation_failed' when quiz questions are empty", async () => {
    const mockObj = { ...makeMockObject(), quizQuestions: [] };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: mockObj } as any);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toThrow(ModuleGenerationError);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("ModuleGenerationError has correct name, message, and code properties", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("Network timeout"));

    let caught: unknown;
    try {
      await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ModuleGenerationError);
    const err = caught as ModuleGenerationError;
    expect(err.name).toBe("ModuleGenerationError");
    expect(err.message).toMatch(/Network timeout/);
    expect(err.code).toBe("ai_unavailable");
  });

  it("sets temperature to 0", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  it("throws ModuleGenerationError with code 'generation_failed' when a multiple-choice scenario has no correct option", async () => {
    const mockObj = makeMockObject();
    // Remove the correct: true from all options of the first MC scenario
    mockObj.scenarios[0] = {
      ...mockObj.scenarios[0],
      responseType: "multiple-choice" as const,
      options: [
        { key: "A", text: "Option A", correct: false },
        { key: "B", text: "Option B", correct: false },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: mockObj } as any);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("throws ModuleGenerationError with code 'generation_failed' when a multiple-choice scenario has multiple correct options", async () => {
    const mockObj = makeMockObject();
    mockObj.scenarios[0] = {
      ...mockObj.scenarios[0],
      responseType: "multiple-choice" as const,
      options: [
        { key: "A", text: "Option A", correct: true },
        { key: "B", text: "Option B", correct: true },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: mockObj } as any);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("throws ModuleGenerationError with code 'generation_failed' when a multiple-choice quiz question has no correct option", async () => {
    const mockObj = makeMockObject();
    mockObj.quizQuestions[0] = {
      ...mockObj.quizQuestions[0],
      responseType: "multiple-choice" as const,
      options: [
        { key: "A", text: "Option A", correct: false },
        { key: "B", text: "Option B", correct: false },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: mockObj } as any);

    await expect(
      generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel()),
    ).rejects.toMatchObject({ code: "generation_failed" });
  });

  it("user prompt includes module title in module_outline section", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("Phishing Awareness");
  });

  it("user prompt includes topicArea in module_outline section", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue({ object: makeMockObject() } as any);

    await generateModuleContent(MODULE_OUTLINE, ROLE_PROFILE, makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("Email Security");
  });
});
