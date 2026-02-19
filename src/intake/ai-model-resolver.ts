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
 * AI model resolver for the intake module.
 * Resolves tenant AI configuration to an AI SDK LanguageModel instance.
 * Default routing goes through Vercel AI Gateway; tenants can override to direct provider access.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { Tenant } from "../tenant/types.js";

export function resolveModel(tenant: Tenant): LanguageModel {
  const aiConfig = tenant.settings.ai ?? {};
  const provider = aiConfig.provider ?? "anthropic";
  const modelId = aiConfig.model ?? "claude-sonnet-4-20250514";
  const gatewayUrl = aiConfig.gatewayUrl ?? process.env.AI_GATEWAY_URL;

  switch (provider) {
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          "ANTHROPIC_API_KEY environment variable is required for Anthropic provider",
        );
      }
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        ...(gatewayUrl ? { baseURL: gatewayUrl } : {}),
      });
      return anthropic(modelId);
    }
    case "openai": {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is required for OpenAI provider");
      }
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        ...(gatewayUrl ? { baseURL: gatewayUrl } : {}),
      });
      return openai(modelId);
    }
    case "azure-openai": {
      if (!process.env.AZURE_OPENAI_API_KEY) {
        throw new Error(
          "AZURE_OPENAI_API_KEY environment variable is required for Azure OpenAI provider",
        );
      }
      const azure = createAzure({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        ...(gatewayUrl ? { baseURL: gatewayUrl } : {}),
      });
      return azure(modelId);
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported AI provider: ${_exhaustive}`);
    }
  }
}
