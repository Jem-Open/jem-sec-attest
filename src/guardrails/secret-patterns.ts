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
 * Secret detection patterns for transcript redaction.
 * FR-001: Redact common secret patterns before storage.
 * FR-003: Typed markers indicating the secret category.
 */

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  marker: string;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS access keys (AKIA prefix, 16 alphanumeric characters)
  {
    name: "API_KEY",
    pattern: /AKIA[A-Z0-9]{16}/g,
    marker: "[REDACTED:API_KEY]",
  },
  // OpenAI / Anthropic style API keys (sk- or pk- prefix)
  {
    name: "API_KEY",
    pattern: /(?:sk|pk)-[a-zA-Z0-9]{20,}/g,
    marker: "[REDACTED:API_KEY]",
  },
  // Bearer tokens
  {
    name: "BEARER",
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    marker: "[REDACTED:BEARER]",
  },
  // Connection strings (mongodb://, postgres://, mysql://, redis://)
  {
    name: "CONNECTION_STRING",
    pattern: /(?:mongodb|postgres|postgresql|mysql|redis):\/\/[^\s]+/g,
    marker: "[REDACTED:CONNECTION_STRING]",
  },
  // Password/secret/token key-value assignments
  {
    name: "PASSWORD",
    pattern: /password\s*[=:]\s*[^\s;,&"']+/gi,
    marker: "[REDACTED:PASSWORD]",
  },
  {
    name: "PASSWORD",
    pattern: /secret\s*[=:]\s*[^\s;,&"']+/gi,
    marker: "[REDACTED:PASSWORD]",
  },
  {
    name: "TOKEN",
    pattern: /token\s*[=:]\s*[^\s;,&"']+/gi,
    marker: "[REDACTED:TOKEN]",
  },
];
