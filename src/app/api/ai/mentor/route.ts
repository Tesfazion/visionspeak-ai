import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listExternalAiKeys, getExternalAiKeyByHash, callLlm, touchExternalAiKey } from "@/lib/external-ai-keys";
import { MentorResponse } from "@/lib/external-ai-keys/types";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, sessionData, provider: requestedProvider, model: requestedModel } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return Response.json(
        { error: "sessionId is required." },
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

    // Get full key
    const fullKey = await getExternalAiKeyByHash(selectedKey.keyHash);
    if (!fullKey) {
      return Response.json({ error: "Key not found." }, { status: 404 });
    }

    // Build mentor prompt
    const mentorPrompt = `
You are a speech and communication coach. Analyze this session data and provide coaching insights and suggestions.

Session ID: ${sessionId}

Session data: ${JSON.stringify(sessionData, null, 2) || "(No session data provided - analyze based on context)"}

Provide:
1. 3-5 key insights about the speaker's strengths
2. 3-5 specific suggestions for improvement
3. A confidence grade from 1-10 on the overall session quality

Format your response as JSON with keys: insights (string[]), suggestions (string[]), grade (number 1-10).
`

    const messages = [
      { role: "system" as const, content: "You are an expert speech and communication coach AI. Analyze the provided data and output strictly valid JSON." },
      { role: "user" as const, content: mentorPrompt },
    ];

    const response = await callLlm(fullKey, {
      messages,
      model: requestedModel || fullKey.model,
      maxTokens: 1024,
      temperature: 0.2,
    });

    await touchExternalAiKey(fullKey.id);

    // The response content is JSON string - parse it
    let parsed: MentorResponse;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      // Fallback
      parsed = {
        insights: ["Could not parse AI response - please try again."],
        suggestions: ["Review your session data and try again."],
        grade: 5,
        model: response.model,
        provider: fullKey.provider,
      };
    }

    return Response.json({
      insights: parsed.insights,
      suggestions: parsed.suggestions,
      grade: parsed.grade,
      model: response.model,
      provider: fullKey.provider,
    });
  } catch (error) {
    console.error("[ai] mentor error", error);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}