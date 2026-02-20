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

import { computeContentHash } from "@/evidence/hash";

describe("computeContentHash", () => {
  it("produces a 64-character hex string", () => {
    const hash = computeContentHash({ foo: "bar" });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces deterministic output for same input", () => {
    const input = { name: "alice", score: 42 };
    const hash1 = computeContentHash(input);
    const hash2 = computeContentHash(input);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = computeContentHash({ a: 1 });
    const hash2 = computeContentHash({ a: 2 });
    expect(hash1).not.toBe(hash2);
  });

  it("is independent of key insertion order", () => {
    const hash1 = computeContentHash({ a: 1, b: 2 });
    const hash2 = computeContentHash({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });

  it("handles nested objects deterministically", () => {
    const hash1 = computeContentHash({ outer: { a: 1, b: 2 } });
    const hash2 = computeContentHash({ outer: { b: 2, a: 1 } });
    expect(hash1).toBe(hash2);
  });

  it("handles empty object", () => {
    const hash = computeContentHash({});
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
