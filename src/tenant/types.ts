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
 * Validated tenant configuration types.
 */

export interface TenantSettings {
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    displayName?: string;
  };
  features?: Record<string, boolean>;
  integrations?: {
    webhookUrl?: string;
    ssoProvider?: string;
  };
  retention?: {
    days?: number;
  };
  auth?: {
    oidc?: {
      issuerUrl: string;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      scopes: string[];
      logoutUrl?: string;
      claimMappings?: Record<string, string>;
    };
    sessionTtlSeconds?: number;
  };
  ai?: {
    provider?: "anthropic" | "openai" | "azure-openai";
    model?: string;
    temperature?: number;
    maxRetries?: number;
    gatewayUrl?: string;
  };
  training?: {
    passThreshold?: number;
    maxAttempts?: number;
    maxModules?: number;
    enableRemediation?: boolean;
  };
}

export interface Tenant {
  readonly id: string;
  readonly name: string;
  readonly hostnames: readonly string[];
  readonly emailDomains: readonly string[];
  readonly settings: TenantSettings;
}

export interface ConfigSnapshot {
  readonly tenants: ReadonlyMap<string, Tenant>;
  readonly hostnameIndex: ReadonlyMap<string, string>;
  readonly emailDomainIndex: ReadonlyMap<string, string>;
  readonly configHash: string;
  readonly loadedAt: Date;
}

export interface TenantResolverContext {
  hostname?: string;
  emailDomain?: string;
}
