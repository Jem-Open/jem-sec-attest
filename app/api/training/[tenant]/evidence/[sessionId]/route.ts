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
 * Evidence retrieval API route.
 * GET /api/training/{tenant}/evidence/{sessionId}
 * Returns the training evidence record for a given session.
 */

import { ComplianceUploadRepository } from "@/compliance/upload-repository";
import { getSnapshot } from "@/config/index";
import { EvidenceRepository } from "@/evidence/evidence-repository";
import { getStorage } from "@/storage/factory";
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

  const storage = await getStorage();
  const evidenceRepo = new EvidenceRepository(storage);

  const evidence = await evidenceRepo.findBySessionId(tenantId, sessionId);

  if (!evidence) {
    return NextResponse.json(
      { error: "not_found", message: "No evidence found for this session" },
      { status: 404 },
    );
  }

  // Role-based access: employees can only see their own evidence
  if (role === "employee" && evidence.employeeId !== employeeId) {
    return NextResponse.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
  }

  // Look up compliance upload status if tenant has compliance enabled
  const snapshot = getSnapshot();
  const tenant = snapshot?.tenants.get(tenantId);
  const complianceProvider = tenant?.settings?.integrations?.compliance?.provider;
  let complianceUpload = null;

  if (complianceProvider) {
    const uploadRepo = new ComplianceUploadRepository(storage);
    const upload = await uploadRepo.findByEvidenceId(tenantId, evidence.id, complianceProvider);
    if (upload) {
      complianceUpload = {
        id: upload.id,
        provider: upload.provider,
        status: upload.status,
        attemptCount: upload.attemptCount,
        maxAttempts: upload.maxAttempts,
        providerReferenceId: upload.providerReferenceId,
        lastError: upload.lastError,
        lastErrorCode: upload.lastErrorCode,
        retryable: upload.retryable,
        createdAt: upload.createdAt,
        updatedAt: upload.updatedAt,
        completedAt: upload.completedAt,
      };
    }
  }

  return NextResponse.json({ ...evidence, complianceUpload }, { status: 200 });
}
