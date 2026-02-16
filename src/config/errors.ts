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
 * Configuration error types for fail-fast validation.
 */

export interface ConfigErrorDetail {
  file?: string;
  path?: string;
  message: string;
}

export class ConfigError extends Error {
  readonly file?: string;
  readonly path?: string;

  constructor(detail: ConfigErrorDetail) {
    super(detail.message);
    this.name = "ConfigError";
    this.file = detail.file;
    this.path = detail.path;
  }

  toString(): string {
    const parts: string[] = [];
    if (this.file) parts.push(`File: ${this.file}`);
    if (this.path) parts.push(`Field: ${this.path}`);
    parts.push(`Message: ${this.message}`);
    return parts.join("\n  ");
  }
}

export class ConfigValidationError extends Error {
  readonly errors: readonly ConfigErrorDetail[];

  constructor(errors: ConfigErrorDetail[]) {
    const summary = `Config validation failed with ${errors.length} error(s):\n${errors
      .map((e) => {
        const parts: string[] = [];
        if (e.file) parts.push(`File: ${e.file}`);
        if (e.path) parts.push(`Field: ${e.path}`);
        parts.push(`Message: ${e.message}`);
        return `  - ${parts.join(", ")}`;
      })
      .join("\n")}`;
    super(summary);
    this.name = "ConfigValidationError";
    this.errors = Object.freeze([...errors]);
  }
}
