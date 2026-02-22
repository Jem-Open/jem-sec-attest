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
 * Secret redaction engine for AI training transcripts.
 * FR-001: Redact common secret patterns before storage.
 * FR-002: Applied to both user-submitted and AI-generated content.
 * FR-003: Typed markers indicating the secret category.
 */

import { SECRET_PATTERNS } from "./secret-patterns.js";

export interface RedactionResult {
  text: string;
  redactionCount: number;
  redactionTypes: string[];
}

export class SecretRedactor {
  /**
   * Scan text for secret patterns and replace with typed redaction markers.
   * Handles multiline input. Returns the redacted text plus metadata.
   */
  redact(text: string): RedactionResult {
    if (!text) {
      return { text, redactionCount: 0, redactionTypes: [] };
    }

    let result = text;
    let totalCount = 0;
    const typesFound = new Set<string>();

    for (const { name, pattern, marker } of SECRET_PATTERNS) {
      // Reset lastIndex for global regexes reused across calls
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = result.match(regex);
      if (matches) {
        totalCount += matches.length;
        typesFound.add(name);
        result = result.replace(regex, marker);
      }
    }

    return {
      text: result,
      redactionCount: totalCount,
      redactionTypes: [...typesFound],
    };
  }

  /**
   * Convenience: redact a value only if it is a non-empty string.
   * Returns null if the input is null/undefined.
   */
  redactOptional(value: string | undefined | null): string | undefined | null {
    if (value == null) return value;
    if (value === "") return value;
    return this.redact(value).text;
  }
}
