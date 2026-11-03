/**
 * External AI provider client — thin wrapper around OpenAI-compatible endpoints.
 *
 * Supports:
 *   - OpenAI:   https://api.openai.com/v1/chat/completions
 *   - OpenRouter: https://openrouter.ai/api/v1/chat/completions
 *   - Anthropic: https://api.anthropic.com/v1/messages
 */

import { AiProvider, DEFAULT_MODELS, StoredExternalAiKey } from "./types";

export interface LlmRequest {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

interface ProviderConfig {
  url: string;
  headers: Record<string, string>;
  model: string;
  provider: AiProvider;
}

/** Build the provider's endpoint URL + auth header. */
export function providerConfig(key: StoredExternalAiKey): ProviderConfig {
  const model = key.model || DEFAULT_MODELS[key.provider];
  switch (key.provider) {
    case "openai":
      return {
        provider: "openai",
        url: "https://api.openai.com/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.apiKey}`,
        },
        model,
      };
    case "openrouter":
      return {
        provider: "openrouter",
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.apiKey}`,
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://visionspeak.ai",
          "X-Title": "VisionSpeak AI",
        },
        model,
      };
    case "anthropic":
      return {
        provider: "anthropic",
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key.apiKey,
          "anthropic-version": "2023-06-01",
        },
        model,
      };
    default:
      throw new Error(`Unsupported provider: ${key.provider}`);
  }
}

/** Call the provider and return a non-streaming completion. */
export async function callLlm(
  key: StoredExternalAiKey,
  request: LlmRequest
): Promise<LlmResponse> {
  const cfg = providerConfig(key);
  const model = request.model || cfg.model;

  const body = buildRequest(cfg.provider, model, request);

  const response = await fetch(cfg.url, {
    method: "POST",
    headers: cfg.headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Provider error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as Record<string, unknown>;

  return extractResponse(cfg.provider, model, data);
}

export function buildRequest(
  provider: AiProvider,
  model: string,
  request: LlmRequest
): Record<string, unknown> {
  const maxTokens = request.maxTokens ?? 1024;
  const temperature = request.temperature ?? 0.7;

  if (provider === "anthropic") {
    return {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: request.messages,
    };
  }

  return {
    model,
    messages: request.messages,
    max_tokens: maxTokens,
    temperature,
  };
}

export function extractResponse(
  provider: AiProvider,
  model: string,
  data: Record<string, unknown>
): LlmResponse {
  if (provider === "anthropic") {
    const content = (data.content as Array<{ text?: string }> | undefined)
      ?.map((c) => c.text || "")
      .join("") || "";
    return { content, model, usage: undefined };
  }

  const choice = (data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0];
  const content = choice?.message?.content || "";
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return {
    content,
    model: (data.model as string) || model,
    usage: usage
      ? { promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 }
      : undefined,
  };
}