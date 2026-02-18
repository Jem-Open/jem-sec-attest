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
 * Generates JSON Schema from Zod schemas using Zod v4's built-in toJSONSchema.
 * Output: config/schema/tenant.schema.json, config/schema/auth.schema.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  AuthConfigSchema,
  AuthSessionConfigSchema,
  BaseConfigSchema,
  OIDCConfigSchema,
  TenantConfigSchema,
} from "../src/config/schema.js";

const outputDir = join(process.cwd(), "config", "schema");
mkdirSync(outputDir, { recursive: true });

const tenantSchema = z.toJSONSchema(TenantConfigSchema);
const baseSchema = z.toJSONSchema(BaseConfigSchema);

const combinedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "jem-sec-attest Tenant Configuration Schema",
  description: "Schema for tenant configuration files and base defaults.",
  definitions: {
    TenantConfig: tenantSchema,
    BaseConfig: baseSchema,
  },
};

const tenantOutputPath = join(outputDir, "tenant.schema.json");
writeFileSync(tenantOutputPath, `${JSON.stringify(combinedSchema, null, 2)}\n`);
console.log(`Generated: ${tenantOutputPath}`);

const oidcSchema = z.toJSONSchema(OIDCConfigSchema);
const authSessionSchema = z.toJSONSchema(AuthSessionConfigSchema);
const authSchema = z.toJSONSchema(AuthConfigSchema);

const authCombinedSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "jem-sec-attest Auth Configuration Schema",
  description: "Schema for OIDC authentication and session configuration.",
  definitions: {
    OIDCConfig: oidcSchema,
    AuthSessionConfig: authSessionSchema,
    AuthConfig: authSchema,
  },
};

const authOutputPath = join(outputDir, "auth.schema.json");
writeFileSync(authOutputPath, `${JSON.stringify(authCombinedSchema, null, 2)}\n`);
console.log(`Generated: ${authOutputPath}`);
