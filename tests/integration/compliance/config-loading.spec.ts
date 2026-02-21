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

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigFromFiles } from "../../../src/config/index.js";

const COMPLIANCE_FIXTURES = join(import.meta.dirname, "../../fixtures/compliance");

describe("Config loading with compliance integration", () => {
  it("loads tenant with valid compliance config", async () => {
    const snapshot = await loadConfigFromFiles(COMPLIANCE_FIXTURES, {
      env: { TEST_SPRINTO_API_KEY: "test-key-123" },
    });

    const tenant = snapshot.tenants.get("sprinto-enabled");
    expect(tenant).toBeDefined();
    expect(tenant?.settings?.integrations?.compliance).toBeDefined();

    const compliance = tenant?.settings?.integrations?.compliance;
    expect(compliance?.provider).toBe("sprinto");
    expect(compliance?.workflowCheckId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(compliance?.region).toBe("us");
    expect(compliance?.retry.maxAttempts).toBe(5);
  });

  it("loads tenant without compliance config — compliance is undefined", async () => {
    const snapshot = await loadConfigFromFiles(COMPLIANCE_FIXTURES, {
      env: { TEST_SPRINTO_API_KEY: "test-key-123" },
    });

    const tenant = snapshot.tenants.get("no-compliance");
    expect(tenant).toBeDefined();
    expect(tenant?.settings?.integrations?.compliance).toBeUndefined();
  });

  it("resolves apiKeyRef via env var substitution in loadConfigFromFiles", async () => {
    const snapshot = await loadConfigFromFiles(COMPLIANCE_FIXTURES, {
      env: { TEST_SPRINTO_API_KEY: "resolved-secret-value" },
    });

    const tenant = snapshot.tenants.get("sprinto-enabled");
    const compliance = tenant?.settings?.integrations?.compliance;
    // loadConfigFromFiles substitutes ${VAR} in raw YAML before parsing
    expect(compliance?.apiKeyRef).toBe("resolved-secret-value");
  });
});
