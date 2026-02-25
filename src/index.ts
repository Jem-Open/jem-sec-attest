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
 * Application entry point.
 * Loads dotenv, config, creates resolver, logs config hash.
 */

import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadConfigFromFiles } from "./config/index";
import { createResolver } from "./tenant/resolver";

async function main(): Promise<void> {
  loadDotenv();

  const configDir = process.env.CONFIG_DIR ?? join(process.cwd(), "config");

  try {
    const snapshot = await loadConfigFromFiles(configDir);

    console.log(`[config] Loaded defaults from ${configDir}/defaults.yaml`);
    for (const [id] of snapshot.tenants) {
      console.log(`[config] Loaded tenant: ${id}`);
    }
    console.log(`[config] All ${snapshot.tenants.size} tenant configs validated successfully`);
    console.log(`[config] Config hash: ${snapshot.configHash} (SHA-256)`);

    const _resolver = createResolver(snapshot);
    console.log("[config] Tenant resolution ready");

    // Export for use by HTTP middleware or other entry points
    return;
  } catch (error) {
    console.error("ERROR: Config startup failed");
    console.error((error as Error).message);
    process.exit(1);
  }
}

main();
