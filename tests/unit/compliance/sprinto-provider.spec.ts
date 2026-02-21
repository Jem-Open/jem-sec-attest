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
 * Unit tests for SprintoProvider and getSprintoEndpoint.
 * global fetch is mocked via vi.fn() — no real network calls.
 */

import { describe, expect, it, vi } from "vitest";

import { SprintoProvider, getSprintoEndpoint } from "../../../src/compliance/providers/sprinto.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEvidence = {
  id: "ev-001",
  tenantId: "test-tenant",
  sessionId: "sess-001",
  employeeId: "emp-001",
  schemaVersion: 1,
  // biome-ignore lint/suspicious/noExplicitAny: test fixture
  evidence: {} as any,
  contentHash: "abc123",
  generatedAt: "2026-02-21T10:00:00.000Z",
};

const mockConfig = {
  provider: "sprinto",
  apiKey: "test-api-key",
  workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  region: "us",
  retry: { maxAttempts: 5, initialDelayMs: 5000, maxDelayMs: 300000 },
};

const mockPdfBuffer = Buffer.from("fake-pdf-content");

// ---------------------------------------------------------------------------
// getSprintoEndpoint
// ---------------------------------------------------------------------------

describe("getSprintoEndpoint", () => {
  it("returns the correct US endpoint", () => {
    const url = getSprintoEndpoint("us");
    expect(url).toBe("https://app.sprinto.com/dev-api/graphql");
  });

  it("returns the correct EU endpoint", () => {
    const url = getSprintoEndpoint("eu");
    expect(url).toBe("https://eu.sprinto.com/dev-api/graphql");
  });

  it("returns the correct India endpoint", () => {
    const url = getSprintoEndpoint("india");
    expect(url).toBe("https://in.sprinto.com/dev-api/graphql");
  });

  it("throws for an unknown region", () => {
    expect(() => getSprintoEndpoint("australia")).toThrow(
      "Unknown Sprinto region: australia. Expected one of: us, eu, india",
    );
  });

  it("throws for an empty string region", () => {
    expect(() => getSprintoEndpoint("")).toThrow("Unknown Sprinto region:");
  });
});

// ---------------------------------------------------------------------------
// SprintoProvider.uploadEvidence
// ---------------------------------------------------------------------------

describe("SprintoProvider.uploadEvidence", () => {
  it("constructs FormData with operations, map, and PDF file parts", async () => {
    const capturedFormData: FormData[] = [];

    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedFormData.push(init.body as FormData);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              uploadWorkflowCheckEvidence: {
                message: "Evidence uploaded",
                workflowCheck: { evidenceStatus: "EVIDENCE_APPROVED" },
              },
            },
          }),
          { status: 200 },
        ),
      );
    });

    vi.stubGlobal("fetch", mockFetch);

    const provider = new SprintoProvider();
    await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(mockFetch).toHaveBeenCalledOnce();

    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://app.sprinto.com/dev-api/graphql");
    expect(calledInit.method).toBe("POST");
    expect((calledInit.headers as Record<string, string>)["api-key"]).toBe("test-api-key");

    const formData = calledInit.body as FormData;
    expect(formData).toBeInstanceOf(FormData);

    // operations part must contain valid JSON with mutation and variables
    const operationsRaw = formData.get("operations") as string;
    expect(operationsRaw).toBeTruthy();
    const operations = JSON.parse(operationsRaw) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(operations.query).toContain("uploadWorkflowCheckEvidence");
    expect(operations.variables.workflowCheckPk).toBe(mockConfig.workflowCheckId);
    expect(operations.variables.evidenceRecordDate).toBe("2026-02-21");
    expect(operations.variables.evidenceFile).toBeNull();

    // map part must reference variables.evidenceFile
    const mapRaw = formData.get("map") as string;
    const map = JSON.parse(mapRaw) as Record<string, string[]>;
    expect(map["0"]).toEqual(["variables.evidenceFile"]);

    // file part must be a Blob under key "0"
    const fileBlob = formData.get("0") as File;
    expect(fileBlob).toBeInstanceOf(Blob);
    expect(fileBlob.type).toBe("application/pdf");
    expect(fileBlob.name).toBe(`evidence-${mockEvidence.sessionId}.pdf`);

    vi.unstubAllGlobals();
  });

  it("returns ok:true with providerReferenceId and message on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              uploadWorkflowCheckEvidence: {
                message: "Evidence uploaded successfully",
                workflowCheck: { evidenceStatus: "EVIDENCE_APPROVED" },
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerReferenceId).toBe("EVIDENCE_APPROVED");
      expect(result.message).toBe("Evidence uploaded successfully");
    }

    vi.unstubAllGlobals();
  });

  it("returns AUTH_FAILED (non-retryable) on HTTP 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
        ),
    );

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_FAILED");
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toContain("401");
    }

    vi.unstubAllGlobals();
  });

  it("returns RATE_LIMITED (retryable) on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Too Many Requests", { status: 429, statusText: "Too Many Requests" }),
        ),
    );

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("RATE_LIMITED");
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toContain("429");
    }

    vi.unstubAllGlobals();
  });

  it("returns SERVER_ERROR (retryable) on HTTP 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      ),
    );

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("SERVER_ERROR");
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toContain("500");
    }

    vi.unstubAllGlobals();
  });

  it("returns SERVER_ERROR (retryable) on HTTP 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" }),
        ),
    );

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("SERVER_ERROR");
      expect(result.retryable).toBe(true);
    }

    vi.unstubAllGlobals();
  });

  it("returns INVALID_CHECK_ID (non-retryable) on GraphQL error 'Incorrect check ID'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: [{ message: "Incorrect check ID" }] }), {
          status: 200,
        }),
      ),
    );

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("INVALID_CHECK_ID");
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toBe("Incorrect check ID");
    }

    vi.unstubAllGlobals();
  });

  it("returns NETWORK_ERROR (retryable) when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to connect: ECONNREFUSED")));

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("NETWORK_ERROR");
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toContain("ECONNREFUSED");
    }

    vi.unstubAllGlobals();
  });

  it("returns NETWORK_ERROR (retryable) when fetch throws a non-Error value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("socket hang up"));

    const provider = new SprintoProvider();
    const result = await provider.uploadEvidence(mockPdfBuffer, mockEvidence, mockConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("NETWORK_ERROR");
      expect(result.retryable).toBe(true);
    }

    vi.unstubAllGlobals();
  });

  it("uses the EU endpoint when region is eu", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            uploadWorkflowCheckEvidence: {
              message: "ok",
              workflowCheck: { evidenceStatus: "APPROVED" },
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const provider = new SprintoProvider();
    await provider.uploadEvidence(mockPdfBuffer, mockEvidence, { ...mockConfig, region: "eu" });

    const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://eu.sprinto.com/dev-api/graphql");

    vi.unstubAllGlobals();
  });

  it("derives evidenceRecordDate as YYYY-MM-DD from generatedAt timestamp", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            uploadWorkflowCheckEvidence: {
              message: "ok",
              workflowCheck: { evidenceStatus: "APPROVED" },
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", mockFetch);

    const evidenceWithTimestamp = {
      ...mockEvidence,
      generatedAt: "2026-03-15T23:59:59.999Z",
    };

    const provider = new SprintoProvider();
    await provider.uploadEvidence(mockPdfBuffer, evidenceWithTimestamp, mockConfig);

    const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const formData = calledInit.body as FormData;
    const operations = JSON.parse(formData.get("operations") as string) as {
      variables: { evidenceRecordDate: string };
    };
    expect(operations.variables.evidenceRecordDate).toBe("2026-03-15");

    vi.unstubAllGlobals();
  });
});
