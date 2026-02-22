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
 * i18n foundation — server-safe helpers for locale-aware string resolution
 * with interpolation and fallback.
 *
 * T026: English locale extraction from STRINGS constants.
 * T027: getTranslation() server helper, shared resolution utilities.
 * T028: French locale with partial coverage (English fallback).
 *
 * Client hook (useTranslation) lives in ./client.ts to keep this module
 * importable from Server Components.
 */

import enLocale from "./locales/en.json";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export const DEFAULT_LOCALE = "en";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocaleMessages = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers (exported for use by client.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-notation key against a nested JSON object.
 * e.g. resolve("training.quiz.submit", messages) → "Submit Quiz"
 */
export function resolve(key: string, messages: LocaleMessages): string | undefined {
  const parts = key.split(".");
  let current: unknown = messages;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Interpolate `{var}` placeholders in a string with provided params.
 */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}

/**
 * Create a `t` function bound to the given locale messages with English fallback.
 */
export function createTFunction(
  messages: LocaleMessages,
  fallback: LocaleMessages,
): (key: string, params?: Record<string, string | number>) => string {
  return (key: string, params?: Record<string, string | number>): string => {
    const value = resolve(key, messages) ?? resolve(key, fallback) ?? key;
    return interpolate(value, params);
  };
}

/** The built-in English locale messages. */
export const enMessages: LocaleMessages = enLocale as unknown as LocaleMessages;

// ---------------------------------------------------------------------------
// Server-side helper: getTranslation()
// ---------------------------------------------------------------------------

/**
 * Server-side function that loads locale JSON and returns a `t` function.
 * Falls back to English for missing keys or unsupported locales.
 */
export async function getTranslation(
  locale: string,
): Promise<(key: string, params?: Record<string, string | number>) => string> {
  const resolvedLocale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? locale
    : DEFAULT_LOCALE;

  const fallback = enMessages;

  if (resolvedLocale === "en") {
    return createTFunction(fallback, fallback);
  }

  try {
    const mod = await import(`./locales/${resolvedLocale}.json`);
    const messages = (mod.default ?? mod) as LocaleMessages;
    return createTFunction(messages, fallback);
  } catch {
    return createTFunction(fallback, fallback);
  }
}
