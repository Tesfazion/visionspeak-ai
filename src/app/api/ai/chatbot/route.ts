import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listExternalAiKeys, getExternalAiKeyByHash, callLlm, touchExternalAiKey } from "@/lib/external-ai-keys";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { message, history, provider: requestedProvider, model: requestedModel } = body;

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "message is required." },
        { status: 400 }
      );
    }

    // Find the user's external AI key
    const keys = await listExternalAiKeys(user.id);
    if (keys.length === 0) {
      return Response.json(
        { error: "No external AI key configured. Add one in Settings." },
        { status: 400 }
      );
    }

    // Select key: use requested provider if specified, otherwise first key
    let selectedKey = keys[0];
    if (requestedProvider) {
      const match = keys.find((k) => k.provider === requestedProvider);
      if (match) selectedKey = match;
    }

    // Get full key with apiKey
    const fullKey = await getExternalAiKeyByHash(selectedKey.keyHash);
    if (!fullKey) {
      return Response.json({ error: "Key not found." }, { status: 404 });
    }

    const messages = [
      { role: "system" as const, content: "You are a helpful AI assistant for VisionSpeak AI users." },
      ...(history || []),
      { role: "user" as const, content: message },
    ];

    const response = await callLlm(fullKey, {
      messages,
      model: requestedModel || fullKey.model,
      maxTokens: 1024,
      temperature: 0.7,
    });

    await touchExternalAiKey(fullKey.id);

    return Response.json({
      content: response.content,
      model: response.model,
      provider: fullKey.provider,
    });
  } catch (error) {
    console.error("[ai] chatbot error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}