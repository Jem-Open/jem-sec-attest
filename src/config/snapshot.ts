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
 * Edge-safe config snapshot accessor.
 * Contains NO Node.js built-in imports so it can be bundled for the Edge Runtime.
 * The snapshot is populated by loadConfig() / loadConfigFromFiles() in index.ts,
 * which run in the Node.js Runtime (API routes, server components).
 *
 * middleware.ts imports from this file directly to avoid pulling node:fs/promises
 * into the Edge Runtime bundle.
 */

import type { ConfigSnapshot } from "../tenant/types";

let currentSnapshot: ConfigSnapshot | null = null;

/**
 * Get the current loaded config snapshot.
 * Returns null if config has not been loaded yet.
 */
export function getSnapshot(): ConfigSnapshot | null {
  return currentSnapshot;
}

/**
 * Set the config snapshot. Called by loadConfig() / loadConfigFromFiles() after
 * successfully loading and validating tenant configuration.
 * @internal — do not call outside of src/config/index.ts
 */
export function setSnapshot(snapshot: ConfigSnapshot): void {
  currentSnapshot = snapshot;
}
