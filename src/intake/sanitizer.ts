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
 * Input sanitizer for untrusted job description text.
 * Primary injection defense is prompt boundaries and schema constraint, not input filtering.
 * This sanitizer strips HTML and normalizes whitespace as a defense-in-depth measure.
 */

export function sanitizeJobText(raw: string): string {
  // Strip HTML tags (prevent XSS if text is ever rendered)
  let sanitized = raw.replace(/<[^>]*>/g, "");
  // Decode common HTML entities
  sanitized = sanitized
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized;
}
