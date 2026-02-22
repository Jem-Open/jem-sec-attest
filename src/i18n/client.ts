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
 * i18n client hook — useTranslation() for client components.
 *
 * T027: Client-side translation hook with locale detection,
 * cookie persistence, and lazy locale loading.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, createTFunction, enMessages } from "./index.js";
import type { LocaleMessages } from "./index.js";

// ---------------------------------------------------------------------------
// Client-only helpers
// ---------------------------------------------------------------------------

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
}

function detectLocale(): string {
  const cookieLocale = getCookie("locale");
  if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
    return cookieLocale;
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    const prefix = navigator.language.split("-")[0]?.toLowerCase() ?? "";
    if ((SUPPORTED_LOCALES as readonly string[]).includes(prefix)) {
      return prefix;
    }
  }

  return DEFAULT_LOCALE;
}

// ---------------------------------------------------------------------------
// Locale loading cache
// ---------------------------------------------------------------------------

const localeCache = new Map<string, LocaleMessages>();
localeCache.set("en", enMessages);

async function loadLocaleMessages(locale: string): Promise<LocaleMessages> {
  const cached = localeCache.get(locale);
  if (cached) return cached;

  try {
    const mod = await import(`./locales/${locale}.json`);
    const messages = (mod.default ?? mod) as LocaleMessages;
    localeCache.set(locale, messages);
    return messages;
  } catch {
    return enMessages;
  }
}

// ---------------------------------------------------------------------------
// Client-side hook: useTranslation()
// ---------------------------------------------------------------------------

/**
 * Client-side hook returning `{ t, locale, setLocale }`.
 *
 * - `t(key, params?)` — resolves dot-notation key, interpolates `{var}` placeholders.
 * - `locale` — current locale string.
 * - `setLocale(locale)` — persists to cookie and triggers re-render.
 */
export function useTranslation(): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (locale: string) => void;
} {
  const [currentLocale, setCurrentLocale] = useState<string>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<LocaleMessages>(enMessages);

  useEffect(() => {
    const detected = detectLocale();
    setCurrentLocale(detected);

    if (detected !== "en") {
      loadLocaleMessages(detected).then(setMessages);
    }
  }, []);

  const setLocale = useCallback((locale: string) => {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return;

    document.cookie = `locale=${encodeURIComponent(locale)}; path=/; max-age=31536000`;
    setCurrentLocale(locale);

    loadLocaleMessages(locale).then(setMessages);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      return createTFunction(messages, enMessages)(key, params);
    },
    [messages],
  );

  return { t, locale: currentLocale, setLocale };
}
