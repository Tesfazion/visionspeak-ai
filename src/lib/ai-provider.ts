/**
 * External AI provider abstraction for BYOK integration.
 *
 * The platform keeps its on-device MediaPipe + Web Speech pipeline as default.
 * External AI is additive: when a provider + API key is configured, it can
 * augment on-device measurements with deeper analysis (transcript enrichment,
 * sentiment refinement, coaching context). Keys live server-side only.
 */

export type AIProviderId = "openai" | "anthropic" | "none";

export interface AIProviderConfig {
  id: AIProviderId;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Base URL override (useful for Azure, proxies, self-hosted). */
  baseURL?: string;
}

export interface AIProviderCredentials {
  apiKey: string;
  /** Set when the platform holds a global key instead of per-user keys. */
  global?: boolean;
}

export interface FaceAnalysisInput {
  /** Base64-encoded JPEG frame from the camera stream. */
  imageDataUrl: string;
  /** Current emotion from on-device detection. */
  detectedEmotion: string;
  /** Confidence 0-100. */
  confidence: number;
  /** Timestamp within session. */
  t: number;
}

export interface FaceAnalysisResult {
  emotion: string;
  confidence: number;
  /** Suggested UI label to override on-device emotion. */
  overrideLabel?: string;
  /** Notes about what the model observed. */
  observation?: string;
}

export interface VoiceAnalysisInput {
  transcript: string;
  audioLevelDb: number;
  speakingTimePct: number;
  durationSec: number;
}

export interface VoiceAnalysisResult {
  sentiment: number;
  /** -1 negative, 0 neutral, 1 positive */
  clarity: number;
  /** 0-1 score */
  fillerAssessment: boolean;
  observation?: string;
}

export interface SpeechAnalysisInput {
  transcript: string;
  language: string;
  durationSec: number;
  wordCount: number;
}

export interface SpeechAnalysisResult {
  enhancedTranscript?: string;
  /** Refinement suggestions for the coaching report. */
  refinements: string[];
  /** Deeper emotion/sentiment read beyond the on-device blendshape model. */
  sentimentScore: number;
  keyPhrases: string[];
}

export interface CoachingContextInput {
  mode: string;
  pillarScores: Record<string, number>;
  nudgesFired: string[];
  durationSec: number;
  transcript: string;
}

export interface CoachingContextResult {
  coachingAdvice: string[];
  recommendedFocus: string[];
  nextSessionTarget?: string;
}

/** Result of a provider call — either a value or a reason to fall back. */
export type AIResult<T> =
  | { ok: true; value: T; provider: AIProviderId }
  | { ok: false; reason: string; provider: AIProviderId };

export abstract class AIProvider {
  constructor(protected config: AIProviderConfig, protected credentials: AIProviderCredentials) {}

  /** Whether this provider is usable right now. */
  abstract isAvailable(): boolean;

  /** Analyse a single frame for emotion/refinement. */
  abstract analyseFace(input: FaceAnalysisInput): Promise<AIResult<FaceAnalysisResult>>;

  /** Analyse voice delivery from transcript + audio levels. */
  abstract analyseVoice(input: VoiceAnalysisInput): Promise<AIResult<VoiceAnalysisResult>>;

  /** Analyse full speech transcript for deeper insight. */
  abstract analyseSpeech(input: SpeechAnalysisInput): Promise<AIResult<SpeechAnalysisResult>>;

  /** Generate coaching context for the live session or report. */
  abstract generateCoachingContext(input: CoachingContextInput): Promise<AIResult<CoachingContextResult>>;
}
