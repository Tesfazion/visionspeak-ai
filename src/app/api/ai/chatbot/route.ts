import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createRateLimiter } from "@/lib/auth-core";
import { listExternalAiKeys, getExternalAiKey, callLlm, touchExternalAiKey } from "@/lib/external-ai-keys";
import { isSupportedProvider } from "@/lib/external-ai-keys/types";

const chatLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const gate = chatLimiter.check(user.id);
  if (!gate.allowed) {
    return Response.json(
      { error: "Too many AI requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const input = body as {
    message?: unknown;
    history?: unknown;
    keyId?: unknown;
    provider?: unknown;
    model?: unknown;
  };
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 4000) {
    return Response.json({ error: "Message must contain 1–4000 characters." }, { status: 400 });
  }

  const history = input.history ?? [];
  if (!Array.isArray(history) || history.length > 20 || history.some((item) =>
    !item || typeof item !== "object" ||
    !["user", "assistant"].includes((item as { role?: string }).role ?? "") ||
    typeof (item as { content?: unknown }).content !== "string" ||
    ((item as { content: string }).content.length > 4000)
  )) {
    return Response.json({ error: "Conversation history is invalid or too long." }, { status: 400 });
  }
  if (history.reduce((size, item) => size + (item as { content: string }).content.length, 0) > 12_000) {
    return Response.json({ error: "Conversation history is too long." }, { status: 400 });
  }
  if (input.provider !== undefined && !isSupportedProvider(input.provider)) {
    return Response.json({ error: "Unsupported AI provider." }, { status: 400 });
  }
  if (input.keyId !== undefined && (typeof input.keyId !== "string" || input.keyId.length > 80)) {
    return Response.json({ error: "Invalid AI key selection." }, { status: 400 });
  }
  if (input.model !== undefined && (typeof input.model !== "string" || !input.model.trim() || input.model.length > 120)) {
    return Response.json({ error: "Model must be 120 characters or fewer." }, { status: 400 });
  }

  try {
    const keys = await listExternalAiKeys(user.id);
    if (keys.length === 0) {
      return Response.json({ error: "Add an AI provider key in Account settings to start chatting." }, { status: 400 });
    }

    const selected = input.keyId
      ? keys.find((key) => key.id === input.keyId)
      : keys.find((key) => !input.provider || key.provider === input.provider);
    if (!selected) return Response.json({ error: "Selected AI key was not found." }, { status: 404 });

    const fullKey = await getExternalAiKey(selected.id, user.id);
    if (!fullKey) return Response.json({ error: "Selected AI key was not found." }, { status: 404 });

    let response;
    try {
      response = await callLlm(fullKey, {
        messages: [
          { role: "system", content: "You are VisionSpeak's speaking practice assistant. Give concise, practical and supportive advice." },
          ...history as Array<{ role: "user" | "assistant"; content: string }>,
          { role: "user", content: input.message.trim() },
        ],
        model: (input.model as string | undefined)?.trim() || fullKey.model,
        maxTokens: 1024,
        temperature: 0.7,
      });
    } catch (error) {
      console.error("[ai] provider chat failed", error instanceof Error ? error.message : "unknown provider error");
      return Response.json({ error: "The AI provider could not complete this request. Check the key and model in Account settings." }, { status: 502 });
    }
    if (!response.content.trim()) {
      return Response.json({ error: "The AI provider returned an empty reply. Please try again." }, { status: 502 });
    }

    await touchExternalAiKey(fullKey.id);
    return Response.json({ content: response.content, model: response.model, provider: fullKey.provider });
  } catch (error) {
    console.error("[ai] chatbot error", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not complete the AI request." }, { status: 500 });
  }
}