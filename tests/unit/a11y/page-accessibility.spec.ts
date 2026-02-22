// Copyright 2026 Jem Open
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
 * Accessibility unit tests for page components
 * Uses source-code analysis to verify accessibility patterns
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readPage(relativePath: string): string {
  return readFileSync(resolve(__dirname, "../../../", relativePath), "utf-8");
}

describe("Accessibility: Layout", () => {
  const source = readPage("app/layout.tsx");

  it("includes a skip-nav link", () => {
    expect(source).toContain('href="#main-content"');
    expect(source).toContain("skip-nav");
  });

  it("imports skip-nav CSS", () => {
    expect(source).toContain("./skip-nav.css");
  });
});

describe("Accessibility: Sign-in page", () => {
  const source = readPage("app/[tenant]/auth/signin/page.tsx");

  it("has main landmark with id", () => {
    expect(source).toContain('id="main-content"');
    expect(source).toMatch(/<main/);
  });

  it("has h1 heading", () => {
    expect(source).toMatch(/<h1/);
  });

  it("has descriptive aria-label on SSO link", () => {
    expect(source).toContain("aria-label");
    expect(source).toContain("signInWithSSO");
  });
});

describe("Accessibility: Dashboard page", () => {
  const source = readPage("app/[tenant]/dashboard/page.tsx");

  it("has main landmark with id", () => {
    expect(source).toContain('id="main-content"');
    expect(source).toMatch(/<main/);
  });

  it("has h1 heading", () => {
    expect(source).toMatch(/<h1/);
  });

  it("has labeled navigation", () => {
    expect(source).toContain('aria-label="Training actions"');
  });
});

describe("Accessibility: Training page", () => {
  const source = readPage("app/[tenant]/training/page.tsx");

  it("has main landmark with id", () => {
    expect(source).toContain('id="main-content"');
    expect(source).toMatch(/<main/);
  });

  it("has aria-live regions for dynamic content", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-live="assertive"');
  });

  it("has progressbar role", () => {
    expect(source).toContain('role="progressbar"');
  });

  it("uses fieldset and legend for form groups", () => {
    expect(source).toMatch(/<fieldset/);
    expect(source).toMatch(/<legend/);
  });

  it("has focus management ref", () => {
    expect(source).toContain("firstFocusRef");
  });

  it("has non-color indicators for pass/fail results", () => {
    expect(source).toContain("passLabel");
    expect(source).toContain("failLabel");
    expect(source).toContain("passSymbol");
    expect(source).toContain("failSymbol");
  });
});
