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
 * Get role profile API route.
 * GET /api/intake/{tenant}/profile
 * Returns the authenticated employee's confirmed role profile.
 */

import { ProfileRepository } from "@/intake/profile-repository";
import { SQLiteAdapter } from "@/storage/sqlite-adapter";
import { NextResponse } from "next/server";

const storage = new SQLiteAdapter({ dbPath: process.env.DB_PATH ?? "data/jem.db" });
const profileRepo = new ProfileRepository(storage);

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  await params;
  const tenantId = request.headers.get("x-tenant-id");
  const employeeId = request.headers.get("x-employee-id");

  if (!tenantId || !employeeId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Not authenticated" },
      { status: 401 },
    );
  }

  await storage.initialize();

  const profile = await profileRepo.findByEmployee(tenantId, employeeId);

  if (!profile) {
    return NextResponse.json(
      { error: "not_found", message: "No confirmed profile exists" },
      { status: 404 },
    );
  }

  return NextResponse.json(profile);
}
