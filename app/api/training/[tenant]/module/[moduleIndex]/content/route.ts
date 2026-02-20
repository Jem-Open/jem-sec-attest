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
 * POST /api/training/{tenant}/module/{moduleIndex}/content
 * Generates content for a specific training module.
 * Idempotent: returns existing content if already generated.
 */

import { getSnapshot } from "@/config/index";
import { resolveModel } from "@/intake/ai-model-resolver";
import { ProfileRepository } from "@/intake/profile-repository";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { ModuleGenerationError, generateModuleContent } from "@/training/module-generator";
import { MAX_MODULE_INDEX } from "@/training/schemas";
import { SessionRepository, VersionConflictError } from "@/training/session-repository";
import { StateTransitionError, transitionModule } from "@/training/state-machine";
import type { ModuleContent } from "@/training/types";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helper — strip server-only fields from module content for client
// ---------------------------------------------------------------------------

function toClientContent(content: ModuleContent) {
  return {
    ...content,
    scenarios: content.scenarios.map(({ rubric: _rubric, ...s }) => ({
      ...s,
      options: s.options?.map(({ correct: _correct, ...o }) => o),
    })),
    quiz: {
      questions: content.quiz.questions.map(({ rubric: _rubric, ...q }) => ({
        ...q,
        options: q.options?.map(({ correct: _correct, ...o }) => o),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; moduleIndex: string }> },
) {
  const { tenant: tenantSlug, moduleIndex: moduleIndexStr } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  // 1. Auth check
  if (!tenantId || !employeeId || tenantId !== tenantSlug) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  // 2. Parse and validate moduleIndex
  const moduleIndex = Number(moduleIndexStr);
  if (Number.isNaN(moduleIndex) || moduleIndex < 0 || moduleIndex > MAX_MODULE_INDEX) {
    return NextResponse.json(
      { error: "invalid_request", message: "Invalid module index" },
      { status: 400 },
    );
  }

  // Initialise repositories
  const adapter = new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
  const sessionRepo = new SessionRepository(adapter);
  const profileRepo = new ProfileRepository(adapter);

  await adapter.initialize();

  let activeSessionId: string | undefined;

  try {
    // 3. Find active session
    const session = await sessionRepo.findActiveSession(tenantId, employeeId);
    if (session) activeSessionId = session.id;
    if (!session) {
      return NextResponse.json(
        { error: "not_found", message: "No active training session found" },
        { status: 404 },
      );
    }

    // 4. Find the module
    const module = await sessionRepo.findModule(tenantId, session.id, moduleIndex);
    if (!module) {
      return NextResponse.json(
        { error: "not_found", message: "Module not found" },
        { status: 404 },
      );
    }

    // 5. Idempotent: return existing content if already generated
    if (module.content !== null) {
      return NextResponse.json(toClientContent(module.content), { status: 200 });
    }

    // 6. Guard: module must be in `locked` status
    if (module.status !== "locked") {
      return NextResponse.json(
        {
          error: "conflict",
          message: `Module is in '${module.status}' state, expected 'locked'`,
        },
        { status: 409 },
      );
    }

    // Guard: previous module must be `scored` (for index > 0)
    if (moduleIndex > 0) {
      const previousModule = await sessionRepo.findModule(tenantId, session.id, moduleIndex - 1);
      if (!previousModule || previousModule.status !== "scored") {
        return NextResponse.json(
          {
            error: "conflict",
            message: "Previous module must be scored before generating content",
          },
          { status: 409 },
        );
      }
    }

    // 7. Transition module to `content-generating`
    const generatingStatus = transitionModule(module.status, "generate-content");
    await sessionRepo.updateModule(
      tenantId,
      module.id,
      { status: generatingStatus },
      module.version,
    );

    // 8. Find confirmed role profile
    const roleProfile = await profileRepo.findByEmployee(tenantId, employeeId);
    if (!roleProfile) {
      return NextResponse.json(
        { error: "not_found", message: "Role profile not found" },
        { status: 404 },
      );
    }

    // 9. Resolve AI model from tenant config
    const snapshot = getSnapshot();
    const tenant = snapshot?.tenants.get(tenantSlug);
    if (!tenant) {
      return NextResponse.json(
        { error: "not_found", message: "Tenant not found" },
        { status: 404 },
      );
    }
    const model = resolveModel(tenant);

    // 10. Generate module content
    const moduleOutline = {
      title: module.title,
      topicArea: module.topicArea,
      jobExpectationIndices: module.jobExpectationIndices,
    };
    const content = await generateModuleContent(moduleOutline, roleProfile, model);

    // 11. Update module: set content, transition to `learning`
    const learningStatus = transitionModule(generatingStatus, "content-ready");
    // Re-fetch module to get updated version after first update
    const updatedModule = await sessionRepo.findModule(tenantId, session.id, moduleIndex);
    if (!updatedModule) {
      return NextResponse.json(
        { error: "not_found", message: "Module not found after update" },
        { status: 404 },
      );
    }
    await sessionRepo.updateModule(
      tenantId,
      module.id,
      { content, status: learningStatus },
      updatedModule.version,
    );

    // 12. Return 200 with client-safe content
    return NextResponse.json(toClientContent(content), { status: 200 });
  } catch (error) {
    if (error instanceof ModuleGenerationError) {
      // Roll back module status to `locked` so future retries are not blocked.
      try {
        const stuckModule = activeSessionId
          ? await sessionRepo.findModule(tenantId, activeSessionId, moduleIndex)
          : null;
        if (stuckModule && stuckModule.status === "content-generating") {
          await sessionRepo.updateModule(
            tenantId,
            stuckModule.id,
            { status: "locked" },
            stuckModule.version,
          );
        }
      } catch {
        // Best-effort rollback — ignore secondary errors
      }
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
    if (error instanceof VersionConflictError) {
      return NextResponse.json(
        { error: "conflict", message: "Resource was modified by another request" },
        { status: 409 },
      );
    }
    if (error instanceof StateTransitionError) {
      return NextResponse.json({ error: "conflict", message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
