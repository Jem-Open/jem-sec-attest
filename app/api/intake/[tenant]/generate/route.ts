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
 * Generate role profile API route.
 * POST /api/intake/{tenant}/generate
 * Accepts job description text, processes via AI, returns structured extraction.
 * Raw job text is NEVER persisted to database, logs, or session.
 */

import { getSnapshot } from "@/config/index";
import { resolveModel } from "@/intake/ai-model-resolver";
import { ProfileGenerationError, generateRoleProfile } from "@/intake/profile-generator";
import { sanitizeJobText } from "@/intake/sanitizer";
import { IntakeSubmissionSchema } from "@/intake/schemas";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  if (!tenantId || !employeeId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = IntakeSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Job text must be between 50 and 10,000 characters" },
      { status: 400 },
    );
  }

  // Sanitize job text — MUST NOT log or persist the raw text
  const sanitized = sanitizeJobText(parsed.data.jobText);

  // Resolve AI model from tenant config
  const snapshot = getSnapshot();
  const tenant = snapshot?.tenants.get(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: "not_found", message: "Tenant not found" }, { status: 404 });
  }
  const model = resolveModel(tenant);

  // Generate role profile via AI
  try {
    const extraction = await generateRoleProfile(sanitized, model);

    if (!extraction.jobExpectations || extraction.jobExpectations.length === 0) {
      return NextResponse.json(
        { error: "extraction_failed", message: "Could not extract meaningful job expectations" },
        { status: 422 },
      );
    }

    return NextResponse.json(extraction);
  } catch (error) {
    if (error instanceof ProfileGenerationError) {
      if (error.code === "extraction_failed") {
        return NextResponse.json(
          { error: "extraction_failed", message: error.message },
          { status: 422 },
        );
      }
      return NextResponse.json(
        { error: "ai_unavailable", message: "AI service temporarily unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
