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

/**
 * Contract tests for POST /api/intake/{tenant}/generate.
 * Verifies that the route handler responses conform to the OpenAPI contract by
 * invoking the Next.js App Router handler function directly.
 *
 * These tests are in a "red" TDD state — they will fail until T015 implements
 * the route handler at app/api/intake/[tenant]/generate/route.ts.
 */

// vi.mock calls are hoisted — place them before imports for clarity.
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/storage/sqlite-adapter", () => ({
  SQLiteAdapter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn().mockImplementation((_t: string, fn: () => Promise<unknown>) => fn()),
    getMetadata: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("@/intake/ai-model-resolver", () => ({
  resolveModel: vi.fn().mockReturnValue({}),
}));

vi.mock("@/config/index", () => ({
  getSnapshot: vi.fn().mockReturnValue({
    tenants: new Map([["acme-corp", { id: "acme-corp", name: "Acme Corp", settings: {} }]]),
    configHash: "test-hash-123",
  }),
}));

import { generateObject } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../app/api/intake/[tenant]/generate/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  body: Record<string, unknown>,
  tenantId = "acme-corp",
  employeeId = "emp-001",
): Request {
  return new Request("http://localhost:3000/api/intake/acme-corp/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenantId,
      "x-employee-id": employeeId,
    },
    body: JSON.stringify(body),
  });
}

function makeParams(tenant = "acme-corp") {
  return { params: Promise.resolve({ tenant }) };
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe("POST /api/intake/{tenant}/generate", () => {
  // Placeholder — tests will fail until T015 implements the route handler
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with jobExpectations array on valid input", async () => {
    const mockResult = {
      object: {
        jobExpectations: [
          "Manage network security infrastructure and firewalls",
          "Conduct regular security audits and vulnerability assessments",
        ],
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    const validJobText = `${"x".repeat(50)} This is a job description for a security engineer role.`;
    const request = makeRequest({ jobText: validJobText });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("jobExpectations");
    expect(Array.isArray(body.jobExpectations)).toBe(true);
  });

  it("returns 400 on input shorter than 50 characters", async () => {
    const request = makeRequest({ jobText: "too short" });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 on input longer than 10000 characters", async () => {
    const request = makeRequest({ jobText: "x".repeat(10001) });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
  });

  it("returns 400 when jobText is missing", async () => {
    const request = makeRequest({});
    const response = await POST(request, makeParams());

    expect(response.status).toBe(400);
  });

  it("returns 422 when AI returns empty expectations", async () => {
    const mockResult = { object: { jobExpectations: [] } };
    // biome-ignore lint/suspicious/noExplicitAny: mock return type cannot be fully typed
    vi.mocked(generateObject).mockResolvedValue(mockResult as any); // mock return type

    const validJobText = "x".repeat(60);
    const request = makeRequest({ jobText: validJobText });
    const response = await POST(request, makeParams());

    expect(response.status).toBe(422);
  });
});
