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
 * Training session API routes.
 * POST /api/training/{tenant}/session — start a new training session (T013)
 *                                      or start remediation for a failed session (T022)
 * GET  /api/training/{tenant}/session — get current session state (T014)
 */

import { AuditLogger } from "@/audit/audit-logger";
import { ensureConfigLoaded } from "@/config/index";
import { resolveModel } from "@/intake/ai-model-resolver";
import { ProfileRepository } from "@/intake/profile-repository";
import { getStorage } from "@/storage/factory";
import { logRemediationInitiated, logSessionStarted } from "@/training/audit";
import { CurriculumGenerationError, generateCurriculum } from "@/training/curriculum-generator";
import {
  RemediationPlanError,
  generateRemediationCurriculum,
} from "@/training/remediation-planner";
import { SessionRepository, VersionConflictError } from "@/training/session-repository";
import { transitionSession } from "@/training/state-machine";
import type { TrainingModule } from "@/training/types";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helper — strip server-only fields from module content before sending
// ---------------------------------------------------------------------------

function stripServerFields(module: TrainingModule): unknown {
  if (!module.content) return module;
  return {
    ...module,
    content: {
      ...module.content,
      scenarios: module.content.scenarios.map(({ rubric: _rubric, ...s }) => ({
        ...s,
        options: s.options?.map(({ correct: _correct, ...o }) => o),
      })),
      quiz: module.content.quiz
        ? {
            questions: module.content.quiz.questions.map(({ rubric: _rubric, ...q }) => ({
              ...q,
              options: q.options?.map(({ correct: _correct, ...o }) => o),
            })),
          }
        : module.content.quiz,
    },
  };
}

// ---------------------------------------------------------------------------
// POST — T013: Start a new training session; T022: Remediation
// ---------------------------------------------------------------------------

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

  // Initialise repositories per-request via shared adapter singleton
  const storage = await getStorage();
  const profileRepo = new ProfileRepository(storage);
  const sessionRepo = new SessionRepository(storage);
  const auditLogger = new AuditLogger(storage);

  // 1. Check for existing active session — 409 if one exists
  const existingSession = await sessionRepo.findActiveSession(tenantId, employeeId);
  if (existingSession) {
    return NextResponse.json(
      { error: "conflict", message: "An active training session already exists" },
      { status: 409 },
    );
  }

  // Resolve tenant config (needed for both fresh and remediation paths)
  const snapshot = await ensureConfigLoaded();
  const tenant = snapshot?.tenants.get(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: "not_found", message: "Tenant not found" }, { status: 404 });
  }
  const model = resolveModel(tenant);
  const maxModules = tenant.settings.training?.maxModules ?? 8;
  const maxAttempts = tenant.settings.training?.maxAttempts ?? 3;
  const enableRemediation = tenant.settings.training?.enableRemediation ?? true;

  // 2. T022: Check for a failed session with attempts remaining — start remediation
  const history = await sessionRepo.findSessionHistory(tenantId, employeeId, { limit: 10 });
  const failedSession =
    history.find((s) => s.status === "failed" && s.attemptNumber < maxAttempts) ?? null;

  if (failedSession) {
    // 2a. Remediation must be enabled
    if (!enableRemediation) {
      return NextResponse.json(
        { error: "conflict", message: "Remediation is not enabled for this tenant" },
        { status: 409 },
      );
    }

    // 2b. Find confirmed role profile — 404 if none
    const profile = await profileRepo.findByEmployee(tenantId, employeeId);
    if (!profile) {
      return NextResponse.json(
        { error: "not_found", message: "No confirmed role profile found" },
        { status: 404 },
      );
    }

    // 2c. Generate remediation curriculum focused on weak areas
    const weakAreas = failedSession.weakAreas ?? [];
    let remediationCurriculum: Awaited<ReturnType<typeof generateRemediationCurriculum>>;
    try {
      remediationCurriculum = await generateRemediationCurriculum(
        weakAreas,
        profile,
        { maxModules },
        model,
      );
    } catch (error) {
      if (error instanceof RemediationPlanError) {
        if (error.code === "ai_unavailable") {
          return NextResponse.json(
            { error: "ai_unavailable", message: "AI service temporarily unavailable" },
            { status: 503 },
          );
        }
        return NextResponse.json(
          { error: "planning_failed", message: error.message },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: "internal_error", message: "An unexpected error occurred" },
        { status: 500 },
      );
    }

    // 2d. Increment attemptNumber and transition the failed session through remediation states
    const newAttemptNumber = failedSession.attemptNumber + 1;

    // Transition: failed → in-remediation
    transitionSession(failedSession.status, "remediation-started");
    // Transition: in-remediation → in-progress
    transitionSession("in-remediation", "remediation-modules-ready");

    // 2e. Update the existing session with new curriculum, status, and attemptNumber
    let updatedSession: Awaited<ReturnType<typeof sessionRepo.updateSession>>;
    try {
      updatedSession = await sessionRepo.updateSession(
        tenantId,
        failedSession.id,
        {
          status: "in-progress",
          attemptNumber: newAttemptNumber,
          curriculum: remediationCurriculum,
          weakAreas: null,
          aggregateScore: null,
          completedAt: null,
        },
        failedSession.version,
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

    // 2f. Create new module records for the remediation curriculum
    const now = new Date().toISOString();
    const remediationModuleData = remediationCurriculum.modules.map((m, i) => ({
      tenantId,
      sessionId: failedSession.id,
      moduleIndex: i,
      title: m.title,
      topicArea: m.topicArea,
      jobExpectationIndices: m.jobExpectationIndices,
      status: "locked" as const,
      content: null,
      scenarioResponses: [],
      quizAnswers: [],
      moduleScore: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }));

    const remediationModules = await sessionRepo.createModules(tenantId, remediationModuleData);

    // 2g. Log remediation audit event
    await logRemediationInitiated(
      auditLogger,
      tenantId,
      employeeId,
      failedSession.id,
      newAttemptNumber,
      weakAreas.length,
      weakAreas,
    );

    // 2h. Return 201 with updated session + new modules
    return NextResponse.json(
      { session: updatedSession, modules: remediationModules.map(stripServerFields) },
      { status: 201 },
    );
  }

  // 3. No active session and no failed session with attempts remaining — fresh session
  // Find confirmed role profile — 404 if none
  const profile = await profileRepo.findByEmployee(tenantId, employeeId);
  if (!profile) {
    return NextResponse.json(
      { error: "not_found", message: "No confirmed role profile found" },
      { status: 404 },
    );
  }

  // 4. Generate curriculum via AI
  let curriculum: Awaited<ReturnType<typeof generateCurriculum>>;
  try {
    curriculum = await generateCurriculum(profile, { maxModules }, model);
  } catch (error) {
    if (error instanceof CurriculumGenerationError) {
      if (error.code === "ai_unavailable") {
        return NextResponse.json(
          { error: "ai_unavailable", message: "AI service temporarily unavailable" },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "generation_failed", message: error.message },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 },
    );
  }

  // 5. Create session record
  const now = new Date().toISOString();
  const session = await sessionRepo.createSession(tenantId, {
    tenantId,
    employeeId,
    roleProfileId: profile.id,
    roleProfileVersion: profile.version,
    configHash: snapshot?.configHash ?? "unknown",
    appVersion: process.env.APP_VERSION ?? "unknown",
    status: "in-progress",
    attemptNumber: 1,
    curriculum,
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });

  // 6. Create module records for each curriculum module
  const moduleData = curriculum.modules.map((m, i) => ({
    tenantId,
    sessionId: session.id,
    moduleIndex: i,
    title: m.title,
    topicArea: m.topicArea,
    jobExpectationIndices: m.jobExpectationIndices,
    status: "locked" as const,
    content: null,
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  const modules = await sessionRepo.createModules(tenantId, moduleData);

  // 7. Log audit event
  await logSessionStarted(
    auditLogger,
    tenantId,
    employeeId,
    session.id,
    1,
    profile.version,
    snapshot?.configHash ?? "unknown",
  );

  // 8. Return 201 with session + modules
  return NextResponse.json({ session, modules: modules.map(stripServerFields) }, { status: 201 });
}

// ---------------------------------------------------------------------------
// GET — T014: Get current session state
// ---------------------------------------------------------------------------

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  if (!tenantId || !employeeId || tenantId !== tenantSlug) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  // Initialise repositories per-request via shared adapter singleton
  const storage = await getStorage();
  const sessionRepo = new SessionRepository(storage);

  // Parse query parameters
  const url = new URL(request.url);
  const isHistory = url.searchParams.get("history") === "true";

  // T030: History mode — return all sessions with their modules
  if (isHistory) {
    const sessions = await sessionRepo.findSessionHistory(tenantId, employeeId);
    const sessionsWithModules = await Promise.all(
      sessions.map(async (sess) => {
        const modules = await sessionRepo.findModulesBySession(tenantId, sess.id);
        const clientModules = modules.map(stripServerFields);
        return { session: sess, modules: clientModules };
      }),
    );
    return NextResponse.json(sessionsWithModules);
  }

  // T014: Default mode — return active or most recent session
  let session = await sessionRepo.findActiveSession(tenantId, employeeId);
  if (!session) {
    const history = await sessionRepo.findSessionHistory(tenantId, employeeId, { limit: 1 });
    session = history[0] ?? null;
  }

  if (!session) {
    return NextResponse.json(
      { error: "not_found", message: "No training session found" },
      { status: 404 },
    );
  }

  // 2. Find modules for this session
  const modules = await sessionRepo.findModulesBySession(tenantId, session.id);

  // 3. Strip server-only fields (correct answers, rubrics) from module content
  const clientModules = modules.map(stripServerFields);

  // 4. Read maxAttempts from tenant config so the UI can display accurate attempt counts
  const snapshot = await ensureConfigLoaded();
  const tenantConfig = snapshot?.tenants.get(tenantSlug);
  if (!tenantConfig) {
    return NextResponse.json({ error: "not_found", message: "Tenant not found" }, { status: 404 });
  }
  const maxAttempts = tenantConfig.settings.training?.maxAttempts ?? 3;

  return NextResponse.json({ session, modules: clientModules, maxAttempts });
}
