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
 * Evaluation API route.
 * POST /api/training/{tenant}/evaluate
 * Computes the final pass/fail decision for a training session in `evaluating` state.
 */

import { getSnapshot } from "@/config/index";
import { generateEvidenceForSession } from "@/evidence/evidence-generator";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { logEvaluationCompleted, logSessionExhausted } from "@/training/audit";
import { computeAggregateScore, identifyWeakAreas, isPassing } from "@/training/score-calculator";
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
    // Find active session
    const session = await sessionRepo.findActiveSession(tenantId, employeeId);
    if (!session) {
      return NextResponse.json(
        { error: "not_found", message: "No active training session found" },
        { status: 404 },
      );
    }

    // Guard: session must be in evaluating state
    if (session.status !== "evaluating") {
      return NextResponse.json(
        {
          error: "conflict",
          message: `Session is in '${session.status}' state, expected 'evaluating'`,
        },
        { status: 409 },
      );
    }

    // Find all modules
    const modules = await sessionRepo.findModulesBySession(tenantId, session.id);

    // Extract module scores — all must be non-null before computing aggregate
    const rawScores = modules.map((m) => m.moduleScore);
    if (rawScores.some((s) => s === null || s === undefined)) {
      return NextResponse.json(
        { error: "conflict", message: "Not all modules have been scored" },
        { status: 409 },
      );
    }
    const moduleScores = rawScores as number[];

    // Compute aggregate score
    const aggregateScore = computeAggregateScore(moduleScores) ?? 0;

    // Get tenant training config
    const snapshot = getSnapshot();
    const tenant = snapshot?.tenants.get(tenantId);
    const trainingConfig = tenant?.settings?.training;
    const passThreshold = trainingConfig?.passThreshold ?? 0.7;
    const maxAttempts = trainingConfig?.maxAttempts ?? 3;

    const now = new Date().toISOString();
    let nextAction: "complete" | "remediation-available" | "exhausted";
    let passed: boolean;
    let newStatus: "passed" | "failed" | "exhausted";
    let completedAt: string | null = null;
    let weakAreas: string[] | undefined;

    if (isPassing(aggregateScore, passThreshold)) {
      // Pass
      passed = true;
      newStatus = "passed";
      nextAction = "complete";
      completedAt = now;
    } else if (session.attemptNumber < maxAttempts) {
      // Failed with attempts remaining
      passed = false;
      newStatus = "failed";
      nextAction = "remediation-available";
      weakAreas = identifyWeakAreas(
        modules.map((m) => ({ topicArea: m.topicArea, moduleScore: m.moduleScore as number })),
        passThreshold,
      );
    } else {
      // Failed and exhausted all attempts
      passed = false;
      newStatus = "exhausted";
      nextAction = "exhausted";
      completedAt = now;
    }

    // Transition session state
    try {
      transitionSession(
        session.status,
        `evaluation-${newStatus}` as Parameters<typeof transitionSession>[1],
      );
    } catch (err) {
      if (err instanceof StateTransitionError) {
        return NextResponse.json({ error: "conflict", message: err.message }, { status: 409 });
      }
      throw err;
    }

    // Update session
    const updateData: Parameters<typeof sessionRepo.updateSession>[2] = {
      status: newStatus,
      aggregateScore,
      ...(weakAreas !== undefined ? { weakAreas } : {}),
      ...(completedAt !== null ? { completedAt } : {}),
    };

    try {
      await sessionRepo.updateSession(tenantId, session.id, updateData, session.version);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        return NextResponse.json(
          { error: "conflict", message: "Session was modified by another request" },
          { status: 409 },
        );
      }
      throw err;
    }

    // Audit logging
    await logEvaluationCompleted(
      storage,
      tenantId,
      employeeId,
      session.id,
      session.attemptNumber,
      aggregateScore,
      passed,
    );

    if (newStatus === "exhausted") {
      await logSessionExhausted(
        storage,
        tenantId,
        employeeId,
        session.id,
        aggregateScore,
        session.attemptNumber,
      );
    }

    // Fire-and-forget evidence generation for terminal states
    if (newStatus === "passed" || newStatus === "exhausted") {
      generateEvidenceForSession(storage, tenantId, session.id).catch((err) =>
        console.error("Evidence generation failed:", err),
      );
    }

    return NextResponse.json(
      {
        sessionId: session.id,
        aggregateScore,
        passed,
        attemptNumber: session.attemptNumber,
        ...(weakAreas !== undefined ? { weakAreas } : {}),
        nextAction,
      },
      { status: 200 },
    );
  } finally {
    await storage.close();
  }
}
