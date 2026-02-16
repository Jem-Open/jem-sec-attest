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
 * Environment variable substitution for config files.
 * Supports ${VAR} and ${VAR:-default} syntax.
 * Runs on raw YAML/JSON text BEFORE parsing.
 */

import { ConfigError } from "./errors.js";

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

const SENSITIVE_PATTERNS = [/_SECRET$/i, /_KEY$/i, /_PASSWORD$/i, /_TOKEN$/i];

export interface SubstitutionResult {
  text: string;
  sensitiveVars: ReadonlySet<string>;
}

/**
 * Check whether an env var name matches any denylist pattern.
 */
function isSensitiveVar(varName: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(varName));
}

/**
 * Substitute ${VAR} and ${VAR:-default} references in raw text.
 * @throws ConfigError if a referenced variable is missing and has no default.
 */
export function substituteEnvVars(
  text: string,
  sourceFile: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): SubstitutionResult {
  const errors: ConfigError[] = [];
  const sensitiveVars = new Set<string>();

  const result = text.replace(ENV_VAR_PATTERN, (match, expr: string) => {
    const defaultSepIndex = expr.indexOf(":-");
    let varName: string;
    let defaultValue: string | undefined;

    if (defaultSepIndex !== -1) {
      varName = expr.slice(0, defaultSepIndex);
      defaultValue = expr.slice(defaultSepIndex + 2);
    } else {
      varName = expr;
    }

    if (isSensitiveVar(varName)) {
      sensitiveVars.add(varName);
    }

    const value = env[varName];
    if (value !== undefined) {
      return value;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    errors.push(
      new ConfigError({
        file: sourceFile,
        message: `Unresolved environment variable: \${${varName}}`,
      }),
    );
    return match;
  });

  if (errors.length > 0) {
    const firstError = errors[0];
    if (firstError) throw firstError;
  }

  return { text: result, sensitiveVars };
}

/**
 * Redact sensitive values in a config object for logging.
 * Replaces values of keys matching sensitive patterns with [REDACTED].
 */
export function redactSensitiveValues(
  obj: Record<string, unknown>,
  sensitiveVars: ReadonlySet<string>,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      redacted[key] = redactSensitiveValues(value as Record<string, unknown>, sensitiveVars);
    } else if (typeof value === "string" && sensitiveVars.size > 0) {
      let isRedacted = false;
      for (const varName of sensitiveVars) {
        const envValue = process.env[varName];
        if (envValue && value.includes(envValue)) {
          isRedacted = true;
          break;
        }
      }
      redacted[key] = isRedacted ? "[REDACTED]" : value;
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
