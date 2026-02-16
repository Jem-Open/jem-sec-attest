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
 * ConfigProvider interface — pluggable configuration source.
 * Constitution Principle V: Pluggable Architecture.
 */

export interface RawConfig {
  [key: string]: unknown;
}

export interface RawTenantConfig {
  content: RawConfig;
  sourceFile: string;
  tenantId: string;
}

export interface ConfigProvider {
  loadDefaults(): Promise<RawConfig>;
  loadTenants(): Promise<RawTenantConfig[]>;
}

export interface FileConfigProviderOptions {
  configDir: string;
  defaultsFile?: string;
  tenantsDir?: string;
}
