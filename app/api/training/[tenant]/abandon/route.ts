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
 * Abandon training session API route.
 * POST /api/training/{tenant}/abandon — T032
 * Transitions an in-progress or in-remediation session to abandoned.
 */

import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { logSessionAbandoned } from "@/training/audit";
import { SessionRepository, VersionConflictError } from "@/training/session-repository";
import { StateTransitionError, transitionSession } from "@/training/state-machine";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  if (!tenantId || !employeeId || tenantId !== tenantSlug) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  // Initialise repositories per-request to avoid connection sharing
  const storage = new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
  const sessionRepo = new SessionRepository(storage);

  await storage.initialize();

  try {
    // 1. Find active session — 404 if none
    const session = await sessionRepo.findActiveSession(tenantId, employeeId);
    if (!session) {
      return NextResponse.json(
        { error: "not_found", message: "No active training session found" },
        { status: 404 },
      );
    }

    // 2. Guard: session must be in-progress or in-remediation
    if (session.status !== "in-progress" && session.status !== "in-remediation") {
      return NextResponse.json(
        {
          error: "conflict",
          message: `Session is in '${session.status}' state, expected 'in-progress' or 'in-remediation'`,
        },
        { status: 409 },
      );
    }

    // 3. Validate state transition
    let nextStatus: ReturnType<typeof transitionSession>;
    try {
      nextStatus = transitionSession(session.status, "session-abandoned");
    } catch (err) {
      if (err instanceof StateTransitionError) {
        return NextResponse.json({ error: "conflict", message: err.message }, { status: 409 });
      }
      throw err;
    }

    // 4. Update session to abandoned with completedAt
    const now = new Date().toISOString();
    let updatedSession: Awaited<ReturnType<typeof sessionRepo.updateSession>>;
    try {
      updatedSession = await sessionRepo.updateSession(
        tenantId,
        session.id,
        {
          status: nextStatus,
          completedAt: now,
        },
        session.version,
      );
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return NextResponse.json(
          { error: "conflict", message: "Session was modified by another request" },
          { status: 409 },
        );
      }
      throw err;
    }

    // 5. Count modules completed (status "scored")
    const modules = await sessionRepo.findModulesBySession(tenantId, session.id);
    const modulesCompleted = modules.filter((m) => m.status === "scored").length;
    const totalModules = modules.length;

    // 6. Log audit event
    await logSessionAbandoned(
      storage,
      tenantId,
      employeeId,
      session.id,
      session.attemptNumber,
      modulesCompleted,
      totalModules,
    );

    // 7. Return 200 with updated session
    return NextResponse.json({ session: updatedSession }, { status: 200 });
  } finally {
    await storage.close();
  }
}
