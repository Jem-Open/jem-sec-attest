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

  it("removes script tags and their content", () => {
    expect(sanitizeJobText("text<script>alert('xss')</script>more")).toBe("textmore");
  });

  it("removes script tags case-insensitively", () => {
    expect(sanitizeJobText("a<SCRIPT>evil()</SCRIPT>b")).toBe("ab");
  });

  it("removes style tags and their content", () => {
    expect(sanitizeJobText("text<style>body{display:none}</style>more")).toBe("textmore");
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
    // The function must not throw; it returns a string derived from the input.
    const input = "before<scr<script>ipt>alert(1)</scr</script>ipt>after";
    const result = sanitizeJobText(input);
    expect(typeof result).toBe("string");
    // The script block regex matches from <script> to </script>, removing content between.
    // The generic tag regex then strips remaining malformed tag fragments.
    expect(result).toBe("beforeafter");
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

  it("decodes common HTML entities", () => {
    expect(sanitizeJobText("Tom &amp; Jerry &lt;3")).toBe("Tom & Jerry <3");
  });

  it("decodes entities after stripping tags", () => {
    expect(sanitizeJobText("<b>A &amp; B</b>")).toBe("A & B");
  });

  it("strips tags and content reconstructed from HTML entities", () => {
    expect(sanitizeJobText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("");
  });
});
