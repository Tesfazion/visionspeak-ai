import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createRateLimiter } from "@/lib/auth-core";
import { listExternalAiKeys, getExternalAiKey, callLlm, touchExternalAiKey } from "@/lib/external-ai-keys";
import { isSupportedProvider, type MentorResponse } from "@/lib/external-ai-keys/types";
import { getSession } from "@/lib/store";

const mentorLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const gate = mentorLimiter.check(user.id);
  if (!gate.allowed) {
    return Response.json({ error: "Too many AI requests. Please wait a moment and try again." }, { status: 429 });
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
  const input = body as { sessionId?: unknown; keyId?: unknown; provider?: unknown; model?: unknown };
  if (typeof input.sessionId !== "string" || !input.sessionId.trim() || input.sessionId.length > 100) {
    return Response.json({ error: "A valid sessionId is required." }, { status: 400 });
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
    const session = await getSession(input.sessionId, user.id);
    if (!session || session.ownerId !== user.id || session.source !== "live") {
      return Response.json({ error: "Session not found." }, { status: 404 });
    }

    const keys = await listExternalAiKeys(user.id);
    if (keys.length === 0) {
      return Response.json({ error: "Add an AI provider key in Account settings to generate session feedback." }, { status: 400 });
    }
    const selected = input.keyId
      ? keys.find((key) => key.id === input.keyId)
      : keys.find((key) => !input.provider || key.provider === input.provider);
    if (!selected) return Response.json({ error: "Selected AI key was not found." }, { status: 404 });

    const fullKey = await getExternalAiKey(selected.id, user.id);
    if (!fullKey) return Response.json({ error: "Selected AI key was not found." }, { status: 404 });

    const sessionData = {
      title: session.title,
      mode: session.mode,
      durationSec: session.durationSec,
      report: {
        overall: session.report.overall,
        summary: session.report.summary,
        pillars: session.report.pillars,
        voice: {
          avgWpm: session.report.voice.avgWpm,
          speakingTimePct: session.report.voice.speakingTimePct,
          fillerRate: session.report.speech.fillerRate,
          totalFillers: session.report.speech.totalFillers,
        },
        strengths: session.report.strengths.map(({ title, detail }) => ({ title, detail })),
        improvements: session.report.improvements.map(({ title, detail }) => ({ title, detail })),
      },
    };

    const mentorPrompt = `Analyze this speaking session using its measured report data:
${JSON.stringify(sessionData)}

Return only JSON with keys: insights (3 concise strings), suggestions (3 specific actionable strings), grade (number 1-10). Do not claim measurements that are absent.`;
    let response;
    try {
      response = await callLlm(fullKey, {
        messages: [
          { role: "system", content: "You are an expert speaking coach. Return strictly valid JSON, with no markdown or extra text." },
          { role: "user", content: mentorPrompt },
        ],
        model: (input.model as string | undefined)?.trim() || fullKey.model,
        maxTokens: 1024,
        temperature: 0.2,
      });
    } catch (error) {
      console.error("[ai] provider mentor failed", error instanceof Error ? error.message : "unknown provider error");
      return Response.json({ error: "The AI provider could not analyze this session. Check the key and model in Account settings." }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return Response.json({ error: "The AI returned an unreadable analysis. Please try again." }, { status: 502 });
    }
    if (!parsed || typeof parsed !== "object") {
      return Response.json({ error: "The AI returned an invalid analysis. Please try again." }, { status: 502 });
    }
    const result = parsed as Partial<MentorResponse>;
    const validList = (value: unknown): value is string[] =>
      Array.isArray(value) && value.length >= 1 && value.length <= 5 &&
      value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 500);
    if (!validList(result.insights) || !validList(result.suggestions) ||
      typeof result.grade !== "number" || !Number.isFinite(result.grade) || result.grade < 1 || result.grade > 10) {
      return Response.json({ error: "The AI returned an incomplete analysis. Please try again." }, { status: 502 });
    }

    await touchExternalAiKey(fullKey.id);
    return Response.json({ insights: result.insights, suggestions: result.suggestions, grade: result.grade, model: response.model, provider: fullKey.provider });
  } catch (error) {
    console.error("[ai] mentor error", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not analyze the selected session." }, { status: 500 });
  }
}