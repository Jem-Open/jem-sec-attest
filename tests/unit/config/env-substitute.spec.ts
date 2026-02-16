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

import { describe, expect, it } from "vitest";
import { redactSensitiveValues, substituteEnvVars } from "../../../src/config/env-substitute.js";
import { ConfigError } from "../../../src/config/errors.js";

describe("substituteEnvVars", () => {
  it("substitutes ${VAR} with env value", () => {
    const result = substituteEnvVars("url: ${MY_URL}", "test.yaml", {
      MY_URL: "https://example.com",
    });
    expect(result.text).toBe("url: https://example.com");
  });

  it("substitutes multiple variables in one string", () => {
    const result = substituteEnvVars("${HOST}:${PORT}", "test.yaml", {
      HOST: "localhost",
      PORT: "3000",
    });
    expect(result.text).toBe("localhost:3000");
  });

  it("supports ${VAR:-default} fallback syntax", () => {
    const result = substituteEnvVars("url: ${MY_URL:-http://fallback}", "test.yaml", {});
    expect(result.text).toBe("url: http://fallback");
  });

  it("uses env value over default when both available", () => {
    const result = substituteEnvVars("url: ${MY_URL:-http://fallback}", "test.yaml", {
      MY_URL: "https://real.com",
    });
    expect(result.text).toBe("url: https://real.com");
  });

  it("supports empty default value", () => {
    const result = substituteEnvVars("val: ${EMPTY:-}", "test.yaml", {});
    expect(result.text).toBe("val: ");
  });

  it("throws ConfigError for missing var without default", () => {
    expect(() => substituteEnvVars("url: ${MISSING_VAR}", "config/test.yaml", {})).toThrow(
      ConfigError,
    );

    try {
      substituteEnvVars("url: ${MISSING_VAR}", "config/test.yaml", {});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("MISSING_VAR");
      expect((error as ConfigError).file).toBe("config/test.yaml");
    }
  });

  it("handles values containing literal $ { } after resolution", () => {
    const result = substituteEnvVars("val: ${MY_VAR}", "test.yaml", {
      MY_VAR: "price is $100 {yes}",
    });
    expect(result.text).toBe("val: price is $100 {yes}");
  });

  it("does not substitute escaped-looking vars (no escape syntax - literal replacement)", () => {
    const result = substituteEnvVars("val: ${VAR}", "test.yaml", {
      VAR: "hello",
    });
    expect(result.text).toBe("val: hello");
  });

  it("tracks sensitive variables matching denylist patterns", () => {
    const result = substituteEnvVars(
      "key: ${API_KEY}\nsecret: ${DB_SECRET}\nname: ${APP_NAME}",
      "test.yaml",
      { API_KEY: "k123", DB_SECRET: "s456", APP_NAME: "myapp" },
    );
    expect(result.sensitiveVars.has("API_KEY")).toBe(true);
    expect(result.sensitiveVars.has("DB_SECRET")).toBe(true);
    expect(result.sensitiveVars.has("APP_NAME")).toBe(false);
  });

  it("tracks *_PASSWORD and *_TOKEN as sensitive", () => {
    const result = substituteEnvVars("${DB_PASSWORD} ${AUTH_TOKEN}", "test.yaml", {
      DB_PASSWORD: "pass",
      AUTH_TOKEN: "tok",
    });
    expect(result.sensitiveVars.has("DB_PASSWORD")).toBe(true);
    expect(result.sensitiveVars.has("AUTH_TOKEN")).toBe(true);
  });

  it("leaves text without ${} references unchanged", () => {
    const input = "name: plain value\nport: 3000";
    const result = substituteEnvVars(input, "test.yaml", {});
    expect(result.text).toBe(input);
  });

  it("detects all denylist patterns: *_SECRET, *_KEY, *_PASSWORD, *_TOKEN", () => {
    const result = substituteEnvVars(
      "${MY_SECRET} ${MY_KEY} ${MY_PASSWORD} ${MY_TOKEN} ${MY_SAFE}",
      "test.yaml",
      {
        MY_SECRET: "s1",
        MY_KEY: "s2",
        MY_PASSWORD: "s3",
        MY_TOKEN: "s4",
        MY_SAFE: "ok",
      },
    );
    expect(result.sensitiveVars).toEqual(
      new Set(["MY_SECRET", "MY_KEY", "MY_PASSWORD", "MY_TOKEN"]),
    );
    expect(result.sensitiveVars.has("MY_SAFE")).toBe(false);
  });

  it("matches denylist patterns case-insensitively", () => {
    const result = substituteEnvVars(
      "${api_key} ${Webhook_Secret} ${db_password} ${auth_token}",
      "test.yaml",
      {
        api_key: "k1",
        Webhook_Secret: "s1",
        db_password: "p1",
        auth_token: "t1",
      },
    );
    expect(result.sensitiveVars.has("api_key")).toBe(true);
    expect(result.sensitiveVars.has("Webhook_Secret")).toBe(true);
    expect(result.sensitiveVars.has("db_password")).toBe(true);
    expect(result.sensitiveVars.has("auth_token")).toBe(true);
  });
});

describe("redactSensitiveValues", () => {
  it("redacts values matching sensitive env var values", () => {
    const original = process.env.TEST_REDACT_KEY;
    process.env.TEST_REDACT_KEY = "super-secret";
    try {
      const obj = { webhookUrl: "super-secret", name: "safe" };
      const result = redactSensitiveValues(obj, new Set(["TEST_REDACT_KEY"]));
      expect(result.webhookUrl).toBe("[REDACTED]");
      expect(result.name).toBe("safe");
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(process.env, "TEST_REDACT_KEY");
      } else {
        process.env.TEST_REDACT_KEY = original;
      }
    }
  });

  it("recursively redacts nested objects", () => {
    const original = process.env.NESTED_SECRET;
    process.env.NESTED_SECRET = "hidden";
    try {
      const obj = { integrations: { webhookUrl: "hidden" } };
      const result = redactSensitiveValues(obj, new Set(["NESTED_SECRET"]));
      expect((result.integrations as Record<string, unknown>).webhookUrl).toBe("[REDACTED]");
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(process.env, "NESTED_SECRET");
      } else {
        process.env.NESTED_SECRET = original;
      }
    }
  });

  it("returns object unchanged when no sensitive vars", () => {
    const obj = { name: "test", value: "hello" };
    const result = redactSensitiveValues(obj, new Set());
    expect(result).toEqual(obj);
  });

  it("redacts sensitive fields while preserving non-sensitive fields", () => {
    const origKey = process.env.MIXED_API_KEY;
    const origToken = process.env.MIXED_AUTH_TOKEN;
    process.env.MIXED_API_KEY = "key-abc-123";
    process.env.MIXED_AUTH_TOKEN = "tok-xyz-789";
    try {
      const obj = {
        apiKey: "key-abc-123",
        authToken: "tok-xyz-789",
        displayName: "My App",
        port: 3000,
        nested: {
          secret: "key-abc-123",
          label: "safe-value",
        },
      };
      const result = redactSensitiveValues(obj, new Set(["MIXED_API_KEY", "MIXED_AUTH_TOKEN"]));
      expect(result.apiKey).toBe("[REDACTED]");
      expect(result.authToken).toBe("[REDACTED]");
      expect(result.displayName).toBe("My App");
      expect(result.port).toBe(3000);
      const nested = result.nested as Record<string, unknown>;
      expect(nested.secret).toBe("[REDACTED]");
      expect(nested.label).toBe("safe-value");
    } finally {
      if (origKey === undefined) {
        Reflect.deleteProperty(process.env, "MIXED_API_KEY");
      } else {
        process.env.MIXED_API_KEY = origKey;
      }
      if (origToken === undefined) {
        Reflect.deleteProperty(process.env, "MIXED_AUTH_TOKEN");
      } else {
        process.env.MIXED_AUTH_TOKEN = origToken;
      }
    }
  });
});
