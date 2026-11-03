import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listExternalAiKeys, createExternalAiKey } from "@/lib/external-ai-keys/store";
import { isSupportedProvider } from "@/lib/external-ai-keys/types";

export async function GET(request: NextRequest) {
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

    const body = await request.json();
    const { provider, rawKey, label } = body;

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

    const result = await createExternalAiKey(user.id, provider, rawKey, label);
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("[ai] POST create key error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}