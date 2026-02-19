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
import { sanitizeJobText } from "../../../src/intake/sanitizer";

describe("sanitizeJobText", () => {
  it("strips simple HTML tags", () => {
    expect(sanitizeJobText("Hello <b>world</b>")).toBe("Hello world");
  });

  it("removes script tags and their content markers", () => {
    // The regex /<[^>]*>/g strips <script> and </script> but leaves the text
    // between them intact. alert('xss') is preserved; no spaces are introduced.
    expect(sanitizeJobText("text<script>alert('xss')</script>more")).toBe("textalert('xss')more");
  });

  it("normalizes multiple whitespace characters", () => {
    expect(sanitizeJobText("hello   world\n\nfoo\tbar")).toBe("hello world foo bar");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeJobText("  hello world  ")).toBe("hello world");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeJobText("")).toBe("");
  });

  it("returns empty string when input is only HTML tags", () => {
    expect(sanitizeJobText("<div><span></span></div>")).toBe("");
  });

  it("preserves normal text without HTML", () => {
    expect(sanitizeJobText("This is a normal job description.")).toBe(
      "This is a normal job description.",
    );
  });

  it("handles nested/malformed HTML like <scr<script>ipt>", () => {
    // The regex greedily matches from the first '<' to the first '>'.
    // In "<scr<script>", it matches "<scr<script>" leaving "ipt>" behind.
    // Similarly "</scr</script>" leaves the preceding fragment.
    // The function must not throw; it returns a string derived from the input.
    const input = "before<scr<script>ipt>alert(1)</scr</script>ipt>after";
    const result = sanitizeJobText(input);
    expect(typeof result).toBe("string");
    // The matched portions are stripped; non-tag remnants remain
    expect(result).toBe("beforeipt>alert(1)ipt>after");
  });

  it("handles unclosed tags", () => {
    // "<b world" has no closing '>' so /<[^>]*>/ does not match it.
    // The raw text passes through unchanged (only whitespace is normalized).
    expect(sanitizeJobText("hello <b world")).toBe("hello <b world");
  });

  it("handles self-closing tags", () => {
    expect(sanitizeJobText("line<br/>break")).toBe("linebreak");
  });

  it("handles attributes in tags", () => {
    expect(sanitizeJobText('text <a href="http://evil.com">click</a> more')).toBe(
      "text click more",
    );
  });
});
