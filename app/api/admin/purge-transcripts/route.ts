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
 * Transcript purge admin endpoint.
 * POST /api/admin/purge-transcripts
 * FR-012: Automatic purge of expired transcripts.
 * Secured via PURGE_SECRET env var for cron/internal use.
 */

import { TranscriptPurger } from "@/retention/transcript-purger";
import { getStorage } from "@/storage/factory";
import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const purgeSecret = process.env.PURGE_SECRET;

  if (!purgeSecret || authHeader !== `Bearer ${purgeSecret}`) {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid or missing authorization" },
      { status: 401 },
    );
  }

  const storage = await getStorage();
  const purger = new TranscriptPurger(storage);
  const results = await purger.purgeAll();

  return NextResponse.json({ results });
}
