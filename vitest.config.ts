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

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/config/provider.ts",
        "src/storage/adapter.ts",
        "src/storage/types.ts",
        "src/tenant/types.ts",
        "src/tenant/index.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.spec.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.spec.ts"],
        },
      },
      {
        test: {
          name: "contract",
          include: ["tests/contract/**/*.spec.ts"],
        },
      },
    ],
  },
});
