/**
 * Voice analytics built on the Web Audio API (Librosa's job, in the browser).
 *
 * Measures loudness, vocal energy, speaking/silence ratio, pause structure,
 * pitch variation (semitone spread) and an acoustic syllable estimate that
 * stands in for a transcript-based speaking rate on browsers without the
 * Web Speech API.
 */
import { clamp, ema, mean, percentile, std } from "@/lib/math";

export interface VoiceReading {
  db: number;
  rms: number;
  speaking: boolean;
  pitchHz: number;
  pitchVariation: number;
  volumeConsistency: number;
  energy: number;
  speakingTimePct: number;
  pauseCount: number;
  longPauseCount: number;
  avgPauseSec: number;
  syllables: number;
}

const F0_MIN = 85;
const F0_MAX = 350;

export class VoiceEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buf = new Float32Array(1024);

  private startedAt = 0;
  private frame = 0;

  private speaking = false;
  private noiseFloor = 0.004;
  private floorWindow: number[] = [];

  private rmsHist: number[] = [];
  private dbHist: number[] = [];
  private pitchHist: number[] = [];
  private pitchSmooth = 0;

  private speakingMs = 0;
  private totalMs = 0;
  private lastTick = 0;

  private pauseStart = 0;
  private pauses: number[] = [];
  private currentPause = 0;

  private envelope = 0;
  private lastSyllableAt = 0;
  private syllableCount = 0;

  constructor(private stream: MediaStream) {}

  async start() {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.source.connect(this.analyser);
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
  }

  /** Called from the render loop; cheap enough to run at 15-20 Hz. */
  sample(now = performance.now(), countSyllables = true): VoiceReading {
    this.frame++;
    if (!this.analyser) return this.empty();

    const dt = Math.min(250, Math.max(0, now - this.lastTick));
    this.lastTick = now;
    this.totalMs += dt;

    this.analyser.getFloatTimeDomainData(this.buf);
    const rms = Math.sqrt(mean(Array.from(this.buf, (v) => v * v)));
    const db = 20 * Math.log10(Math.max(rms, 1e-6));

    // Track the room's noise floor so quiet speakers still register.
    this.floorWindow.push(rms);
    if (this.floorWindow.length > 90) this.floorWindow.shift();
    this.noiseFloor = ema(this.noiseFloor, Math.max(0.0012, percentile(this.floorWindow, 0.12)), 0.02);

    const enter = Math.max(0.0055, this.noiseFloor * 3.1);
    const exit = enter * 0.62;
    const wasSpeaking = this.speaking;
    if (!this.speaking && rms > enter) this.speaking = true;
    else if (this.speaking && rms < exit) this.speaking = false;

    if (this.speaking) this.speakingMs += dt;

    // Pause bookkeeping.
    if (wasSpeaking && !this.speaking) {
      this.pauseStart = now;
      this.currentPause = 0;
    } else if (this.speaking && !wasSpeaking && this.pauseStart) {
      const dur = (now - this.pauseStart) / 1000;
      if (dur >= 0.45) this.pauses.push(dur);
      this.pauseStart = 0;
    }

    this.rmsHist.push(rms);
    if (this.rmsHist.length > 220) this.rmsHist.shift();
    if (this.speaking) {
      this.dbHist.push(db);
      if (this.dbHist.length > 220) this.dbHist.shift();
    }

    // Pitch: expensive, so every third frame (~5 Hz when called at 15 Hz).
    if (this.speaking && this.frame % 3 === 0) {
      const f0 = this.detectPitch();
      if (f0 > 0) {
        this.pitchSmooth = this.pitchSmooth ? ema(this.pitchSmooth, f0, 0.4) : f0;
        this.pitchHist.push(f0);
        if (this.pitchHist.length > 60) this.pitchHist.shift();
      }
    }

    // Acoustic syllable nuclei: fast envelope rises while voiced.
    this.envelope = ema(this.envelope, rms, 0.35);
    if (countSyllables && this.speaking && rms > this.envelope * 1.28 && now - this.lastSyllableAt > 115) {
      this.syllableCount++;
      this.lastSyllableAt = now;
    }

    const elapsedSec = this.totalMs / 1000;
    return {
      db,
      rms,
      speaking: this.speaking,
      pitchHz: this.pitchSmooth,
      pitchVariation: this.pitchVariation(),
      volumeConsistency: this.volumeConsistency(),
      energy: clamp(((db + 55) / 40) * 100),
      speakingTimePct: elapsedSec > 0 ? clamp((this.speakingMs / 1000 / elapsedSec) * 100) : 0,
      pauseCount: this.pauses.length,
      longPauseCount: this.pauses.filter((p) => p >= 2).length,
      avgPauseSec: this.pauses.length ? mean(this.pauses) : 0,
      syllables: this.syllableCount,
    };
  }

  /** Semitone spread of the last ~12s of voiced audio. */
  private pitchVariation() {
    if (this.pitchHist.length < 6) return 0;
    const semis = this.pitchHist.map((f) => 12 * Math.log2(f / 110));
    return Math.round(std(semis) * 10) / 10;
  }

  private volumeConsistency() {
    if (this.dbHist.length < 12) return 70;
    const sd = std(this.dbHist);
    return clamp(100 - sd * 5.5);
  }

  /**
   * Normalised autocorrelation pitch detection over a 1024-sample window.
   * Returns 0 for unvoiced frames.
   */
  private detectPitch() {
    if (!this.ctx) return 0;
    const sr = this.ctx.sampleRate;
    const data = this.buf;
    const n = Math.min(1024, data.length);
    let energy = 0;
    for (let i = 0; i < n; i++) energy += data[i] * data[i];
    if (energy / n < 4e-5) return 0;

    const minLag = Math.floor(sr / F0_MAX);
    const maxLag = Math.min(Math.floor(sr / F0_MIN), n - 2);
    let bestLag = -1;
    let bestCorr = 0;
    let prev = 0;
    let falling = true;

    for (let lag = minLag; lag < maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < n - lag; i += 2) corr += data[i] * data[i + lag];
      corr /= n - lag;

      // Skip the zero-lag lobe before looking for the strongest peak.
      if (falling && corr < prev) {
        falling = false;
      } else if (falling) {
        prev = corr;
        continue;
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
      prev = corr;
    }

    if (bestLag < 0) return 0;
    const rms = Math.sqrt(energy / n);
    // Autocorrelation peak must be a meaningful share of frame energy.
    if (bestCorr < rms * rms * 0.35) return 0;

    const f0 = sr / bestLag;
    return f0 >= F0_MIN && f0 <= F0_MAX ? Math.round(f0 * 10) / 10 : 0;
  }

  snapshot() {
    const elapsed = this.totalMs / 1000;
    return {
      speakingTimePct: elapsed > 0 ? clamp((this.speakingMs / 1000 / elapsed) * 100) : 0,
      avgDb: this.dbHist.length ? mean(this.dbHist) : -60,
      volumeConsistency: this.volumeConsistency(),
      pitchVariation: this.pitchVariation(),
      pauseCount: this.pauses.length,
      longPauseCount: this.pauses.filter((p) => p >= 2).length,
      avgPauseSec: this.pauses.length ? mean(this.pauses) : 0,
      energy: this.dbHist.length ? clamp(((mean(this.dbHist) + 55) / 40) * 100) : 0,
      syllables: this.syllableCount,
      elapsed,
    };
  }

  private empty(): VoiceReading {
    return {
      db: -100,
      rms: 0,
      speaking: false,
      pitchHz: 0,
      pitchVariation: 0,
      volumeConsistency: 0,
      energy: 0,
      speakingTimePct: 0,
      pauseCount: 0,
      longPauseCount: 0,
      avgPauseSec: 0,
      syllables: 0,
    };
  }

  dispose() {
    try {
      this.source?.disconnect();
      this.analyser?.disconnect();
      void this.ctx?.close();
    } catch {
      /* already torn down */
    }
    this.ctx = null;
    this.analyser = null;
    this.source = null;
  }
}
