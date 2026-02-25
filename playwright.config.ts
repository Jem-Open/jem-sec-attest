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
 * Playwright configuration for E2E tests.
 * Prerequisites: infrastructure services must be running (pnpm docker:up)
 * and the app must be running locally (pnpm dev).
 * See specs/011-docker-e2e-testing/quickstart.md for setup instructions.
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",

  // Run tests sequentially — OIDC sessions are stateful
  fullyParallel: false,

  // No retries for local dev; set to 2 in CI
  retries: 0,

  // Single worker to avoid session conflicts
  workers: 1,

  reporter: "html",

  // Global setup: authenticates once and saves storageState before any test runs
  globalSetup: "./tests/e2e/auth.setup.ts",

  use: {
    baseURL: "http://localhost:3000",

    // Capture screenshot on test failure only
    screenshot: "only-on-failure",

    // Record trace on first retry (useful when retries > 0 in CI)
    trace: "on-first-retry",

    // Retain video only for failed tests
    video: "retain-on-failure",
  },

  outputDir: "test-results",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
