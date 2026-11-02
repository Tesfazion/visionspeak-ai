"use client";

import type { FaceAnalysisInput, VoiceAnalysisInput, SpeechAnalysisInput, CoachingContextInput } from "@/lib/ai-provider";

/**
 * External AI client for BYOK sessions.
 *
 * Calls the server-side /api/byok/analyze route which holds the user's key.
 * Keys never cross the client boundary.
 */
export class ExternalAIClient {
  private base = "/api/byok/analyze";

  async analyse(input: AnalysisRequest) {
    const res = await fetch(this.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { ok: false, error: err.error ?? "external ai unavailable" };
    }

    const data = await res.json();
    return { ok: true, data };
  }

  /** Quick face analysis for live frame enrichment. */
  async analyseFace(imageDataUrl: string, detectedEmotion: string, confidence: number, t: number) {
    return this.analyse({
      type: "face",
      input: { imageDataUrl, detectedEmotion, confidence, t },
    });
  }

  /** Voice delivery analysis from transcript + audio metrics. */
  async analyseVoice(transcript: string, audioLevelDb: number, speakingTimePct: number, durationSec: number) {
    return this.analyse({
      type: "voice",
      input: { transcript, audioLevelDb, speakingTimePct, durationSec },
    });
  }

  /** Full transcript analysis for coaching insight. */
  async analyseSpeech(transcript: string, language: string, durationSec: number, wordCount: number) {
    return this.analyse({
      type: "speech",
      input: { transcript, language, durationSec, wordCount },
    });
  }

  /** Generate coaching context for live nudges or report plan. */
  async coachingContext(mode: string, pillarScores: Record<string, number>, nudgesFired: string[], durationSec: number, transcript: string) {
    return this.analyse({
      type: "coaching",
      input: { mode, pillarScores, nudgesFired, durationSec, transcript },
    });
  }
}

let singleton: ExternalAIClient | null = null;
export function getExternalAI(): ExternalAIClient {
  if (!singleton) singleton = new ExternalAIClient();
  return singleton;
}

/** Request shape for /api/byok/analyze POST. */
export interface AnalysisRequest {
  type: "face" | "voice" | "speech" | "coaching";
  input: FaceAnalysisInput | VoiceAnalysisInput | SpeechAnalysisInput | CoachingContextInput;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string;
}