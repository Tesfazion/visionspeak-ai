import { AIProvider, type AIProviderConfig, type AIProviderCredentials } from "@/lib/ai-provider";
import type { FaceAnalysisInput, FaceAnalysisResult, VoiceAnalysisInput, VoiceAnalysisResult, SpeechAnalysisInput, SpeechAnalysisResult, CoachingContextInput, CoachingContextResult, AIResult } from "@/lib/ai-provider";

export class AnthropicProvider extends AIProvider {
  private endpoint: string;

  constructor(config: AIProviderConfig, credentials: AIProviderCredentials) {
    super(config, credentials);
    const base = config.baseURL || "https://api.anthropic.com/v1";
    this.endpoint = `${base}/messages`;
  }

  isAvailable(): boolean {
    return Boolean(this.credentials.apiKey);
  }

  private async chat(messages: { role: string; content: string }[], options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "x-api-key": this.credentials.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          system: "You are a vision and speech analysis assistant for a public-speaking coaching platform. Return only valid JSON, no markdown.",
          messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          temperature: options?.temperature ?? this.config.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 500,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return data.content?.[0]?.text ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  async analyseFace(input: FaceAnalysisInput): Promise<AIResult<FaceAnalysisResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "anthropic" };

    try {
      const text = await this.chat([
        { role: "user", content: `Analyse this camera frame. Detected emotion: ${input.detectedEmotion} (${input.confidence}%). Image: ${input.imageDataUrl}. Return JSON: {"emotion": "neutral|happy|surprise|sad|angry|fear", "confidence": 0-100, "observation": "brief note"}. No markdown.` },
      ]);

      const parsed = this.safeParse<FaceAnalysisResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "anthropic" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "anthropic" };
    }
  }

  async analyseVoice(input: VoiceAnalysisInput): Promise<AIResult<VoiceAnalysisResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "anthropic" };

    try {
      const text = await this.chat([
        { role: "user", content: `Assess voice delivery.\nTranscript: "${input.transcript}"\nAudio level dB: ${input.audioLevelDb}\nSpeaking time: ${input.speakingTimePct}%\nDuration: ${input.durationSec}s\nReturn JSON: {"sentiment": -1 to 1, "clarity": 0 to 1, "fillerAssessment": true/false, "observation": "brief note"}. No markdown.` },
      ]);

      const parsed = this.safeParse<VoiceAnalysisResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "anthropic" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "anthropic" };
    }
  }

  async analyseSpeech(input: SpeechAnalysisInput): Promise<AIResult<SpeechAnalysisResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "anthropic" };

    try {
      const text = await this.chat([
        { role: "user", content: `Analyse speech transcript.\nTranscript: "${input.transcript}"\nLanguage: ${input.language}\nDuration: ${input.durationSec}s\nWords: ${input.wordCount}\nReturn JSON: {"enhancedTranscript": "cleaned transcript", "refinements": ["suggestion"], "sentimentScore": -1 to 1, "keyPhrases": ["phrase"]}. No markdown.` },
      ]);

      const parsed = this.safeParse<SpeechAnalysisResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "anthropic" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "anthropic" };
    }
  }

  async generateCoachingContext(input: CoachingContextInput): Promise<AIResult<CoachingContextResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "anthropic" };

    try {
      const text = await this.chat([
        { role: "user", content: `Coaching context.\nMode: ${input.mode}\nPillar scores: ${JSON.stringify(input.pillarScores)}\nDuration: ${input.durationSec}s\nTranscript: "${input.transcript}"\nReturn JSON: {"coachingAdvice": ["advice"], "recommendedFocus": ["focus"], "nextSessionTarget": "target"}. No markdown.` },
      ]);

      const parsed = this.safeParse<CoachingContextResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "anthropic" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "anthropic" };
    }
  }

  private safeParse<T>(text: string): AIResult<T> {
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const value = JSON.parse(cleaned) as T;
      return { ok: true, value, provider: "anthropic" };
    } catch {
      return { ok: false, reason: "failed to parse provider response", provider: "anthropic" };
    }
  }
}
