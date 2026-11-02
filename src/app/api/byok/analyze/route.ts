"use server";

import type { NextRequest } from "next/server";
import { createProvider, type AIProviderConfig, type AIProviderCredentials } from "@/lib/ai-providers";
import type { FaceAnalysisInput, VoiceAnalysisInput, SpeechAnalysisInput, CoachingContextInput } from "@/lib/ai-provider";
import { promises as fs } from "node:fs";
import { createHmac } from "node:crypto";

/** Path where BYOK global config lives (relative to DATA_DIR). */
const BYOK_CONFIG_FILE = "./data/byok-config.json";

interface AnalysisRequest {
  type: "face" | "voice" | "speech" | "coaching";
  input: FaceAnalysisInput | VoiceAnalysisInput | SpeechAnalysisInput | CoachingContextInput;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string;
}

async function loadGlobalConfig(): Promise<{ provider: string; apiKey: string; seal: string } | null> {
  try {
    const raw = await fs.readFile(BYOK_CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadUserKey(userId: string): Promise<{ provider: string; apiKey: string } | null> {
  try {
    const dataDir = process.env.DATA_DIR ?? "./data";
    const usersFile = `${dataDir}/users.json`;
    const raw = await fs.readFile(usersFile, "utf8");
    const users = JSON.parse(raw);
    const user = users.find((u: any) => u.id === userId);
    if (user?.encryptedApiKey) {
      return { provider: user.preferredProvider || "openai", apiKey: user.encryptedApiKey };
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  let body: AnalysisRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = req.headers.get("x-user-id") || null;

  const globalConfig = await loadGlobalConfig();
  let credentials: AIProviderCredentials | null = null;
  let providerId: string | null = null;

  if (globalConfig && globalConfig.apiKey && globalConfig.seal) {
    const hmac = createHmac("sha256", globalConfig.seal).update(globalConfig.apiKey).digest("hex");
    if (hmac === globalConfig.apiKey) {
      credentials = { apiKey: globalConfig.apiKey, global: true };
      providerId = globalConfig.provider;
    }
  }

  if (!credentials && userId) {
    const userKey = await loadUserKey(userId);
    if (userKey) {
      credentials = { apiKey: userKey.apiKey, global: false };
      providerId = userKey.provider;
    }
  }

  if (!credentials || !providerId) {
    return new Response(JSON.stringify({ error: "no BYOK key configured" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config: AIProviderConfig = {
    id: providerId as "openai" | "anthropic",
    model: body.model || (providerId === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini"),
    temperature: body.temperature,
    maxTokens: body.maxTokens,
    baseURL: body.baseURL,
  };

  const provider = createProvider(providerId as "openai" | "anthropic", config, credentials);
  if (!provider) {
    return new Response(JSON.stringify({ error: "unsupported provider" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let result: any;
  switch (body.type) {
    case "face":
      result = await provider.analyseFace(body.input as FaceAnalysisInput);
      break;
    case "voice":
      result = await provider.analyseVoice(body.input as VoiceAnalysisInput);
      break;
    case "speech":
      result = await provider.analyseSpeech(body.input as SpeechAnalysisInput);
      break;
    case "coaching":
      result = await provider.generateCoachingContext(body.input as CoachingContextInput);
      break;
    default:
      return new Response(JSON.stringify({ error: "unknown analysis type" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}