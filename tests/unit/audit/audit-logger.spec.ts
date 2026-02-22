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

import { AuditLogger } from "@/audit/audit-logger";
import type { AuditEventInput } from "@/audit/audit-types";
import type { StorageAdapter } from "@/storage/adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = "acme-corp";
const COLLECTION = "audit_events";
const ISO = "2026-02-22T12:00:00.000Z";

function createMockStorage(): StorageAdapter {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: "evt-1" }),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    getMetadata: vi.fn().mockReturnValue({ adapterName: "mock", adapterVersion: "1.0" }),
    close: vi.fn(),
  };
}

function validEvent(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    eventType: "sign-in",
    employeeId: "emp-001",
    timestamp: ISO,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditLogger", () => {
  let storage: StorageAdapter;
  let logger: AuditLogger;

  beforeEach(() => {
    storage = createMockStorage();
    logger = new AuditLogger(storage);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // log() — happy path
  // -----------------------------------------------------------------------

  describe("log() writes to audit_events collection", () => {
    it("stores a valid event with all required fields", async () => {
      const event = validEvent();

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledOnce();
      expect(storage.create).toHaveBeenCalledWith(TENANT, COLLECTION, {
        eventType: "sign-in",
        tenantId: TENANT,
        employeeId: "emp-001",
        timestamp: ISO,
        ipAddress: null,
        userAgent: null,
        metadata: {},
      });
    });

    it("passes optional ipAddress and userAgent when provided", async () => {
      const event = validEvent({
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        }),
      );
    });

    it("includes metadata in the stored record", async () => {
      const event = validEvent({
        metadata: { sessionId: "sess-123", score: 0.85 },
      });

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({
          metadata: { sessionId: "sess-123", score: 0.85 },
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Immutability — no update or delete
  // -----------------------------------------------------------------------

  describe("immutability", () => {
    it("does NOT expose an update method", () => {
      expect(logger).not.toHaveProperty("update");
    });

    it("does NOT expose a delete method", () => {
      expect(logger).not.toHaveProperty("delete");
    });

    it("only exposes 'log' as a public method", () => {
      const proto = Object.getOwnPropertyNames(AuditLogger.prototype).filter(
        (name) => name !== "constructor",
      );
      expect(proto).toEqual(["log"]);
    });
  });

  // -----------------------------------------------------------------------
  // Validation — malformed input
  // -----------------------------------------------------------------------

  describe("event validation rejects malformed input", () => {
    it("rejects an invalid eventType", async () => {
      const event = validEvent({ eventType: "not-a-real-event" as never });

      await logger.log(TENANT, event);

      expect(storage.create).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "Audit event validation failed:",
        expect.any(String),
      );
    });

    it("rejects a missing timestamp", async () => {
      const event = { eventType: "sign-in", employeeId: "emp-001" } as AuditEventInput;

      await logger.log(TENANT, event);

      expect(storage.create).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "Audit event validation failed:",
        expect.any(String),
      );
    });

    it("rejects a non-ISO-8601 timestamp", async () => {
      const event = validEvent({ timestamp: "not-a-date" });

      await logger.log(TENANT, event);

      expect(storage.create).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "Audit event validation failed:",
        expect.any(String),
      );
    });

    it("rejects an event missing employeeId entirely", async () => {
      const event = {
        eventType: "sign-in",
        timestamp: ISO,
      } as AuditEventInput;

      await logger.log(TENANT, event);

      expect(storage.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // __system__ tenantId fallback
  // -----------------------------------------------------------------------

  describe("__system__ tenantId fallback", () => {
    it("uses __system__ when empty string is passed as tenantId", async () => {
      await logger.log("", validEvent());

      expect(storage.create).toHaveBeenCalledWith(
        "__system__",
        COLLECTION,
        expect.objectContaining({
          tenantId: "__system__",
        }),
      );
    });

    it("preserves the original tenantId when non-empty", async () => {
      await logger.log(TENANT, validEvent());

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({
          tenantId: TENANT,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Storage errors — caught and logged, not thrown
  // -----------------------------------------------------------------------

  describe("storage error handling", () => {
    it("catches storage errors and logs them instead of throwing", async () => {
      (storage.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB write failed"));

      await expect(logger.log(TENANT, validEvent())).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(
        "Audit logging failed (sign-in):",
        expect.any(Error),
      );
    });

    it("does not propagate the error to the caller", async () => {
      (storage.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Connection lost"));

      // Should NOT throw — the caller must never be disrupted by audit failures.
      await logger.log(TENANT, validEvent());
    });
  });

  // -----------------------------------------------------------------------
  // Valid events with all metadata schemas
  // -----------------------------------------------------------------------

  describe("valid events with all metadata schemas", () => {
    it("logs an evidence-exported event with matching metadata", async () => {
      const event = validEvent({
        eventType: "evidence-exported",
        metadata: {
          sessionId: "sess-abc",
          format: "pdf",
          evidenceId: "ev-001",
        },
      });

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({
          eventType: "evidence-exported",
          metadata: { sessionId: "sess-abc", format: "pdf", evidenceId: "ev-001" },
        }),
      );
    });

    it("logs an integration-push-success event with matching metadata", async () => {
      const event = validEvent({
        eventType: "integration-push-success",
        metadata: {
          sessionId: "sess-def",
          provider: "sprinto",
          uploadId: "up-999",
          evidenceId: "ev-002",
        },
      });

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({
          eventType: "integration-push-success",
          metadata: {
            sessionId: "sess-def",
            provider: "sprinto",
            uploadId: "up-999",
            evidenceId: "ev-002",
          },
        }),
      );
    });

    it("logs an integration-push-failure event with matching metadata", async () => {
      const event = validEvent({
        eventType: "integration-push-failure",
        metadata: {
          sessionId: "sess-ghi",
          provider: "sprinto",
          error: "401 Unauthorized",
          evidenceId: "ev-003",
        },
      });

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({
          eventType: "integration-push-failure",
          metadata: {
            sessionId: "sess-ghi",
            provider: "sprinto",
            error: "401 Unauthorized",
            evidenceId: "ev-003",
          },
        }),
      );
    });

    it.each([
      "sign-in",
      "sign-out",
      "auth-failure",
      "auth-config-error",
      "training-session-started",
      "training-module-completed",
      "training-quiz-submitted",
      "training-evaluation-completed",
      "training-remediation-initiated",
      "training-session-abandoned",
      "training-session-exhausted",
      "evidence-exported",
      "integration-push-success",
      "integration-push-failure",
    ] as const)("accepts eventType '%s'", async (eventType) => {
      await logger.log(TENANT, validEvent({ eventType }));

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({ eventType }),
      );
    });

    it("stores event with null employeeId for system-level events", async () => {
      const event = validEvent({
        eventType: "auth-config-error",
        employeeId: null,
      });

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({ employeeId: null }),
      );
    });

    it("defaults metadata to empty object when not provided", async () => {
      const event: AuditEventInput = {
        eventType: "sign-in",
        employeeId: "emp-001",
        timestamp: ISO,
      } as AuditEventInput;

      await logger.log(TENANT, event);

      expect(storage.create).toHaveBeenCalledWith(
        TENANT,
        COLLECTION,
        expect.objectContaining({ metadata: {} }),
      );
    });
  });
});
