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
 * Scenario submission API route.
 * POST /api/training/{tenant}/module/{moduleIndex}/scenario
 * Accepts a scenario response, scores it, and updates the training module.
 */

import { ensureConfigLoaded } from "@/config/index";
import { SecretRedactor } from "@/guardrails/secret-redactor";
import { resolveModel } from "@/intake/ai-model-resolver";
import { getStorage } from "@/storage/factory";
import { EvaluationError, evaluateFreeText } from "@/training/evaluator";
import { MAX_MODULE_INDEX, ScenarioSubmissionSchema } from "@/training/schemas";
import type { ModuleStatus } from "@/training/schemas";
import { scoreMcAnswer } from "@/training/score-calculator";
import { SessionRepository, VersionConflictError } from "@/training/session-repository";
import { transitionModule } from "@/training/state-machine";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; moduleIndex: string }> },
) {
  const { tenant, moduleIndex: moduleIndexStr } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  // 1. Auth check
  if (!tenantId || !employeeId || tenantId !== tenant) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  // 2. Parse and validate moduleIndex (0-19)
  const moduleIndex = Number.parseInt(moduleIndexStr, 10);
  if (Number.isNaN(moduleIndex) || moduleIndex < 0 || moduleIndex > MAX_MODULE_INDEX) {
    return NextResponse.json(
      { error: "validation_error", message: "moduleIndex must be an integer between 0 and 19" },
      { status: 400 },
    );
  }

  // 3. Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = ScenarioSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Invalid scenario submission data" },
      { status: 400 },
    );
  }

  const submission = parsed.data;

  // Initialise repositories
  const storage = await getStorage();
  const sessionRepo = new SessionRepository(storage);

  // 4. Find active session
  const session = await sessionRepo.findActiveSession(tenantId, employeeId);
  if (!session) {
    return NextResponse.json(
      { error: "not_found", message: "No active training session found" },
      { status: 404 },
    );
  }

  // Find the module
  const mod = await sessionRepo.findModule(tenantId, session.id, moduleIndex);
  if (!mod) {
    return NextResponse.json({ error: "not_found", message: "Module not found" }, { status: 404 });
  }

  // 5. Guard: module must be in `learning` or `scenario-active` state
  if (mod.status !== "learning" && mod.status !== "scenario-active") {
    return NextResponse.json(
      {
        error: "conflict",
        message: `Module is in '${mod.status}' state; expected 'learning' or 'scenario-active'`,
      },
      { status: 409 },
    );
  }

  // 6. Find the scenario in module.content.scenarios by scenarioId
  if (!mod.content) {
    return NextResponse.json(
      { error: "not_found", message: "Module content not available" },
      { status: 404 },
    );
  }

  const scenario = mod.content.scenarios.find((s) => s.id === submission.scenarioId);
  if (!scenario) {
    return NextResponse.json(
      { error: "not_found", message: `Scenario '${submission.scenarioId}' not found in module` },
      { status: 404 },
    );
  }

  // 7. Guard: scenario must not already be answered
  const alreadyAnswered = mod.scenarioResponses.some((r) => r.scenarioId === submission.scenarioId);
  if (alreadyAnswered) {
    return NextResponse.json(
      {
        error: "conflict",
        message: `Scenario '${submission.scenarioId}' has already been answered`,
      },
      { status: 409 },
    );
  }

  // 8. Score the response
  // Load config once (used for AI model resolution + retention check)
  const snapshot = await ensureConfigLoaded();
  if (!snapshot)
    return NextResponse.json(
      { error: "config_error", message: "Configuration not available" },
      { status: 503 },
    );
  const tenantConfig = snapshot.tenants.get(tenantId);

  let score: number;
  let llmRationale: string | undefined;

  try {
    if (submission.responseType === "multiple-choice") {
      const correctOption = scenario.options?.find((o) => o.correct)?.key;
      if (!correctOption) {
        return NextResponse.json(
          { error: "internal_error", message: "Scenario has no correct option defined" },
          { status: 500 },
        );
      }
      score = scoreMcAnswer(submission.selectedOption ?? "", correctOption);
    } else {
      // free-text
      if (!tenantConfig) {
        return NextResponse.json(
          { error: "not_found", message: "Tenant configuration not found" },
          { status: 404 },
        );
      }
      const model = resolveModel(tenantConfig);
      const evaluation = await evaluateFreeText(
        scenario.narrative,
        scenario.rubric ?? "",
        submission.freeTextResponse ?? "",
        model,
      );
      score = evaluation.score;
      llmRationale = evaluation.rationale;
    }
  } catch (error) {
    if (error instanceof EvaluationError) {
      return NextResponse.json(
        { error: "ai_unavailable", message: "AI evaluation service temporarily unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred during scoring" },
      { status: 500 },
    );
  }

  // 9. Redact secrets from free-text content before storage (FR-001, FR-002)
  const redactor = new SecretRedactor();
  const redactedFreeText =
    submission.freeTextResponse !== undefined
      ? redactor.redact(submission.freeTextResponse).text
      : undefined;
  const redactedRationale =
    llmRationale !== undefined ? redactor.redact(llmRationale).text : undefined;

  // 10. Check transcript retention: if disabled, omit free-text fields
  const transcriptsEnabled =
    (tenantConfig?.settings?.retention as Record<string, unknown> | undefined)?.transcripts !==
    undefined
      ? (
          (tenantConfig?.settings?.retention as Record<string, unknown>).transcripts as {
            enabled?: boolean;
          }
        )?.enabled !== false
      : true;

  // Build ScenarioResponse record
  const now = new Date().toISOString();
  const scenarioResponse = {
    scenarioId: submission.scenarioId,
    responseType: submission.responseType,
    ...(submission.selectedOption !== undefined
      ? { selectedOption: submission.selectedOption }
      : {}),
    ...(redactedFreeText !== undefined && transcriptsEnabled
      ? { freeTextResponse: redactedFreeText }
      : {}),
    score,
    ...(redactedRationale !== undefined && transcriptsEnabled
      ? { llmRationale: redactedRationale }
      : {}),
    submittedAt: now,
  };

  // 11. Determine next status (transition to scenario-active if currently in learning)
  let nextStatus: ModuleStatus = mod.status;
  if (mod.status === "learning") {
    nextStatus = transitionModule(mod.status, "start-scenario");
  }

  // 12. Append response
  const updatedResponses = [...mod.scenarioResponses, scenarioResponse];

  // 13. Determine if all scenarios answered → transition to quiz-active
  const allScenariosAnswered = updatedResponses.length >= mod.content.scenarios.length;
  if (allScenariosAnswered) {
    nextStatus = transitionModule("scenario-active", "scenarios-complete");
  }

  // 14. Update module via sessionRepo.updateModule
  try {
    await sessionRepo.updateModule(
      tenantId,
      mod.id,
      {
        status: nextStatus,
        scenarioResponses: updatedResponses,
      },
      mod.version,
    );
  } catch (updateError) {
    if (updateError instanceof VersionConflictError) {
      return NextResponse.json(
        { error: "conflict", message: "Resource was modified by another request" },
        { status: 409 },
      );
    }
    throw updateError;
  }

  // 15. Return 200 with result
  return NextResponse.json({
    scenarioId: submission.scenarioId,
    score,
    ...(llmRationale !== undefined ? { rationale: llmRationale } : {}),
  });
}
