import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import type { AIProviderConfig, AIProviderCredentials, AIProviderId, AIProvider } from "@/lib/ai-provider";

export type { AIProviderConfig, AIProviderCredentials, AIProviderId, AIProvider };

export function createProvider(
  id: AIProviderId,
  config: AIProviderConfig,
  credentials: AIProviderCredentials,
): AIProvider | null {
  switch (id) {
    case "openai":
      return new OpenAIProvider(config, credentials);
    case "anthropic":
      return new AnthropicProvider(config, credentials);
    case "none":
      return null;
    default:
      return null;
  }
}
