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

import { SecretRedactor } from "@/guardrails/secret-redactor";

describe("SecretRedactor", () => {
  let redactor: SecretRedactor;

  beforeEach(() => {
    redactor = new SecretRedactor();
  });

  describe("redact()", () => {
    describe("API key patterns", () => {
      it("redacts sk- prefixed API keys (20+ chars)", () => {
        const result = redactor.redact("My key is sk-abcdefghijklmnopqrstu");
        expect(result.text).toBe("My key is [REDACTED:API_KEY]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("API_KEY");
      });

      it("redacts pk- prefixed API keys (20+ chars)", () => {
        const result = redactor.redact("Public key: pk-abcdefghijklmnopqrstu");
        expect(result.text).toBe("Public key: [REDACTED:API_KEY]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("API_KEY");
      });

      it("redacts AKIA prefixed AWS keys (16 uppercase chars)", () => {
        const result = redactor.redact("AWS key: AKIAIOSFODNN7EXAMPLE");
        expect(result.text).toBe("AWS key: [REDACTED:API_KEY]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("API_KEY");
      });

      it("does not redact sk- prefixed strings shorter than 20 chars", () => {
        const result = redactor.redact("sk-tooshort");
        expect(result.text).toBe("sk-tooshort");
        expect(result.redactionCount).toBe(0);
      });

      it("does not redact pk- prefixed strings shorter than 20 chars", () => {
        const result = redactor.redact("pk-tooshort");
        expect(result.text).toBe("pk-tooshort");
        expect(result.redactionCount).toBe(0);
      });
    });

    describe("password patterns", () => {
      it("redacts password= assignments", () => {
        const result = redactor.redact("password=supersecret123");
        expect(result.text).toContain("[REDACTED:PASSWORD]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("PASSWORD");
      });

      it("redacts secret= assignments", () => {
        const result = redactor.redact("secret=mysecretvalue");
        expect(result.text).toContain("[REDACTED:PASSWORD]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("PASSWORD");
      });

      it("redacts password= case-insensitively (PASSWORD=)", () => {
        const result = redactor.redact("PASSWORD=supersecret123");
        expect(result.text).toContain("[REDACTED:PASSWORD]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("PASSWORD");
      });

      it("redacts secret= case-insensitively (SECRET=)", () => {
        const result = redactor.redact("SECRET=mysecretvalue");
        expect(result.text).toContain("[REDACTED:PASSWORD]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("PASSWORD");
      });

      it("preserves surrounding context after password redaction", () => {
        const result = redactor.redact("config: password=hunter2 end");
        expect(result.text).toContain("config:");
        expect(result.text).toContain("[REDACTED:PASSWORD]");
        expect(result.text).toContain("end");
        expect(result.text).not.toContain("hunter2");
      });
    });

    describe("token patterns", () => {
      it("redacts token= assignments", () => {
        const result = redactor.redact("token=abcdef123456");
        expect(result.text).toContain("[REDACTED:TOKEN]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("TOKEN");
      });

      it("redacts token= case-insensitively (TOKEN=)", () => {
        const result = redactor.redact("TOKEN=abcdef123456");
        expect(result.text).toContain("[REDACTED:TOKEN]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("TOKEN");
      });

      it("preserves surrounding context after token redaction", () => {
        const result = redactor.redact("Authorization token=mytoken here");
        expect(result.text).toContain("Authorization");
        expect(result.text).toContain("[REDACTED:TOKEN]");
        expect(result.text).toContain("here");
        expect(result.text).not.toContain("mytoken");
      });
    });

    describe("Bearer token patterns", () => {
      it("redacts Bearer JWT tokens", () => {
        const result = redactor.redact(
          "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
        );
        expect(result.text).toContain("[REDACTED:BEARER]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("BEARER");
      });

      it("preserves the Bearer prefix label in surrounding context", () => {
        const result = redactor.redact("Header: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig");
        expect(result.text).toContain("Header:");
        expect(result.text).toContain("[REDACTED:BEARER]");
        expect(result.text).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      });
    });

    describe("connection string patterns", () => {
      it("redacts mongodb:// connection strings", () => {
        const result = redactor.redact("db: mongodb://user:pass@host:27017/dbname");
        expect(result.text).toContain("[REDACTED:CONNECTION_STRING]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("CONNECTION_STRING");
      });

      it("redacts postgres:// connection strings", () => {
        const result = redactor.redact("db: postgres://user:pass@localhost:5432/mydb");
        expect(result.text).toContain("[REDACTED:CONNECTION_STRING]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("CONNECTION_STRING");
      });

      it("redacts postgresql:// connection strings", () => {
        const result = redactor.redact("db: postgresql://user:pass@localhost:5432/mydb");
        expect(result.text).toContain("[REDACTED:CONNECTION_STRING]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("CONNECTION_STRING");
      });

      it("redacts mysql:// connection strings", () => {
        const result = redactor.redact("db: mysql://user:pass@localhost:3306/mydb");
        expect(result.text).toContain("[REDACTED:CONNECTION_STRING]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("CONNECTION_STRING");
      });

      it("redacts redis:// connection strings", () => {
        const result = redactor.redact("cache: redis://user:pass@localhost:6379");
        expect(result.text).toContain("[REDACTED:CONNECTION_STRING]");
        expect(result.redactionCount).toBe(1);
        expect(result.redactionTypes).toContain("CONNECTION_STRING");
      });

      it("preserves surrounding context after connection string redaction", () => {
        const result = redactor.redact("Connect to postgres://admin:secret@db.host/prod now");
        expect(result.text).toContain("Connect to");
        expect(result.text).toContain("[REDACTED:CONNECTION_STRING]");
        expect(result.text).toContain("now");
        expect(result.text).not.toContain("admin:secret");
      });
    });

    describe("no-match passthrough", () => {
      it("returns normal text unchanged", () => {
        const text = "This is normal text with no secrets.";
        const result = redactor.redact(text);
        expect(result.text).toBe(text);
        expect(result.redactionCount).toBe(0);
        expect(result.redactionTypes).toEqual([]);
      });

      it("does not alter URLs without credentials", () => {
        const text = "Visit https://example.com/path?query=value";
        const result = redactor.redact(text);
        expect(result.text).toBe(text);
        expect(result.redactionCount).toBe(0);
      });

      it("returns empty string unchanged", () => {
        const result = redactor.redact("");
        expect(result.text).toBe("");
        expect(result.redactionCount).toBe(0);
        expect(result.redactionTypes).toEqual([]);
      });
    });

    describe("multiple secrets in the same text", () => {
      it("redacts multiple distinct secret types in one string", () => {
        const text = "key=sk-abcdefghijklmnopqrstu and password=hunter2 and token=mytoken123";
        const result = redactor.redact(text);
        expect(result.text).not.toContain("sk-abcdefghijklmnopqrstu");
        expect(result.text).not.toContain("hunter2");
        expect(result.text).not.toContain("mytoken123");
        expect(result.redactionCount).toBeGreaterThanOrEqual(3);
      });

      it("records all redaction types when multiple patterns match", () => {
        const text = "Bearer eyJhbGciOiJIUzI1NiJ9.p.s and postgres://u:p@h/db";
        const result = redactor.redact(text);
        expect(result.redactionTypes).toContain("BEARER");
        expect(result.redactionTypes).toContain("CONNECTION_STRING");
      });

      it("redactionCount reflects total number of redactions performed", () => {
        const text = "password=abc secret=def token=ghi";
        const result = redactor.redact(text);
        expect(result.redactionCount).toBe(3);
      });
    });

    describe("multiline input", () => {
      it("redacts secrets on different lines", () => {
        const text = [
          "line one: password=topsecret",
          "line two: normal content",
          "line three: token=myapitoken",
        ].join("\n");

        const result = redactor.redact(text);
        expect(result.text).toContain("line one:");
        expect(result.text).toContain("line two: normal content");
        expect(result.text).toContain("line three:");
        expect(result.text).not.toContain("topsecret");
        expect(result.text).not.toContain("myapitoken");
        expect(result.redactionCount).toBe(2);
        expect(result.redactionTypes).toContain("PASSWORD");
        expect(result.redactionTypes).toContain("TOKEN");
      });

      it("redacts API key on its own line", () => {
        const text = "config:\n  api_key: sk-abcdefghijklmnopqrstu\n  timeout: 30";
        const result = redactor.redact(text);
        expect(result.text).not.toContain("sk-abcdefghijklmnopqrstu");
        expect(result.text).toContain("[REDACTED:API_KEY]");
        expect(result.text).toContain("timeout: 30");
      });
    });

    describe("redactionTypes deduplication", () => {
      it("does not duplicate redaction type entries for the same pattern category", () => {
        const text = "password=abc password=def";
        const result = redactor.redact(text);
        const passwordEntries = result.redactionTypes.filter((t) => t === "PASSWORD");
        expect(passwordEntries.length).toBe(1);
      });
    });
  });

  describe("redactOptional()", () => {
    it("returns null when input is null", () => {
      const result = redactor.redactOptional(null);
      expect(result).toBeNull();
    });

    it("returns undefined when input is undefined", () => {
      const result = redactor.redactOptional(undefined);
      expect(result).toBeUndefined();
    });

    it("delegates to redact() for string input and returns redacted text", () => {
      const result = redactor.redactOptional("password=hunter2");
      expect(result).toContain("[REDACTED:PASSWORD]");
      expect(result).not.toContain("hunter2");
    });

    it("returns normal string unchanged when no secrets present", () => {
      const result = redactor.redactOptional("safe normal text");
      expect(result).toBe("safe normal text");
    });

    it("returns empty string for empty string input", () => {
      const result = redactor.redactOptional("");
      expect(result).toBe("");
    });
  });
});
