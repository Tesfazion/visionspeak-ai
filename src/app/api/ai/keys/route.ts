import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listExternalAiKeys, createExternalAiKey } from "@/lib/external-ai-keys/store";
import { isSupportedProvider } from "@/lib/external-ai-keys/types";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const keys = await listExternalAiKeys(user.id);
    return Response.json(keys);
  } catch (error) {
    console.error("[ai] GET error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const { provider, rawKey, label, model } = body;

    if (!provider || !isSupportedProvider(provider)) {
      return Response.json(
        { error: "Provider must be one of: openai, openrouter, anthropic." },
        { status: 400 }
      );
    }

    if (!rawKey || typeof rawKey !== "string") {
      return Response.json(
        { error: "API key is required." },
        { status: 400 }
      );
    }

    if (rawKey.length > 2048) {
      return Response.json({ error: "API key is too long." }, { status: 400 });
    }
    if (label !== undefined && (typeof label !== "string" || label.length > 80)) {
      return Response.json({ error: "Label must be 80 characters or fewer." }, { status: 400 });
    }
    if (model !== undefined && (typeof model !== "string" || !model.trim() || model.length > 120)) {
      return Response.json({ error: "Model must be 120 characters or fewer." }, { status: 400 });
    }

    const result = await createExternalAiKey(
      user.id,
      provider,
      rawKey.trim(),
      typeof label === "string" ? label.trim() : "",
      typeof model === "string" ? model.trim() : undefined,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("[ai] POST create key error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}