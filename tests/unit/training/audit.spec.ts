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

import type { AuditLogger } from "@/audit/audit-logger";
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

function createMockLogger(): AuditLogger {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogger;
}

const TENANT_ID = "acme-corp";
const EMPLOYEE_ID = "emp-001";
const SESSION_ID = "session-abc";

describe("logSessionStarted", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logSessionStarted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logSessionStarted(logger, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logSessionStarted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-session-started" });
  });

  it("includes employeeId in event data", async () => {
    await logSessionStarted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logSessionStarted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logSessionStarted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      roleProfileVersion: 2,
      configHash: "hash-xyz",
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logSessionStarted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, "hash-xyz");

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logModuleCompleted", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logModuleCompleted(
      logger,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logModuleCompleted(
      logger,
      "globex-inc",
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logModuleCompleted(
      logger,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-module-completed" });
  });

  it("includes employeeId in event data", async () => {
    await logModuleCompleted(
      logger,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logModuleCompleted(
      logger,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logModuleCompleted(
      logger,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      moduleIndex: 0,
      moduleTitle: "Phishing Awareness",
      moduleScore: 85,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logModuleCompleted(
      logger,
      TENANT_ID,
      EMPLOYEE_ID,
      SESSION_ID,
      0,
      "Phishing Awareness",
      85,
    );

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logQuizSubmitted", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logQuizSubmitted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logQuizSubmitted(logger, "globex-inc", EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logQuizSubmitted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-quiz-submitted" });
  });

  it("includes employeeId in event data", async () => {
    await logQuizSubmitted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logQuizSubmitted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logQuizSubmitted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      moduleIndex: 0,
      questionCount: 5,
      mcCount: 3,
      freeTextCount: 2,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logQuizSubmitted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 0, 5, 3, 2);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
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
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logEvaluationCompleted", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logEvaluationCompleted(logger, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-evaluation-completed" });
  });

  it("includes employeeId in event data", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      aggregateScore: 78.5,
      passed: true,
    });
  });

  it("records failed evaluation correctly", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 2, 42.0, false);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toMatchObject({
      passed: false,
      aggregateScore: 42.0,
      attemptNumber: 2,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logEvaluationCompleted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 78.5, true);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
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
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logRemediationInitiated", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logRemediationInitiated(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logRemediationInitiated(logger, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
    ]);

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logRemediationInitiated(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-remediation-initiated" });
  });

  it("includes employeeId in event data", async () => {
    await logRemediationInitiated(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logRemediationInitiated(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, [
      "Phishing",
      "Password Policy",
    ]);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields including weakAreas topic names", async () => {
    const weakAreas = ["Phishing", "Password Policy"];
    await logRemediationInitiated(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, weakAreas);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      weakAreaCount: 2,
      weakAreas: ["Phishing", "Password Policy"],
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logRemediationInitiated(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 1, ["Phishing"]);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logSessionAbandoned", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logSessionAbandoned(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logSessionAbandoned(logger, "globex-inc", EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logSessionAbandoned(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-session-abandoned" });
  });

  it("includes employeeId in event data", async () => {
    await logSessionAbandoned(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logSessionAbandoned(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logSessionAbandoned(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      attemptNumber: 1,
      modulesCompleted: 2,
      totalModules: 5,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logSessionAbandoned(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 1, 2, 5);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("logSessionExhausted", () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it("calls logger.log with tenantId and event", async () => {
    await logSessionExhausted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    expect(logger.log).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
  });

  it("passes tenantId as first argument to logger.log", async () => {
    await logSessionExhausted(logger, "globex-inc", EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    expect(logger.log).toHaveBeenCalledWith("globex-inc", expect.any(Object));
  });

  it("includes correct eventType in event data", async () => {
    await logSessionExhausted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ eventType: "training-session-exhausted" });
  });

  it("includes employeeId in event data", async () => {
    await logSessionExhausted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, event] = vi.mocked(logger.log).mock.calls[0];
    expect(event).toMatchObject({ employeeId: EMPLOYEE_ID });
  });

  it("includes a valid ISO timestamp in event data", async () => {
    await logSessionExhausted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof event.timestamp).toBe("string");
    expect(() => new Date(event.timestamp as string).toISOString()).not.toThrow();
  });

  it("includes correct metadata fields", async () => {
    await logSessionExhausted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toEqual({
      sessionId: SESSION_ID,
      finalScore: 55.0,
      totalAttempts: 3,
    });
  });

  it("does not include raw content fields in event data", async () => {
    await logSessionExhausted(logger, TENANT_ID, EMPLOYEE_ID, SESSION_ID, 55.0, 3);

    const [, event] = vi.mocked(logger.log).mock.calls[0] as [string, Record<string, unknown>];
    const forbidden = ["content", "instructions", "text", "response", "material", "freeText"];
    for (const key of forbidden) {
      expect(event).not.toHaveProperty(key);
    }
    const metadata = event.metadata as Record<string, unknown>;
    for (const key of forbidden) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});
