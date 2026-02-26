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
 * Authenticated test fixture.
 * Loads the stored OIDC session state from tests/e2e/.auth/user.json so that
 * each test starts with alice@acme.com already authenticated.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/auth";
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.resolve(__dirname, "../.auth/user.json");

export const test = base.extend({
  // Override the storageState option so every test using this fixture
  // starts with the pre-authenticated session.
  storageState: AUTH_FILE,
});

export { expect } from "@playwright/test";
