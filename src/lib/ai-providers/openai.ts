import { AIProvider, type AIProviderConfig, type AIProviderCredentials } from "@/lib/ai-provider";
import type { FaceAnalysisInput, FaceAnalysisResult, VoiceAnalysisInput, VoiceAnalysisResult, SpeechAnalysisInput, SpeechAnalysisResult, CoachingContextInput, CoachingContextResult, AIResult } from "@/lib/ai-provider";

export class OpenAIProvider extends AIProvider {
  private endpoint: string;

  constructor(config: AIProviderConfig, credentials: AIProviderCredentials) {
    super(config, credentials);
    const base = config.baseURL || "https://api.openai.com/v1";
    this.endpoint = `${base}/chat/completions`;
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
          Authorization: `Bearer ${this.credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: options?.temperature ?? this.config.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 500,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  async analyseFace(input: FaceAnalysisInput): Promise<AIResult<FaceAnalysisResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "openai" };

    try {
      const content = `Analyse this camera frame of a speaker during a ${this.config.model} session. Detected emotion: ${input.detectedEmotion} (${input.confidence}%). Return JSON only: {"emotion": "one of: neutral,happy,surprise,sad,angry,fear", "confidence": 0-100, "observation": "brief note"}. Do not add markdown.`;
      const text = await this.chat([
        { role: "system", content: "You are a vision-language assistant that analyses speaker emotion from webcam frames. Return only valid JSON." },
        { role: "user", content: content + "\nImage: " + input.imageDataUrl },
      ]);

      const parsed = this.safeParse<FaceAnalysisResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "openai" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "openai" };
    }
  }

  async analyseVoice(input: VoiceAnalysisInput): Promise<AIResult<VoiceAnalysisResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "openai" };

    try {
      const text = await this.chat([
        { role: "system", content: "You assess voice delivery from transcript and audio metrics. Return only valid JSON." },
        { role: "user", content: `Transcript: "${input.transcript}"\nAudio level dB: ${input.audioLevelDb}\nSpeaking time: ${input.speakingTimePct}%\nDuration: ${input.durationSec}s\nReturn JSON: {"sentiment": -1 to 1, "clarity": 0 to 1, "fillerAssessment": true/false, "observation": "brief note"}. No markdown.` },
      ]);

      const parsed = this.safeParse<VoiceAnalysisResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "openai" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "openai" };
    }
  }

  async analyseSpeech(input: SpeechAnalysisInput): Promise<AIResult<SpeechAnalysisResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "openai" };

    try {
      const text = await this.chat([
        { role: "system", content: "You analyse speech transcripts for coaching insight. Return only valid JSON." },
        { role: "user", content: `Transcript: "${input.transcript}"\nLanguage: ${input.language}\nDuration: ${input.durationSec}s\nWords: ${input.wordCount}\nReturn JSON: {"enhancedTranscript": "cleaned transcript", "refinements": ["suggestion"], "sentimentScore": -1 to 1, "keyPhrases": ["phrase"]}. No markdown.` },
      ]);

      const parsed = this.safeParse<SpeechAnalysisResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "openai" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "openai" };
    }
  }

  async generateCoachingContext(input: CoachingContextInput): Promise<AIResult<CoachingContextResult>> {
    if (!this.isAvailable()) return { ok: false, reason: "no api key", provider: "openai" };

    try {
      const text = await this.chat([
        { role: "system", content: "You are a speech coach. Return only valid JSON." },
        { role: "user", content: `Mode: ${input.mode}\nPillar scores: ${JSON.stringify(input.pillarScores)}\nDuration: ${input.durationSec}s\nTranscript: "${input.transcript}"\nReturn JSON: {"coachingAdvice": ["advice"], "recommendedFocus": ["focus"], "nextSessionTarget": "target"}. No markdown.` },
      ]);

      const parsed = this.safeParse<CoachingContextResult>(text);
      if (!parsed.ok) return parsed;
      return { ok: true, value: parsed.value, provider: "openai" };
    } catch (err) {
      return { ok: false, reason: String(err), provider: "openai" };
    }
  }

  private safeParse<T>(text: string): AIResult<T> {
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      const value = JSON.parse(cleaned) as T;
      return { ok: true, value, provider: "openai" };
    } catch {
      return { ok: false, reason: "failed to parse provider response", provider: "openai" };
    }
  }
}
