/**
 * Speech-to-text + filler-word detection, multi-language.
 *
 * Uses the browser's on-device recogniser (Chrome/Edge). Two languages ship:
 * English (en-US) and Amharic (am-ET) — the recogniser's language is set per
 * session and the filler dictionary follows it. When unavailable the studio
 * degrades gracefully: pace is estimated acoustically from the voice engine
 * and the transcript panel explains the limitation instead of faking it.
 */

export type SpeechLanguage = "en-US" | "am-ET";

export interface SpeechLanguageOption {
  id: SpeechLanguage;
  /** Native endonym, shown in the picker. */
  label: string;
  /** English name for screen readers / tooltips. */
  english: string;
}

export const SPEECH_LANGUAGES: SpeechLanguageOption[] = [
  { id: "en-US", label: "English", english: "English" },
  { id: "am-ET", label: "አማርኛ", english: "Amharic" },
];

export interface SpeechSnapshot {
  transcript: string;
  interim?: string;
  words: number;
  fillers: { word: string; count: number }[];
  totalFillers: number;
  fillerEvents: number[];
  supported: boolean;
  language: SpeechLanguage;
}

interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface RecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

/*
 * Filler dictionaries. Amharic filled pauses: እንዴ (inədē), ኧረ/ኧው,
 * ታዲያ (taddiya "so/well"), ማለት ነው ("meaning"), እንደማለት ("as if to say"),
 * አይዞህ-style hedges. Note Amharic does not use Latin whitespace the same way —
 * the classic "፡" double-dot and "፣" comma act as clause separators, so the
 * word-boundary regex relies on `\b` over Ethiopic code points which JS
 * supports via the `u` flag.
 */
const FILLERS: Record<SpeechLanguage, { word: string; re: RegExp }[]> = {
  "en-US": [
    { word: "um", re: /\bum+\b/gi },
    { word: "uh", re: /\buh+\b/gi },
    { word: "er", re: /\b(?:er|erm)+\b/gi },
    { word: "ah", re: /\bah+\b/gi },
    { word: "hmm", re: /\bhmm+\b/gi },
    { word: "like", re: /\blike\b/gi },
    { word: "you know", re: /\byou know\b/gi },
    { word: "i mean", re: /\bi mean\b/gi },
    { word: "basically", re: /\bbasically\b/gi },
    { word: "actually", re: /\bactually\b/gi },
    { word: "literally", re: /\bliterally\b/gi },
    { word: "sort of", re: /\bsort of\b/gi },
    { word: "kind of", re: /\bkind of\b/gi },
    { word: "right", re: /\bright\s*[,?]/gi },
  ],
  "am-ET": [
    { word: "እንዴ", re: /እንዴ+/gu },
    { word: "ኧረ", re: /ኧረ+/gu },
    { word: "እሺ", re: /እሺ+/gu },
    { word: "ታዲያ", re: /ታዲያ+/gu },
    { word: "ማለት ነው", re: /ማለት\s*ነው/gu },
    { word: "እንደማለት", re: /እንደማለት/gu },
    { word: "ወይ", re: /ወይ+/gu },
    { word: "እኮ", re: /እኮ+/gu },
    { word: "ግን", re: /(?<![^\s፡፣])ግን(?=\s|፡|፣|$)/gu },
  ],
};

const FILLERS_BY_LANG = FILLERS;

export function recognizerAvailable() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export class SpeechEngine {
  private recognition: RecognitionLike | null = null;
  private active = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResultIndex = -1;
  private language: SpeechLanguage = "en-US";

  private finalText = "";
  private interimText = "";
  private wordCount = 0;
  private fillerCounts = new Map<string, number>();
  private fillerEvents: number[] = [];
  readonly supported = recognizerAvailable();

  onUpdate: (() => void) | null = null;

  start(language: SpeechLanguage = "en-US") {
    if (!this.supported) return;
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    this.language = language;
    this.active = true;
    // A restart after a language switch begins a fresh stream — text already
    // captured is preserved, only the recogniser's input language changes.
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = language;
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          interim += result[0].transcript;
          continue;
        }
        if (i <= this.lastResultIndex) continue;
        this.lastResultIndex = i;
        let best = result[0];
        for (let a = 1; a < result.length; a++) {
          if (result[a].confidence > best.confidence) best = result[a];
        }
        this.ingest(best.transcript);
      }
      this.interimText = interim.trim();
      this.onUpdate?.();
    };

    this.recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine; never surface them as errors.
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        this.active = false;
      }
    };

    this.recognition.onend = () => {
      if (!this.active) return;
      this.lastResultIndex = -1;
      this.restartTimer = setTimeout(() => {
        try {
          this.recognition?.start();
        } catch {
          /* Chrome throws if start is called while running */
        }
      }, 350);
    };

    try {
      this.recognition.start();
    } catch {
      this.active = false;
    }
  }

  /** Switch recogniser language mid-session without losing captured text. */
  setLanguage(language: SpeechLanguage) {
    if (language === this.language) return;
    this.language = language;
    if (!this.active || !this.recognition) return;
    // abort() drops the old stream immediately; onend is suppressed because
    // active stays true — we restart synchronously with the new lang.
    this.recognition.onend = null;
    try {
      this.recognition.abort();
    } catch {
      /* already stopped */
    }
    this.lastResultIndex = -1;
    this.recognition.lang = language;
    try {
      this.recognition.start();
    } catch {
      /* Chrome throws if start is called while running */
    }
  }

  getLanguage() {
    return this.language;
  }

  private ingest(text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.finalText = `${this.finalText} ${clean}`.trim();
    // Amharic text segmented by "፡" still splits on whitespace cleanly via the
    // recogniser's own tokenisation; fall back to any whitespace run.
    this.wordCount += clean.split(/\s+/).filter(Boolean).length;

    for (const { word, re } of FILLERS_BY_LANG[this.language] ??
      FILLERS_BY_LANG["en-US"]) {
      re.lastIndex = 0;
      const matches = clean.match(re);
      if (!matches) continue;
      this.fillerCounts.set(
        word,
        (this.fillerCounts.get(word) ?? 0) + matches.length,
      );
      for (let i = 0; i < matches.length; i++)
        this.fillerEvents.push(Date.now());
    }
  }

  fillersInWindow(windowMs: number) {
    const cutoff = Date.now() - windowMs;
    return this.fillerEvents.filter((t) => t >= cutoff).length;
  }

  /** Filler words per 100 spoken words — the fairer, length-normalised metric. */
  fillerDensity() {
    return this.wordCount > 0
      ? (this.totalFillers() / this.wordCount) * 100
      : 0;
  }

  totalFillers() {
    let total = 0;
    for (const v of this.fillerCounts.values()) total += v;
    return total;
  }

  snapshot(): SpeechSnapshot {
    const fillers = [...this.fillerCounts.entries()]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count);
    return {
      transcript: this.finalText,
      interim: this.interimText,
      words: this.wordCount,
      fillers,
      totalFillers: this.totalFillers(),
      fillerEvents: this.fillerEvents,
      supported: this.supported,
      language: this.language,
    };
  }

  stop() {
    this.active = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.recognition = null;
  }
}
