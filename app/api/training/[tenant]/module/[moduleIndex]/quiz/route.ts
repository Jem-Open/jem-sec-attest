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
 * Quiz submission API route.
 * POST /api/training/{tenant}/module/{moduleIndex}/quiz
 * Accepts all quiz answers, scores them, and finalises the training module.
 */

import { AuditLogger } from "@/audit/audit-logger";
import { getSnapshot } from "@/config/index";
import { SecretRedactor } from "@/guardrails/secret-redactor";
import { resolveModel } from "@/intake/ai-model-resolver";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { logModuleCompleted, logQuizSubmitted } from "@/training/audit";
import { EvaluationError, evaluateFreeText } from "@/training/evaluator";
import { MAX_MODULE_INDEX, QuizSubmissionSchema } from "@/training/schemas";
import { computeModuleScore, scoreMcAnswer } from "@/training/score-calculator";
import { SessionRepository, VersionConflictError } from "@/training/session-repository";
import { transitionModule, transitionSession } from "@/training/state-machine";
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

  const parsed = QuizSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Invalid quiz submission data" },
      { status: 400 },
    );
  }

  const submission = parsed.data;

  // Initialise repositories
  const storage = new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
  const sessionRepo = new SessionRepository(storage);
  const auditLogger = new AuditLogger(storage);

  await storage.initialize();

  try {
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
      return NextResponse.json(
        { error: "not_found", message: "Module not found" },
        { status: 404 },
      );
    }

    // 5. Guard: module must be in `quiz-active` state
    if (mod.status !== "quiz-active") {
      return NextResponse.json(
        {
          error: "conflict",
          message: `Module is in '${mod.status}' state; expected 'quiz-active'`,
        },
        { status: 409 },
      );
    }

    if (!mod.content) {
      return NextResponse.json(
        { error: "not_found", message: "Module content not available" },
        { status: 404 },
      );
    }

    // 6. Validate all quiz questions are answered
    const expectedCount = mod.content.quiz.questions.length;
    if (submission.answers.length !== expectedCount) {
      return NextResponse.json(
        {
          error: "validation_error",
          message: `Expected ${expectedCount} answers but received ${submission.answers.length}`,
        },
        { status: 400 },
      );
    }

    // Resolve AI model upfront if any free-text answers exist
    const hasFreeText = submission.answers.some((a) => a.responseType === "free-text");
    let model: ReturnType<typeof resolveModel> | undefined;

    if (hasFreeText) {
      const snapshot = getSnapshot();
      const tenantConfig = snapshot?.tenants.get(tenantId);
      if (!tenantConfig) {
        return NextResponse.json(
          { error: "not_found", message: "Tenant configuration not found" },
          { status: 404 },
        );
      }
      model = resolveModel(tenantConfig);
    }

    // 7. Score each answer
    const now = new Date().toISOString();
    const quizAnswers: Array<{
      questionId: string;
      responseType: "multiple-choice" | "free-text";
      selectedOption?: string;
      freeTextResponse?: string;
      score: number;
      llmRationale?: string;
      submittedAt: string;
    }> = [];

    try {
      for (const answer of submission.answers) {
        const question = mod.content.quiz.questions.find((q) => q.id === answer.questionId);
        if (!question) {
          return NextResponse.json(
            { error: "validation_error", message: `Unknown question id '${answer.questionId}'` },
            { status: 400 },
          );
        }

        let score: number;
        let llmRationale: string | undefined;

        if (answer.responseType === "multiple-choice") {
          if (answer.selectedOption === undefined) {
            return NextResponse.json(
              {
                error: "validation_error",
                message: `selectedOption is required for multiple-choice question '${answer.questionId}'`,
              },
              { status: 400 },
            );
          }
          const correctOption = question.options?.find((o) => o.correct)?.key;
          if (!correctOption) {
            return NextResponse.json(
              {
                error: "internal_error",
                message: `Question '${answer.questionId}' has no correct option defined`,
              },
              { status: 500 },
            );
          }
          score = scoreMcAnswer(answer.selectedOption, correctOption);
        } else {
          // free-text — model is guaranteed to be set when hasFreeText is true
          const evaluation = await evaluateFreeText(
            question.text,
            question.rubric ?? "",
            answer.freeTextResponse ?? "",
            // biome-ignore lint/style/noNonNullAssertion: model is set whenever hasFreeText is true
            model!,
          );
          score = evaluation.score;
          llmRationale = evaluation.rationale;
        }

        quizAnswers.push({
          questionId: answer.questionId,
          responseType: answer.responseType,
          ...(answer.selectedOption !== undefined ? { selectedOption: answer.selectedOption } : {}),
          ...(answer.freeTextResponse !== undefined
            ? { freeTextResponse: answer.freeTextResponse }
            : {}),
          score,
          ...(llmRationale !== undefined ? { llmRationale } : {}),
          submittedAt: now,
        });
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
    const retentionSnapshot = getSnapshot();
    const tenantCfg = retentionSnapshot?.tenants.get(tenantId);
    const transcriptsEnabled =
      (tenantCfg?.settings?.retention as Record<string, unknown> | undefined)?.transcripts !==
      undefined
        ? (
            (tenantCfg?.settings?.retention as Record<string, unknown>).transcripts as {
              enabled?: boolean;
            }
          )?.enabled !== false
        : true;

    for (const answer of quizAnswers) {
      if (answer.freeTextResponse !== undefined) {
        answer.freeTextResponse = transcriptsEnabled
          ? redactor.redact(answer.freeTextResponse).text
          : undefined;
      }
      if (answer.llmRationale !== undefined) {
        answer.llmRationale = transcriptsEnabled
          ? redactor.redact(answer.llmRationale).text
          : undefined;
      }
    }

    // 10. Compute module score
    const scenarioScores = mod.scenarioResponses.map((r) => r.score);
    const quizScores = quizAnswers.map((a) => a.score);
    const moduleScore = computeModuleScore(scenarioScores, quizScores) ?? 0;

    // 11. Transition module to `scored`
    const nextModuleStatus = transitionModule(mod.status, "quiz-scored");

    // 12. Update module with quizAnswers and moduleScore
    try {
      await sessionRepo.updateModule(
        tenantId,
        mod.id,
        {
          status: nextModuleStatus,
          quizAnswers,
          moduleScore,
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

    // 13. Log audit events
    await logModuleCompleted(
      auditLogger,
      tenantId,
      employeeId,
      session.id,
      moduleIndex,
      mod.title,
      moduleScore,
    );

    const mcCount = quizAnswers.filter((a) => a.responseType === "multiple-choice").length;
    const freeTextCount = quizAnswers.filter((a) => a.responseType === "free-text").length;
    await logQuizSubmitted(
      auditLogger,
      tenantId,
      employeeId,
      session.id,
      moduleIndex,
      quizAnswers.length,
      mcCount,
      freeTextCount,
    );

    // 14. Check if this is the last module; if so, transition session to `evaluating`
    // Fetch the full module list once for the total count, then compute scoredCount
    // optimistically — previously-scored modules plus the one we just transitioned — to
    // avoid a second read that could race with the write we just committed.
    const allModules = await sessionRepo.findModulesBySession(tenantId, session.id);
    const totalModules = allModules.length;
    // Modules already in "scored" state before this request, plus 1 for the module just updated.
    const previouslyScoredCount = allModules.filter(
      (m) => m.id !== mod.id && m.status === "scored",
    ).length;
    const scoredCount = previouslyScoredCount + 1;

    if (scoredCount === totalModules) {
      const freshSession = await sessionRepo.findActiveSession(tenantId, employeeId);
      if (!freshSession || freshSession.id !== session.id) {
        return NextResponse.json(
          { error: "conflict", message: "Resource was modified by another request" },
          { status: 409 },
        );
      }
      const nextSessionStatus = transitionSession(freshSession.status, "all-modules-scored");
      try {
        await sessionRepo.updateSession(
          tenantId,
          freshSession.id,
          { status: nextSessionStatus },
          freshSession.version,
        );
      } catch (sessionUpdateError) {
        if (sessionUpdateError instanceof VersionConflictError) {
          return NextResponse.json(
            { error: "conflict", message: "Resource was modified by another request" },
            { status: 409 },
          );
        }
        throw sessionUpdateError;
      }
    }

    // 15. Return 200
    return NextResponse.json({
      moduleIndex,
      moduleScore,
      answers: quizAnswers.map((a) => ({
        questionId: a.questionId,
        score: a.score,
        ...(a.llmRationale !== undefined ? { rationale: a.llmRationale } : {}),
      })),
    });
  } finally {
    await storage.close();
  }
}
