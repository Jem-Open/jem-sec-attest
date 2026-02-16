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
 * Generates JSON Schema from Zod schemas.
 * Output: config/schema/tenant.schema.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BaseConfigSchema, TenantConfigSchema } from "../src/config/schema.js";

const outputDir = join(process.cwd(), "config", "schema");
mkdirSync(outputDir, { recursive: true });

const tenantSchema = zodToJsonSchema(TenantConfigSchema, "TenantConfig");
const baseSchema = zodToJsonSchema(BaseConfigSchema, "BaseConfig");

const combinedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "jem-sec-attest Tenant Configuration Schema",
  description: "Schema for tenant configuration files and base defaults.",
  definitions: {
    TenantConfig: tenantSchema.definitions?.TenantConfig ?? tenantSchema,
    BaseConfig: baseSchema.definitions?.BaseConfig ?? baseSchema,
  },
};

const outputPath = join(outputDir, "tenant.schema.json");
writeFileSync(outputPath, `${JSON.stringify(combinedSchema, null, 2)}\n`);
console.log(`Generated: ${outputPath}`);
