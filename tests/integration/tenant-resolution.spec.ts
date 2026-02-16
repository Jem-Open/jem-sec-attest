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
import { loadConfigFromFiles } from "../../src/config/index.js";
import { createResolver } from "../../src/tenant/resolver.js";

const VALID_FIXTURES = join(import.meta.dirname, "../fixtures/valid");

describe("Tenant resolution (integration)", () => {
  it("resolves tenant by hostname end-to-end", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const resolver = createResolver(snapshot);

    const result = resolver.resolve({ hostname: "a.example.com" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("tenant-a");
    expect(result?.name).toBe("Tenant A");
  });

  it("resolves tenant by email domain end-to-end", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const resolver = createResolver(snapshot);

    const result = resolver.resolve({ emailDomain: "tenant-b.com" });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("tenant-b");
    expect(result?.name).toBe("Tenant B");
  });

  it("hostname takes precedence over email domain", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const resolver = createResolver(snapshot);

    const result = resolver.resolve({
      hostname: "a.example.com",
      emailDomain: "tenant-b.com",
    });
    expect(result).not.toBeNull();
    expect(result?.id).toBe("tenant-a");
  });

  it("returns null for unknown hostname", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const resolver = createResolver(snapshot);

    const result = resolver.resolve({ hostname: "unknown.example.com" });
    expect(result).toBeNull();
  });

  it("resolved tenant has merged settings from defaults", async () => {
    const snapshot = await loadConfigFromFiles(VALID_FIXTURES);
    const resolver = createResolver(snapshot);

    const tenant = resolver.resolve({ hostname: "a.example.com" });
    expect(tenant).not.toBeNull();
    expect(tenant?.settings.branding?.displayName).toBe("Tenant A Portal");
    expect(tenant?.settings.branding?.primaryColor).toBe("#000000"); // from defaults
    expect(tenant?.settings.retention?.days).toBe(90); // from defaults
  });
});
