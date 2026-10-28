/**
 * Speech-to-text + filler-word detection.
 *
 * Uses the browser's on-device recogniser (Chrome/Edge). When unavailable the
 * studio degrades gracefully: pace is estimated acoustically from the voice
 * engine and the transcript panel explains the limitation instead of faking it.
 */

export interface SpeechSnapshot {
  transcript: string;
  words: number;
  fillers: { word: string; count: number }[];
  totalFillers: number;
  fillerEvents: number[];
  supported: boolean;
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

const FILLER_PATTERNS: { word: string; re: RegExp }[] = [
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
];

export function recognizerAvailable() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export class SpeechEngine {
  private recognition: RecognitionLike | null = null;
  private active = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResultIndex = -1;

  private finalText = "";
  private wordCount = 0;
  private fillerCounts = new Map<string, number>();
  private fillerEvents: number[] = [];
  readonly supported = recognizerAvailable();

  onUpdate: (() => void) | null = null;

  start() {
    if (!this.supported) return;
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    this.active = true;
    this.recognition = new Ctor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        if (i <= this.lastResultIndex) continue;
        this.lastResultIndex = i;
        this.ingest(result[0].transcript);
      }
      this.onUpdate?.();
    };

    this.recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine; never surface them as errors.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
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

  private ingest(text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.finalText = `${this.finalText} ${clean}`.trim();
    this.wordCount += clean.split(/\s+/).filter(Boolean).length;

    for (const { word, re } of FILLER_PATTERNS) {
      re.lastIndex = 0;
      const matches = clean.match(re);
      if (!matches) continue;
      this.fillerCounts.set(word, (this.fillerCounts.get(word) ?? 0) + matches.length);
      for (let i = 0; i < matches.length; i++) this.fillerEvents.push(Date.now());
    }
  }

  fillersInWindow(windowMs: number) {
    const cutoff = Date.now() - windowMs;
    return this.fillerEvents.filter((t) => t >= cutoff).length;
  }

  /** Filler words per 100 spoken words — the fairer, length-normalised metric. */
  fillerDensity() {
    return this.wordCount > 0 ? (this.totalFillers() / this.wordCount) * 100 : 0;
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
      words: this.wordCount,
      fillers,
      totalFillers: this.totalFillers(),
      fillerEvents: this.fillerEvents,
      supported: this.supported,
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
