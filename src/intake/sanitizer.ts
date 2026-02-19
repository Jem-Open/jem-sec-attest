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
 *
 * @warning Output is NOT safe for `innerHTML` or `dangerouslySetInnerHTML`.
 * Always use `textContent` or framework text interpolation when rendering.
 */

export function sanitizeJobText(raw: string): string {
  // Strip <script>, <style>, and <noscript> blocks including their content (case-insensitive)
  let sanitized = raw.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // Strip remaining HTML tags (first pass)
  sanitized = sanitized.replace(/<[^>]*>/g, "");
  // Decode common HTML entities
  sanitized = sanitized
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Strip dangerous blocks again after entity decoding (catches entity-encoded tags
  // e.g. &lt;script&gt;...&lt;/script&gt; decodes then gets stripped)
  sanitized = sanitized.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  // Strip any remaining HTML tags (second pass)
  sanitized = sanitized.replace(/<[^>]*>/g, "");
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized;
}
