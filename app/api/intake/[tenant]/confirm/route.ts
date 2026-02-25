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
 * Confirm role profile API route.
 * POST /api/intake/{tenant}/confirm
 * Persists the confirmed (potentially edited) role profile.
 * Returns 201 for new profiles, 200 for updates.
 */

import { ensureConfigLoaded } from "@/config/index";
import { logProfileConfirmed, logProfileUpdated } from "@/intake/audit";
import { ProfileRepository } from "@/intake/profile-repository";
import { ProfileConfirmationSchema } from "@/intake/schemas";
import { getStorage } from "@/storage/factory";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  if (!tenantId || !employeeId || tenantId !== tenant) {
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

  const parsed = ProfileConfirmationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: "Invalid profile confirmation data" },
      { status: 400 },
    );
  }

  if (parsed.data.jobExpectations.length === 0) {
    return NextResponse.json(
      { error: "validation_error", message: "At least one job expectation is required" },
      { status: 400 },
    );
  }

  const storage = await getStorage();
  const profileRepo = new ProfileRepository(storage);

  // Get config hash for evidence stamping
  const snapshot = await ensureConfigLoaded();
  if (!snapshot?.configHash) {
    return NextResponse.json(
      { error: "internal_error", message: "Configuration not available" },
      { status: 503 },
    );
  }
  const configHash = snapshot.configHash;
  const appVersion = process.env.APP_VERSION ?? "0.1.0";

  // Check if this is a new profile or an update, then persist + audit atomically
  const existingProfile = await profileRepo.findByEmployee(tenantId, employeeId);

  const profile = await storage.transaction(tenantId, async () => {
    const saved = await profileRepo.confirmProfile(
      tenantId,
      employeeId,
      parsed.data,
      configHash,
      appVersion,
    );

    // Audit logging inside the same transaction for atomicity
    if (existingProfile) {
      await logProfileUpdated(
        storage,
        tenantId,
        employeeId,
        saved.id,
        existingProfile.version,
        saved.version,
      );
    } else {
      await logProfileConfirmed(
        storage,
        tenantId,
        employeeId,
        saved.id,
        saved.version,
        saved.jobExpectations.length,
      );
    }

    return saved;
  });

  return NextResponse.json(profile, { status: existingProfile ? 200 : 201 });
}
