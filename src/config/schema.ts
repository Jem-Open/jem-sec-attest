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
 * Zod schemas for tenant configuration validation.
 * All schemas use .strict() to reject unknown fields (FR-009).
 */

import { z } from "zod";

export const OIDCConfigSchema = z
  .object({
    issuerUrl: z.string().url(),
    clientId: z.string().min(1),
    clientSecret: z
      .string()
      .regex(
        /^\$\{[A-Z_][A-Z0-9_]*\}$/,
        "Client secret must be an environment variable reference: ${VAR_NAME}",
      ),
    redirectUri: z.string().url(),
    scopes: z
      .array(z.string())
      .min(1)
      .refine((scopes) => scopes.includes("openid"), {
        message: 'Scopes must include "openid"',
      }),
    logoutUrl: z.string().url().optional(),
    claimMappings: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const AuthSessionConfigSchema = z.object({
  sessionTtlSeconds: z.number().int().positive().optional().default(3600),
});

export const AuthConfigSchema = z
  .object({
    oidc: OIDCConfigSchema.optional(),
    sessionTtlSeconds: z.number().int().positive().optional().default(3600),
  })
  .strict();

export const AIConfigSchema = z
  .object({
    provider: z.enum(["anthropic", "openai", "azure-openai"]).default("anthropic"),
    model: z.string().min(1).default("claude-sonnet-4-20250514"),
    temperature: z.number().min(0).max(1).default(0),
    maxRetries: z.number().int().min(0).max(5).default(2),
    gatewayUrl: z
      .string()
      .url()
      .optional()
      .describe("Vercel AI Gateway URL. When set, provider requests route through the gateway."),
  })
  .strict();

export const TenantSettingsSchema = z
  .object({
    branding: z
      .object({
        logoUrl: z.string().optional(),
        primaryColor: z.string().optional(),
        displayName: z.string().optional(),
      })
      .strict()
      .optional(),
    features: z.record(z.string(), z.boolean()).optional(),
    integrations: z
      .object({
        webhookUrl: z.string().optional(),
        ssoProvider: z.string().optional(),
      })
      .strict()
      .optional(),
    retention: z
      .object({
        days: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    auth: AuthConfigSchema.optional(),
    ai: AIConfigSchema.optional(),
  })
  .strict();

export const TenantConfigSchema = z
  .object({
    name: z.string().min(1, "Tenant name is required"),
    hostnames: z.array(z.string().min(1)).optional().default([]),
    emailDomains: z.array(z.string().min(1)).optional().default([]),
    settings: TenantSettingsSchema.optional().default({}),
  })
  .strict()
  .refine((data) => data.hostnames.length > 0 || data.emailDomains.length > 0, {
    message: "At least one hostname or email domain is required for tenant resolution",
  });

export const BaseConfigSchema = z
  .object({
    defaults: TenantSettingsSchema,
  })
  .strict();

export type TenantConfigInput = z.input<typeof TenantConfigSchema>;
export type TenantConfigParsed = z.output<typeof TenantConfigSchema>;
export type BaseConfigParsed = z.output<typeof BaseConfigSchema>;
export type OIDCConfigInput = z.input<typeof OIDCConfigSchema>;
export type OIDCConfigParsed = z.output<typeof OIDCConfigSchema>;
export type AuthConfigParsed = z.output<typeof AuthConfigSchema>;
export type AIConfigParsed = z.output<typeof AIConfigSchema>;
