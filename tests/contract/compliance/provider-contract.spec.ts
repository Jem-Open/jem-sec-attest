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
 * Contract tests verifying that SprintoProvider correctly implements
 * the ComplianceProvider interface.
 */

import { describe, expect, it, vi } from "vitest";
import { SprintoProvider } from "../../../src/compliance/providers/sprinto.js";
import type { ComplianceProvider } from "../../../src/compliance/types.js";

// ---------------------------------------------------------------------------
// SprintoProvider interface contract
// ---------------------------------------------------------------------------

describe("SprintoProvider implements ComplianceProvider", () => {
  it("has a name property equal to 'sprinto'", () => {
    const provider = new SprintoProvider();
    expect(provider.name).toBe("sprinto");
  });

  it("has an uploadEvidence method that is a function", () => {
    const provider = new SprintoProvider();
    expect(typeof provider.uploadEvidence).toBe("function");
  });

  it("name property is readonly and stable across instances", () => {
    const a = new SprintoProvider();
    const b = new SprintoProvider();
    expect(a.name).toBe(b.name);
    expect(a.name).toBe("sprinto");
  });

  it("instance satisfies the ComplianceProvider interface", () => {
    // Type-level assertion: if this compiles, the contract is satisfied.
    const provider: ComplianceProvider = new SprintoProvider();
    expect(provider).toBeDefined();
    expect(provider.name).toBe("sprinto");
    expect(typeof provider.uploadEvidence).toBe("function");
  });

  it("uploadEvidence returns a Promise", () => {
    const provider = new SprintoProvider();

    // Provide a minimal mock fetch so the call does not make a real network request.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          uploadWorkflowCheckEvidence: {
            message: "Evidence uploaded",
            workflowCheck: { evidenceStatus: "accepted" },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pdfBuffer = Buffer.from("%PDF-1.4 stub");
    const evidence = {
      id: "ev-00000000-0000-0000-0000-000000000001",
      tenantId: "test-tenant",
      sessionId: "00000000-0000-0000-0000-000000000002",
      employeeId: "emp-001",
      schemaVersion: 1 as const,
      contentHash: "sha256-abc123",
      generatedAt: "2026-02-21T10:00:00.000Z",
      evidence: {
        session: {
          sessionId: "00000000-0000-0000-0000-000000000002",
          employeeId: "emp-001",
          tenantId: "test-tenant",
          attemptNumber: 1,
          totalAttempts: 1,
          status: "passed" as const,
          createdAt: "2026-02-21T09:00:00.000Z",
          completedAt: "2026-02-21T10:00:00.000Z",
        },
        policyAttestation: {
          configHash: "sha256-cfg-001",
          roleProfileId: "rp-001",
          roleProfileVersion: 1,
          appVersion: "1.0.0",
          passThreshold: 0.7,
          maxAttempts: 3,
        },
        modules: [],
        outcome: {
          aggregateScore: 0.9,
          passed: true,
          passThreshold: 0.7,
          weakAreas: null,
          moduleScores: [],
        },
      },
    };
    const config = {
      provider: "sprinto",
      apiKey: "test-api-key",
      workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      region: "us",
      retry: { maxAttempts: 2, initialDelayMs: 1000, maxDelayMs: 5000 },
    };

    const result = provider.uploadEvidence(pdfBuffer, evidence, config);
    expect(result).toBeInstanceOf(Promise);

    vi.unstubAllGlobals();
  });

  it("uploadEvidence resolves to an UploadResult with ok:true on success", async () => {
    const provider = new SprintoProvider();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: {
          uploadWorkflowCheckEvidence: {
            message: "Evidence uploaded successfully",
            workflowCheck: { evidenceStatus: "accepted" },
          },
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const pdfBuffer = Buffer.from("%PDF-1.4 stub");
    const evidence = {
      id: "ev-00000000-0000-0000-0000-000000000001",
      tenantId: "test-tenant",
      sessionId: "00000000-0000-0000-0000-000000000002",
      employeeId: "emp-001",
      schemaVersion: 1 as const,
      contentHash: "sha256-abc123",
      generatedAt: "2026-02-21T10:00:00.000Z",
      evidence: {
        session: {
          sessionId: "00000000-0000-0000-0000-000000000002",
          employeeId: "emp-001",
          tenantId: "test-tenant",
          attemptNumber: 1,
          totalAttempts: 1,
          status: "passed" as const,
          createdAt: "2026-02-21T09:00:00.000Z",
          completedAt: "2026-02-21T10:00:00.000Z",
        },
        policyAttestation: {
          configHash: "sha256-cfg-001",
          roleProfileId: "rp-001",
          roleProfileVersion: 1,
          appVersion: "1.0.0",
          passThreshold: 0.7,
          maxAttempts: 3,
        },
        modules: [],
        outcome: {
          aggregateScore: 0.9,
          passed: true,
          passThreshold: 0.7,
          weakAreas: null,
          moduleScores: [],
        },
      },
    };
    const config = {
      provider: "sprinto",
      apiKey: "test-api-key",
      workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      region: "us",
      retry: { maxAttempts: 2, initialDelayMs: 1000, maxDelayMs: 5000 },
    };

    const result = await provider.uploadEvidence(pdfBuffer, evidence, config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Evidence uploaded successfully");
      expect(result.providerReferenceId).toBe("accepted");
    }

    vi.unstubAllGlobals();
  });

  it("uploadEvidence resolves to an UploadResult with ok:false on HTTP 401", async () => {
    const provider = new SprintoProvider();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    vi.stubGlobal("fetch", mockFetch);

    const pdfBuffer = Buffer.from("%PDF-1.4 stub");
    const evidence = {
      id: "ev-00000000-0000-0000-0000-000000000001",
      tenantId: "test-tenant",
      sessionId: "00000000-0000-0000-0000-000000000002",
      employeeId: "emp-001",
      schemaVersion: 1 as const,
      contentHash: "sha256-abc123",
      generatedAt: "2026-02-21T10:00:00.000Z",
      evidence: {
        session: {
          sessionId: "00000000-0000-0000-0000-000000000002",
          employeeId: "emp-001",
          tenantId: "test-tenant",
          attemptNumber: 1,
          totalAttempts: 1,
          status: "passed" as const,
          createdAt: "2026-02-21T09:00:00.000Z",
          completedAt: "2026-02-21T10:00:00.000Z",
        },
        policyAttestation: {
          configHash: "sha256-cfg-001",
          roleProfileId: "rp-001",
          roleProfileVersion: 1,
          appVersion: "1.0.0",
          passThreshold: 0.7,
          maxAttempts: 3,
        },
        modules: [],
        outcome: {
          aggregateScore: 0.9,
          passed: true,
          passThreshold: 0.7,
          weakAreas: null,
          moduleScores: [],
        },
      },
    };
    const config = {
      provider: "sprinto",
      apiKey: "bad-key",
      workflowCheckId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      region: "us",
      retry: { maxAttempts: 2, initialDelayMs: 1000, maxDelayMs: 5000 },
    };

    const result = await provider.uploadEvidence(pdfBuffer, evidence, config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_FAILED");
      expect(result.retryable).toBe(false);
    }

    vi.unstubAllGlobals();
  });
});
