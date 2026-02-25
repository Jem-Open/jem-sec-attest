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
 * Global E2E setup: authenticates as alice@acme.com via the local Dex IDP
 * and saves the browser storage state to tests/e2e/.auth/user.json.
 *
 * This file is run once before the entire test suite (playwright.config.ts globalSetup).
 * Subsequent tests load the saved state via the authenticated fixture in fixtures/auth.ts.
 *
 * Prerequisites:
 *   - Docker stack must be running: pnpm docker:up
 *   - /etc/hosts must contain: 127.0.0.1 dex
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(__dirname, ".auth");
const AUTH_FILE = path.resolve(AUTH_DIR, "user.json");

const BASE_URL = "http://localhost:3000";
const TENANT_SLUG = "acme-corp";

export default async function globalSetup(): Promise<void> {
  // Ensure the .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const username = process.env.E2E_USERNAME ?? "alice@acme.com";
  const password = process.env.E2E_PASSWORD ?? "Acme1234!";

  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the tenant sign-in endpoint — triggers OIDC redirect to Dex
    await page.goto(`${BASE_URL}/api/auth/${TENANT_SLUG}/signin`);

    // Wait for the Dex login page (browser is redirected to http://dex:5556/dex/auth?...)
    await page.waitForURL(/dex:5556/, { timeout: 15_000 });

    // Dex local connector login form
    await page.fill("input[name=login]", username);
    await page.fill("input[name=password]", password);
    await page.click("button[type=submit]");

    // Wait for redirect back to the application.
    // In Docker, request.url may use 0.0.0.0:3000 instead of localhost:3000.
    await page.waitForURL(/:(3000|3001|3002)\//, { timeout: 15_000 });

    // Save the authenticated session state
    await context.storageState({ path: AUTH_FILE });

    console.log(`[auth.setup] Session saved to ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}
