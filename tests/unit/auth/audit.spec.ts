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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAuthConfigErrorEvent,
  createAuthFailureEvent,
  createSignInEvent,
  createSignOutEvent,
  logAuthEvent,
} from "../../../src/auth/audit";
import type { StorageAdapter } from "../../../src/storage/adapter";

function makeStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    initialize: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    getMetadata: vi.fn(),
    close: vi.fn(),
    ...overrides,
  };
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com", { headers });
}

describe("logAuthEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls storage.create with the tenantId as the storage key", async () => {
    const storage = makeStorage();
    await logAuthEvent(storage, {
      eventType: "sign-in",
      tenantId: "acme-corp",
      employeeId: "emp-001",
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
    });

    expect(storage.create).toHaveBeenCalledOnce();
    const [tenantArg] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(tenantArg).toBe("acme-corp");
  });

  it("falls back to __system__ as the storage key when tenantId is null", async () => {
    const storage = makeStorage();
    await logAuthEvent(storage, {
      eventType: "auth-failure",
      tenantId: null,
      employeeId: null,
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
    });

    const [tenantArg] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(tenantArg).toBe("__system__");
  });

  it("stores a valid ISO 8601 timestamp in the persisted record", async () => {
    const storage = makeStorage();
    const before = new Date().toISOString();

    await logAuthEvent(storage, {
      eventType: "sign-in",
      tenantId: "acme-corp",
      employeeId: "emp-001",
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
    });

    const after = new Date().toISOString();
    const [, , record] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(typeof record.timestamp).toBe("string");
    expect(record.timestamp >= before).toBe(true);
    expect(record.timestamp <= after).toBe(true);
    // Must be parseable as a date
    expect(Number.isNaN(Date.parse(record.timestamp as string))).toBe(false);
  });

  it("defaults metadata to an empty object when not provided", async () => {
    const storage = makeStorage();
    await logAuthEvent(storage, {
      eventType: "sign-in",
      tenantId: "acme-corp",
      employeeId: "emp-001",
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
    });

    const [, , record] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(record.metadata).toEqual({});
  });

  it("passes through provided metadata without modification", async () => {
    const storage = makeStorage();
    const metadata = { idpIssuer: "https://idp.example.com", sessionIndex: "abc-123" };

    await logAuthEvent(storage, {
      eventType: "sign-in",
      tenantId: "acme-corp",
      employeeId: "emp-001",
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
      metadata,
    });

    const [, , record] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(record.metadata).toEqual(metadata);
  });

  it("stores the correct collection name", async () => {
    const storage = makeStorage();
    await logAuthEvent(storage, {
      eventType: "sign-in",
      tenantId: "acme-corp",
      employeeId: "emp-001",
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
    });

    const [, collectionArg] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(collectionArg).toBe("audit_events");
  });

  it("persists eventType, tenantId, and employeeId in the record", async () => {
    const storage = makeStorage();
    await logAuthEvent(storage, {
      eventType: "sign-out",
      tenantId: "globex-inc",
      employeeId: "emp-042",
      ipAddress: "10.0.0.1",
      userAgent: "curl/7.88",
    });

    const [, , record] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(record.eventType).toBe("sign-out");
    expect(record.tenantId).toBe("globex-inc");
    expect(record.employeeId).toBe("emp-042");
  });

  it("preserves null tenantId in the stored record even when __system__ is used as key", async () => {
    const storage = makeStorage();
    await logAuthEvent(storage, {
      eventType: "auth-failure",
      tenantId: null,
      employeeId: null,
      ipAddress: "1.2.3.4",
      userAgent: "TestBrowser/1.0",
    });

    const [, , record] = (storage.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(record.tenantId).toBeNull();
  });
});

describe("createSignInEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets eventType to sign-in", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.eventType).toBe("sign-in");
  });

  it("sets tenantId and employeeId from arguments", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.tenantId).toBe("acme-corp");
    expect(event.employeeId).toBe("emp-001");
  });

  it("includes idpIssuer in metadata", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.metadata).toEqual({ idpIssuer: "https://idp.example.com" });
  });

  it("reads ipAddress from x-forwarded-for header", () => {
    const request = makeRequest({
      "x-forwarded-for": "203.0.113.42",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.ipAddress).toBe("203.0.113.42");
  });

  it("reads userAgent from user-agent header", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "Mozilla/5.0 (compatible; TestAgent)",
    });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.userAgent).toBe("Mozilla/5.0 (compatible; TestAgent)");
  });

  it("falls back to unknown for ipAddress when x-forwarded-for is absent", () => {
    const request = makeRequest({ "user-agent": "TestBrowser/1.0" });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.ipAddress).toBe("unknown");
  });

  it("falls back to unknown for userAgent when user-agent header is absent", () => {
    const request = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.userAgent).toBe("unknown");
  });

  it("falls back to unknown for both headers when no headers are present", () => {
    const request = makeRequest();
    const event = createSignInEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.ipAddress).toBe("unknown");
    expect(event.userAgent).toBe("unknown");
  });
});

describe("createSignOutEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets eventType to sign-out", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.eventType).toBe("sign-out");
  });

  it("sets tenantId and employeeId from arguments", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.tenantId).toBe("acme-corp");
    expect(event.employeeId).toBe("emp-001");
  });

  it("includes idpIssuer in metadata", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.metadata).toEqual({ idpIssuer: "https://idp.example.com" });
  });

  it("reads ipAddress from x-forwarded-for header", () => {
    const request = makeRequest({
      "x-forwarded-for": "198.51.100.7",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.ipAddress).toBe("198.51.100.7");
  });

  it("reads userAgent from user-agent header", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "Safari/605.1.15",
    });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.userAgent).toBe("Safari/605.1.15");
  });

  it("falls back to unknown for ipAddress when x-forwarded-for is absent", () => {
    const request = makeRequest({ "user-agent": "TestBrowser/1.0" });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.ipAddress).toBe("unknown");
  });

  it("falls back to unknown for userAgent when user-agent header is absent", () => {
    const request = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const event = createSignOutEvent("acme-corp", "emp-001", "https://idp.example.com", request);
    expect(event.userAgent).toBe("unknown");
  });
});

describe("createAuthFailureEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets eventType to auth-failure", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request);
    expect(event.eventType).toBe("auth-failure");
  });

  it("sets employeeId to null", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request);
    expect(event.employeeId).toBeNull();
  });

  it("accepts null tenantId and reflects it in the event", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent(null, "unknown-tenant", request);
    expect(event.tenantId).toBeNull();
  });

  it("sets tenantId from the argument when provided", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("globex-inc", "expired-token", request);
    expect(event.tenantId).toBe("globex-inc");
  });

  it("includes reason in metadata", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("acme-corp", "token-expired", request);
    expect(event.metadata?.reason).toBe("token-expired");
  });

  it("includes idpIssuer in metadata when provided", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent(
      "acme-corp",
      "invalid-signature",
      request,
      "https://idp.example.com",
    );
    expect(event.metadata?.idpIssuer).toBe("https://idp.example.com");
    expect(event.metadata?.reason).toBe("invalid-signature");
  });

  it("omits idpIssuer from metadata when not provided", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request);
    expect(event.metadata).not.toHaveProperty("idpIssuer");
  });

  it("omits idpIssuer from metadata when idpIssuer is undefined", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request, undefined);
    expect(Object.keys(event.metadata ?? {})).not.toContain("idpIssuer");
  });

  it("reads ipAddress from x-forwarded-for header", () => {
    const request = makeRequest({
      "x-forwarded-for": "10.20.30.40",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request);
    expect(event.ipAddress).toBe("10.20.30.40");
  });

  it("falls back to unknown for ipAddress when x-forwarded-for is absent", () => {
    const request = makeRequest({ "user-agent": "TestBrowser/1.0" });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request);
    expect(event.ipAddress).toBe("unknown");
  });

  it("falls back to unknown for userAgent when user-agent header is absent", () => {
    const request = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const event = createAuthFailureEvent("acme-corp", "invalid-state", request);
    expect(event.userAgent).toBe("unknown");
  });
});

describe("createAuthConfigErrorEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets eventType to auth-config-error", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.eventType).toBe("auth-config-error");
  });

  it("sets tenantId from the argument", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.tenantId).toBe("acme-corp");
  });

  it("sets employeeId to null", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.employeeId).toBeNull();
  });

  it("includes reason in metadata", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-secret", request);
    expect(event.metadata?.reason).toBe("missing-client-secret");
  });

  it("includes tenantId in metadata", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("globex-inc", "invalid-issuer-url", request);
    expect(event.metadata?.tenantId).toBe("globex-inc");
  });

  it("metadata contains exactly reason and tenantId", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.metadata).toEqual({ reason: "missing-client-id", tenantId: "acme-corp" });
  });

  it("reads ipAddress from x-forwarded-for header", () => {
    const request = makeRequest({
      "x-forwarded-for": "192.0.2.1",
      "user-agent": "TestBrowser/1.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.ipAddress).toBe("192.0.2.1");
  });

  it("reads userAgent from user-agent header", () => {
    const request = makeRequest({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "Chrome/120.0",
    });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.userAgent).toBe("Chrome/120.0");
  });

  it("falls back to unknown for userAgent when user-agent header is absent", () => {
    const request = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.userAgent).toBe("unknown");
  });

  it("falls back to unknown for ipAddress when x-forwarded-for is absent", () => {
    const request = makeRequest({ "user-agent": "TestBrowser/1.0" });
    const event = createAuthConfigErrorEvent("acme-corp", "missing-client-id", request);
    expect(event.ipAddress).toBe("unknown");
  });
});
