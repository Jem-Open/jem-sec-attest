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
 * PDF evidence export API route.
 * GET /api/training/{tenant}/evidence/{sessionId}/pdf
 * Generates and returns a PDF document from the training evidence record.
 */

import { getSnapshot } from "@/config/index";
import { EvidenceRepository } from "@/evidence/evidence-repository";
import { renderEvidencePdf } from "@/evidence/pdf-renderer";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { NextResponse } from "next/server";

export async function GET(
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

  const role = request.headers.get("x-employee-role") ?? "employee";

  const storage = new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
  const evidenceRepo = new EvidenceRepository(storage);

  await storage.initialize();

  try {
    const evidence = await evidenceRepo.findBySessionId(tenantId, sessionId);

    if (!evidence) {
      return NextResponse.json(
        { error: "not_found", message: "No evidence found for this session" },
        { status: 404 },
      );
    }

    // Validate terminal state (FR-002)
    const terminalStates = new Set(["passed", "exhausted", "abandoned"]);
    if (!terminalStates.has(evidence.evidence.session.status)) {
      return NextResponse.json(
        { error: "conflict", message: "Evidence can only be exported for completed sessions" },
        { status: 409 },
      );
    }

    // Role-based access: employees can only see their own evidence
    if (role === "employee" && evidence.employeeId !== employeeId) {
      return NextResponse.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    }

    // Resolve tenant display name from config
    const snapshot = getSnapshot();
    const tenant = snapshot?.tenants.get(tenantId);
    const tenantDisplayName = tenant?.settings.branding?.displayName ?? tenant?.name ?? tenantId;

    // Generate PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderEvidencePdf(evidence, tenantDisplayName);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown PDF generation error";
      return NextResponse.json({ error: "pdf_generation_failed", message }, { status: 500 });
    }

    const filename = `evidence-${tenantId}-${evidence.employeeId}-${sessionId}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } finally {
    await storage.close();
  }
}
