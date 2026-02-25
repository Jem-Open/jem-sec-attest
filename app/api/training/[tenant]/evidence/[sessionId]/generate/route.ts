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
 * Manual evidence generation API route.
 * POST /api/training/{tenant}/evidence/{sessionId}/generate
 * Generates (or returns existing) evidence for a terminal training session.
 */

import { ensureConfigLoaded } from "@/config/index";
import { generateEvidenceForSession } from "@/evidence/evidence-generator";
import { EvidenceRepository } from "@/evidence/evidence-repository";
import { getStorage } from "@/storage/factory";
import { NextResponse } from "next/server";

const TERMINAL_STATUSES = new Set(["passed", "exhausted", "abandoned"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenant: string; sessionId: string }> },
) {
  const { tenant: tenantSlug, sessionId } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  if (!tenantId || !employeeId || tenantId !== tenantSlug) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  // Safety net: validate tenant exists in config even when middleware bypassed hostname
  // check (Edge Runtime / snapshot not yet loaded). Ensures tenant isolation regardless
  // of middleware state.
  const snapshot = await ensureConfigLoaded();
  if (!snapshot?.tenants.get(tenantSlug)) {
    return NextResponse.json({ error: "not_found", message: "Tenant not found" }, { status: 404 });
  }

  const role = request.headers.get("x-employee-role") ?? "employee";
  if (role === "employee") {
    return NextResponse.json(
      { error: "forbidden", message: "Admin access required" },
      { status: 403 },
    );
  }

  const storage = await getStorage();

  // Check session exists and is in terminal state
  const session = await storage.findById(tenantId, "training_sessions", sessionId);
  if (!session) {
    return NextResponse.json({ error: "not_found", message: "Session not found" }, { status: 404 });
  }
  if (!TERMINAL_STATUSES.has((session as Record<string, unknown>).status as string)) {
    return NextResponse.json(
      { error: "conflict", message: "Session is not in a terminal state" },
      { status: 409 },
    );
  }

  // Check if evidence already exists (idempotent)
  const evidenceRepo = new EvidenceRepository(storage);
  const existing = await evidenceRepo.findBySessionId(tenantId, sessionId);
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  // Generate evidence (awaited, not fire-and-forget — manages its own storage connection)
  const evidence = await generateEvidenceForSession(tenantId, sessionId);
  return NextResponse.json(evidence, { status: 201 });
}
