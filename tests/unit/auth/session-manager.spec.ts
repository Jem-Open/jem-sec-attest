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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("iron-session", () => ({ getIronSession: vi.fn() }));

import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import {
  createSession,
  destroySession,
  getSession,
} from "../../../src/auth/session/session-manager";
import type { EmployeeSession } from "../../../src/auth/types";

const BASE_EMPLOYEE: EmployeeSession = {
  sessionId: "sess-001",
  tenantId: "tenant-abc",
  employeeId: "emp-123",
  email: "alice@example.com",
  displayName: "Alice",
  idpIssuer: "https://idp.example.com",
  createdAt: Date.now(),
  expiresAt: Date.now() + 3_600_000,
};

function makeMockSession(overrides: Partial<{ employee: EmployeeSession | undefined }> = {}) {
  return {
    employee: BASE_EMPLOYEE,
    save: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.SESSION_SECRET = "a-very-long-secret-at-least-32-chars!!";
  vi.mocked(cookies).mockResolvedValue({} as unknown);
});

afterEach(() => {
  process.env.SESSION_SECRET = undefined;
  vi.clearAllMocks();
});

describe("getSession", () => {
  it("returns session with employee when session exists and is not expired", async () => {
    const mockSession = makeMockSession({
      employee: { ...BASE_EMPLOYEE, expiresAt: Date.now() + 3_600_000 },
    });
    vi.mocked(getIronSession).mockResolvedValue(mockSession as unknown);

    const result = await getSession();

    expect(result.employee).toBeDefined();
    expect(result.employee?.email).toBe("alice@example.com");
    expect(mockSession.save).not.toHaveBeenCalled();
  });

  it("returns session with no employee when session.employee is undefined", async () => {
    const mockSession = makeMockSession({ employee: undefined });
    vi.mocked(getIronSession).mockResolvedValue(mockSession as unknown);

    const result = await getSession();

    expect(result.employee).toBeUndefined();
    expect(mockSession.save).not.toHaveBeenCalled();
  });

  it("clears employee and calls save when session is expired", async () => {
    const mockSession = makeMockSession({
      employee: { ...BASE_EMPLOYEE, expiresAt: Date.now() - 1 },
    });
    vi.mocked(getIronSession).mockResolvedValue(mockSession as unknown);

    const result = await getSession();

    expect(result.employee).toBeUndefined();
    expect(mockSession.save).toHaveBeenCalledOnce();
  });

  it("throws when SESSION_SECRET is not set", async () => {
    process.env.SESSION_SECRET = undefined;

    await expect(getSession()).rejects.toThrow(
      "SESSION_SECRET must be set and at least 32 characters",
    );
  });
});

describe("createSession", () => {
  it("sets session.employee to the provided data and calls save()", async () => {
    const mockSession = makeMockSession({ employee: undefined });
    vi.mocked(getIronSession).mockResolvedValue(mockSession as unknown);

    await createSession(BASE_EMPLOYEE);

    expect(mockSession.employee).toEqual(BASE_EMPLOYEE);
    expect(mockSession.save).toHaveBeenCalledOnce();
  });
});

describe("destroySession", () => {
  it("calls session.destroy()", async () => {
    const mockSession = makeMockSession();
    vi.mocked(getIronSession).mockResolvedValue(mockSession as unknown);

    await destroySession();

    expect(mockSession.destroy).toHaveBeenCalledOnce();
  });
});
