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
 * Deterministic config hashing using SHA-256.
 * Uses safe-stable-stringify for deterministic key ordering.
 */

import { createHash } from "node:crypto";
import stringify from "safe-stable-stringify";
import type { Tenant } from "../tenant/types";

/**
 * Compute a deterministic SHA-256 hash of the full tenant configuration.
 * The hash input is never logged (security requirement).
 */
export function computeConfigHash(tenants: readonly Tenant[]): string {
  const serialized = stringify(tenants);
  if (serialized === undefined) {
    throw new Error("Failed to serialize tenant configuration for hashing");
  }
  return createHash("sha256").update(serialized).digest("hex");
}
