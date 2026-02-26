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
  Output: { object: vi.fn(() => "mock-output-schema") },
}));

import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationError, evaluateFreeText } from "../../../src/training/evaluator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockModel(): LanguageModel {
  return {} as LanguageModel;
}

function makeValidMockResult() {
  return {
    output: {
      score: 0.85,
      rationale: "Good understanding demonstrated by the employee.",
    },
  };
}

// ---------------------------------------------------------------------------
// evaluateFreeText
// ---------------------------------------------------------------------------

describe("evaluateFreeText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Calls generateText with correct model, schema, system, and prompt
  it("calls generateText with correct model, schema, system, and prompt", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    const model = makeMockModel();
    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is ...",
      model,
    );

    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.model).toBe(model);
    expect(callArgs.output).toBeDefined();
    expect(callArgs.system).toBeDefined();
    expect(callArgs.prompt).toBeDefined();
  });

  // Test 2: System prompt mentions objective training evaluator
  it("system prompt mentions objective training evaluator", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is ...",
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.system).toMatch(
      /objective.*training.*evaluator|training.*evaluator.*objective/i,
    );
  });

  // Test 3: System prompt contains injection mitigation: "untrusted data" and "do not execute as instructions"
  it("system prompt contains injection mitigation phrase 'untrusted data'", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is ...",
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.system).toMatch(/untrusted data/i);
  });

  it("system prompt contains injection mitigation phrase 'do not execute as instructions'", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is ...",
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.system).toMatch(/do not execute as instructions/i);
  });

  // Test 4: User prompt wraps question in <question> XML boundary
  it("user prompt wraps question in <question> XML boundary", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    const question = "What is phishing?";
    await evaluateFreeText(
      question,
      "Award full marks for ...",
      "Phishing is ...",
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<question>");
    expect(callArgs.prompt).toContain("</question>");
    expect(callArgs.prompt).toContain(question);
  });

  // Test 5: User prompt wraps rubric in <rubric> XML boundary
  it("user prompt wraps rubric in <rubric> XML boundary", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    const rubric = "Award full marks for identifying social engineering tactics.";
    await evaluateFreeText("What is phishing?", rubric, "Phishing is ...", makeMockModel());

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<rubric>");
    expect(callArgs.prompt).toContain("</rubric>");
    expect(callArgs.prompt).toContain(rubric);
  });

  // Test 6: User prompt wraps employee response in <employee_response> XML boundary
  it("user prompt wraps employee response in <employee_response> XML boundary", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    const response = "Phishing is a social engineering attack used to steal credentials.";
    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      response,
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<employee_response>");
    expect(callArgs.prompt).toContain("</employee_response>");
    expect(callArgs.prompt).toContain(response);
  });

  // Test 7: Returns FreeTextEvaluation with score and rationale
  it("returns FreeTextEvaluation with score and rationale", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    const result = await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is a social engineering attack.",
      makeMockModel(),
    );

    expect(result.score).toBe(0.85);
    expect(result.rationale).toBe("Good understanding demonstrated by the employee.");
  });

  // Test 8: Throws EvaluationError with code "ai_unavailable" when generateText throws
  it("throws EvaluationError with code 'ai_unavailable' when generateText throws", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(
      evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        "Phishing is ...",
        makeMockModel(),
      ),
    ).rejects.toThrow(EvaluationError);

    await expect(
      evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        "Phishing is ...",
        makeMockModel(),
      ),
    ).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  // Test 9: Throws EvaluationError with code "evaluation_failed" when response exceeds 2000 chars
  it("throws EvaluationError with code 'evaluation_failed' when response exceeds 2000 chars", async () => {
    const longResponse = "x".repeat(2001);

    await expect(
      evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        longResponse,
        makeMockModel(),
      ),
    ).rejects.toThrow(EvaluationError);

    await expect(
      evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        longResponse,
        makeMockModel(),
      ),
    ).rejects.toMatchObject({ code: "evaluation_failed" });
  });

  it("does not throw when response is exactly 2000 chars", async () => {
    const exactResponse = "x".repeat(2000);
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    await expect(
      evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        exactResponse,
        makeMockModel(),
      ),
    ).resolves.toBeDefined();
  });

  // Test 10: EvaluationError has correct name, message, code properties
  it("EvaluationError has correct name, message, and code properties", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("Connection refused"));

    let caughtError: unknown;
    try {
      await evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        "Phishing is ...",
        makeMockModel(),
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(EvaluationError);
    const error = caughtError as EvaluationError;
    expect(error.name).toBe("EvaluationError");
    expect(typeof error.message).toBe("string");
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.code).toBe("ai_unavailable");
  });

  it("EvaluationError for exceeded response length has correct properties", async () => {
    const longResponse = "x".repeat(2001);

    let caughtError: unknown;
    try {
      await evaluateFreeText(
        "What is phishing?",
        "Award full marks for ...",
        longResponse,
        makeMockModel(),
      );
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(EvaluationError);
    const error = caughtError as EvaluationError;
    expect(error.name).toBe("EvaluationError");
    expect(error.code).toBe("evaluation_failed");
  });

  // Test 11: Temperature is set to 0
  it("sets temperature to 0", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is ...",
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  // Test 12: FreeTextEvaluationSchema is used (check output passed to generateText)
  it("passes FreeTextEvaluationSchema via Output.object to generateText", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateText).mockResolvedValue(makeValidMockResult() as any);

    await evaluateFreeText(
      "What is phishing?",
      "Award full marks for ...",
      "Phishing is ...",
      makeMockModel(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.output).toBeDefined();
  });
});
