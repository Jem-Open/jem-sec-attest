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

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getTranslation } from "@/i18n";

describe("getTranslation", () => {
  it("returns a t function for English locale", async () => {
    const t = await getTranslation("en");
    expect(typeof t).toBe("function");
  });

  it("t('auth.signInTitle') returns the correct English string", async () => {
    const t = await getTranslation("en");
    const result = t("auth.signInTitle");
    expect(result).toBeTypeOf("string");
    expect(result).not.toBe("auth.signInTitle");
    expect(result.length).toBeGreaterThan(0);
  });

  it("falls back to English for a key only defined in English", async () => {
    const tEn = await getTranslation("en");
    const tFr = await getTranslation("fr");
    // training.startModule exists only in en.json, not in fr.json
    const enValue = tEn("training.startModule");
    const frValue = tFr("training.startModule");
    expect(frValue).toBe(enValue);
  });

  it("interpolates {var} placeholders", async () => {
    const t = await getTranslation("en");
    const result = t("dashboard.welcome", { displayName: "Alice" });
    expect(result).toContain("Alice");
  });

  it("falls back to English for an unknown locale", async () => {
    const tUnknown = await getTranslation("zz");
    const tEn = await getTranslation("en");
    const unknownResult = tUnknown("auth.signInTitle");
    const enResult = tEn("auth.signInTitle");
    expect(unknownResult).toBe(enResult);
  });

  it("returns the key itself for an unknown key", async () => {
    const t = await getTranslation("en");
    const result = t("this.key.does.not.exist");
    expect(result).toBe("this.key.does.not.exist");
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("includes 'en'", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
  });

  it("includes 'fr'", () => {
    expect(SUPPORTED_LOCALES).toContain("fr");
  });
});

describe("DEFAULT_LOCALE", () => {
  it("is 'en'", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});
