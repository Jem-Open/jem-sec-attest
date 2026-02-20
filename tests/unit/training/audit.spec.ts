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

import type { StorageAdapter } from "@/storage/adapter.js";
import {
  logEvaluationCompleted,
  logModuleCompleted,
  logQuizSubmitted,
  logRemediationInitiated,
  logSessionAbandoned,
  logSessionExhausted,
  logSessionStarted,
} from "@/training/audit.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockStorage(): StorageAdapter {
  return {
    initialize: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
    close: vi.fn(),
  } as unknown as StorageAdapter;
}

const COLLECTION = "audit_events";
const TENANT_ID = "acme-corp";
const EMPLOYEE_ID = "emp-001";
const SESSION_ID = "session-abc";

describe("logSessionStarted", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logSessionStarted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logSessionStarted(storage, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logSessionStarted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-session-started" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logSessionStarted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logSessionStarted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logSessionStarted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      roleProfileVersion: 2,
      configHash: "hash-xyz",
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logSessionStarted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logModuleCompleted", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logModuleCompleted(
      storage,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logModuleCompleted(
      storage,
      "globex-inc",
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logModuleCompleted(
      storage,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-module-completed" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logModuleCompleted(
      storage,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logModuleCompleted(
      storage,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logModuleCompleted(
      storage,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      moduleIndex: 0,
      moduleTitle: "Phishing Awareness",
      moduleScore: 85,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logModuleCompleted(
      storage,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logQuizSubmitted", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logQuizSubmitted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logQuizSubmitted(storage, "globex-inc", EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logQuizSubmitted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-quiz-submitted" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logQuizSubmitted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logQuizSubmitted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logQuizSubmitted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      moduleIndex: 0,
      questionCount: 5,
      mcCount: 3,
      freeTextCount: 2,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logQuizSubmitted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = [
      "content",
      "instructions",
      "text",
      "response",
      "material",
      "freeText",
      "answers",
      "questions",
    ];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logEvaluationCompleted", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logEvaluationCompleted(storage, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-evaluation-completed" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      aggregateScore: 78.5,
      passed: true,
    });
  });

  it("records failed evaluation correctly", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 2, 42.0, false);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toMatchObject({
      passed: false,
      aggregateScore: 42.0,
      attemptNumber: 2,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logEvaluationCompleted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = [
      "content",
      "instructions",
      "text",
      "response",
      "material",
      "freeText",
      "feedback",
    ];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logRemediationInitiated", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logRemediationInitiated(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logRemediationInitiated(storage, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
    ]);

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logRemediationInitiated(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-remediation-initiated" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logRemediationInitiated(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logRemediationInitiated(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields including weakAreas topic names", async () => {
    const weakAreas = ["Phishing", "Password Policy"];
    await logRemediationInitiated(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, weakAreas);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      weakAreaCount: 2,
      weakAreas: ["Phishing", "Password Policy"],
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logRemediationInitiated(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 1, ["Phishing"]);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logSessionAbandoned", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logSessionAbandoned(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logSessionAbandoned(storage, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logSessionAbandoned(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-session-abandoned" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logSessionAbandoned(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logSessionAbandoned(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logSessionAbandoned(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      modulesCompleted: 2,
      totalModules: 5,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logSessionAbandoned(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logSessionExhausted", () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = createMockStorage();
  });

  it("calls storage.create with the audit_events collection", async () => {
    await logSessionExhausted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    expect(storage.create).toHaveBeenCalledOnce();
    expect(storage.create).toHaveBeenCalledWith(TENANT_ID, COLLECTION, expect.any(Object));
  });

  it("passes tenantId as first argument to storage.create", async () => {
    await logSessionExhausted(storage, "globex-inc", EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    expect(storage.create).toHaveBeenCalledWith(
      "globex-inc",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("includes correct eventType in event data", async () => {
    await logSessionExhausted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ eventType: "training-session-exhausted" });
  });

  it("includes tenantId and employeeId in event data", async () => {
    await logSessionExhausted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0];
    expect(eventData).toMatchObject({ tenantId: TENANT_ID, employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logSessionExhausted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(typeof eventData.timestamp).toBe("string");
    expect(() => new Date(eventData.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logSessionExhausted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(eventData.metadata).toEqual({
      sessionId: SESSION_ID,
      finalScore: 55.0,
      totalAttempts: 3,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logSessionExhausted(storage, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, , eventData] = vi.mocked(storage.create).mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(eventData).not.toHaveProperty(key);
    }
    const metadata = eventData.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});
