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
import { generateRoleProfile } from "../../../src/intake/profile-generator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMockModel(): LanguageModel {
  return {} as LanguageModel;
}

// ---------------------------------------------------------------------------
// generateRoleProfile
// ---------------------------------------------------------------------------
describe("generateRoleProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns typed object with jobExpectations array on valid extraction", async () => {
    const mockResult = {
      object: {
        jobExpectations: [
          "Manage network security infrastructure",
          "Conduct security audits and assessments",
        ],
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    const result = await generateRoleProfile("some job text here...", makeMockModel());

    expect(result.jobExpectations).toEqual([
      "Manage network security infrastructure",
      "Conduct security audits and assessments",
    ]);
  });

  it("passes the model to generateObject", async () => {
    const model = makeMockModel();
    const mockResult = {
      object: { jobExpectations: ["Valid expectation text here"] },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    await generateRoleProfile("some job text", model);

    expect(vi.mocked(generateObject).mock.calls[0][0].model).toBe(model);
  });

  it("sets temperature to 0", async () => {
    const mockResult = {
      object: { jobExpectations: ["Valid expectation text here"] },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    await generateRoleProfile("some job text", makeMockModel());

    expect(vi.mocked(generateObject).mock.calls[0][0].temperature).toBe(0);
  });

  it("includes job_description boundary tags in prompt", async () => {
    const mockResult = {
      object: { jobExpectations: ["Valid expectation text here"] },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    await generateRoleProfile("my specific job text", makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.prompt).toContain("<job_description>");
    expect(callArgs.prompt).toContain("</job_description>");
    expect(callArgs.prompt).toContain("my specific job text");
  });

  it("includes untrusted-data instruction in system prompt", async () => {
    const mockResult = {
      object: { jobExpectations: ["Valid expectation text here"] },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    await generateRoleProfile("some job text", makeMockModel());

    const callArgs = vi.mocked(generateObject).mock.calls[0][0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toMatch(/not follow.*instructions/i);
  });

  it("propagates AI provider errors", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(generateRoleProfile("some job text", makeMockModel())).rejects.toThrow();
  });
});
