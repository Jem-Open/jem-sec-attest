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
 * List evidence API route.
 * GET /api/training/{tenant}/evidence
 * Returns paginated evidence summaries for admin/compliance users.
 */

import { ComplianceUploadRepository } from "@/compliance/upload-repository";
import { getSnapshot } from "@/config/index";
import { EvidenceRepository } from "@/evidence/evidence-repository";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { NextResponse } from "next/server";

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

  const role = request.headers.get("x-employee-role") ?? "employee";
  if (role === "employee") {
    return NextResponse.json(
      { error: "forbidden", message: "Admin access required" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const filterEmployeeId = url.searchParams.get("employeeId") ?? undefined;
  const outcome = url.searchParams.get("outcome") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 100);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  const storage = new SQLiteAdapter({
    dbPath: process.env.DB_PATH ?? "data/jem.db",
  });
  const evidenceRepo = new EvidenceRepository(storage);
  await storage.initialize();

  try {
    const { items, total } = await evidenceRepo.listByTenant(tenantId, {
      employeeId: filterEmployeeId,
      outcome,
      from,
      to,
      limit,
      offset,
    });

    // Check if tenant has compliance integration enabled
    const snapshot = getSnapshot();
    const tenant = snapshot?.tenants.get(tenantId);
    const hasCompliance = !!tenant?.settings?.integrations?.compliance;

    // Look up compliance upload status for each evidence item (only if compliance enabled)
    const uploadRepo = hasCompliance ? new ComplianceUploadRepository(storage) : null;

    const summaries = await Promise.all(
      items.map(async (item) => {
        const base = {
          id: item.id,
          sessionId: item.sessionId,
          employeeId: item.employeeId,
          schemaVersion: item.schemaVersion,
          contentHash: item.contentHash,
          generatedAt: item.generatedAt,
          outcome: {
            status: item.evidence.session.status,
            aggregateScore: item.evidence.outcome.aggregateScore,
            passed: item.evidence.outcome.passed,
          },
          complianceUpload: null as {
            provider: string;
            status: string;
            attemptCount: number;
            lastError: string | null;
            completedAt: string | null;
          } | null,
        };

        if (uploadRepo) {
          const provider = tenant?.settings?.integrations?.compliance?.provider;
          if (provider) {
            const upload = await uploadRepo.findByEvidenceId(tenantId, item.id, provider);
            if (upload) {
              base.complianceUpload = {
                provider: upload.provider,
                status: upload.status,
                attemptCount: upload.attemptCount,
                lastError: upload.lastError,
                completedAt: upload.completedAt,
              };
            }
          }
        }

        return base;
      }),
    );

    return NextResponse.json({ items: summaries, total, limit, offset }, { status: 200 });
  } finally {
    await storage.close();
  }
}
