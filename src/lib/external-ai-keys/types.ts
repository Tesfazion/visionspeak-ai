/**
 * External AI key types (BYOK — Bring Your Own Key).
 *
 * Users connect their own LLM provider keys (OpenAI, OpenRouter, Anthropic,
 * etc.) so the platform can run chatbot and mentor modes against their own
 * provider account.
 */

import { createHash } from "node:crypto";

/** Supported LLM providers. */
export type AiProvider = "openai" | "openrouter" | "anthropic";

export const AI_PROVIDERS: readonly AiProvider[] = ["openai", "openrouter", "anthropic"];

/** Default models per provider when none is selected. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  openrouter: "openrouter/auto",
  anthropic: "claude-3-haiku-20240307",
};

/** Stored external AI key record; the raw provider key is persisted for API calls. */
export interface StoredExternalAiKey {
  id: string;
  /** Provider (openai | openrouter | anthropic). */
  provider: AiProvider;
  /** Display label chosen by the user ("My OpenAI key"). */
  label: string;
  /** First 8 chars of the raw key + provider name for safe display. */
  prefix: string;
  /** SHA-256 of the raw key — index for lookups. */
  keyHash: string;
  /** Raw API key used for calls (mounted as the stored credential; the user
   *  brought it, so this is standard BYOK practice — the platform does not
   *  re-expose it after creation except the single send-back at create time). */
  apiKey: string;
  /** Default model to use. */
  model: string;
  /** Created at ISO string. */
  createdAt: string;
  /** Last used at ISO string. */
  lastUsedAt: string | null;
  /** Number of successful calls. */
  useCount: number;
  /** Account that owns this key. */
  ownerId: string;
}

/** What the create endpoint returns — raw key exactly once. */
export interface ExternalAiKeyCreateResult {
  /** The raw key only ever sent back once. */
  key: string;
  /** Record without the key hash. */
  record: Omit<StoredExternalAiKey, "keyHash">;
}

/** What list returns — raw key (apiKey) never included, but keyHash kept for lookups. */
export type ExternalAiKeySummary = Omit<StoredExternalAiKey, "apiKey">;

/** Chatbot request body. */
export interface ChatbotRequest {
  message: string;
  /** Optional conversation history. */
  history?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** Override provider/model for this request. */
  provider?: AiProvider;
  model?: string;
}

/** Chatbot response. */
export interface ChatbotResponse {
  content: string;
  model: string;
  provider: AiProvider;
}

/** Mentor request body — session analysis for coaching. */
export interface MentorRequest {
  sessionId: string;
  /** Optional raw session data to analyze. */
  sessionData?: unknown;
  /** Override provider/model for this request. */
  provider?: AiProvider;
  model?: string;
}

/** Mentor response — coaching suggestions. */
export interface MentorResponse {
  insights: string[];
  suggestions: string[];
  grade?: number;
  model: string;
  provider: AiProvider;
}

/** Generate a display-safe prefix from a raw key. */
export function keyPrefix(key: string, provider: AiProvider): string {
  return `${provider}:${key.slice(0, 8)}`;
}

/** SHA-256 hash of the raw key. */
export function hashExternalAiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Validate a key's basic shape before storing. */
export function isValidExternalAiKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 10;
}

/** Does a provider require an API key format validation? */
export function isSupportedProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}