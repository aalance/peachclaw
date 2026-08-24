// Text-to-speech for the desktop pet. Lets the pet "speak" its replies aloud.
//
// The engine is pluggable: the default routes through the browser's built-in
// SpeechSynthesis (free, offline, no API key — uses the OS voices, e.g. Windows
// SAPI Chinese voices). A `MossTTSEngine` calls a local MOSS-TTS-Nano server for
// high-quality neural speech, and a `CloudTTSEngine` stub is kept for a future
// hosted voice. The engine is picked in createEngine() so call sites never change.

import {
  briefSpeechText,
  defaultMossConfig,
  type MossTtsConfig,
  MossSpeakScope,
  splitForSpeech,
} from '../../shared/tts/constants';

export type TTSEngineKind = 'system' | 'cloud' | 'moss';

export interface VoiceSettings {
  /** Master switch: when false the pet stays silent. */
  enabled: boolean;
  /** Which backend produces the audio. 'cloud' currently falls back to 'system'. */
  engine: TTSEngineKind;
  /** Selected voice for the system engine (SpeechSynthesisVoice.voiceURI), or null for OS default. */
  voiceURI: string | null;
  /** Speaking rate, 0.5–2 (1 = normal). */
  rate: number;
  /** Pitch, 0–2 (1 = normal). Not supported by the MOSS engine. */
  pitch: number;
  /** Volume, 0–1. */
  volume: number;
  /** MOSS-TTS-Nano server connection + generation config (used when engine === 'moss'). */
  moss: MossTtsConfig;
}

export interface TTSVoiceOption {
  uri: string;
  label: string;
  lang: string;
}

/** Optional lifecycle hooks so the caller can drive the "talk" animation. */
export interface SpeakHooks {
  onStart?: () => void;
  onEnd?: () => void;
  /** Fired when synthesis/playback fails (e.g. MOSS server unreachable). */
  onError?: (err: unknown) => void;
}

export interface TTSEngine {
  speak(text: string, settings: VoiceSettings, hooks?: SpeakHooks): void;
  stop(): void;
  isSpeaking(): boolean;
  listVoices(): Promise<TTSVoiceOption[]>;
}

const VOICE_SETTINGS_KEY = 'desktop_pet_voice';

export const defaultVoiceSettings = (): VoiceSettings => ({
  enabled: false,
  engine: 'system',
  voiceURI: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  moss: defaultMossConfig(),
});

const clamp = (value: number, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value : fallback;

const normalizeMossConfig = (value: unknown): MossTtsConfig => {
  const base = defaultMossConfig();
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<MossTtsConfig>;
  return {
    baseUrl: str(v.baseUrl, base.baseUrl),
    endpoint: str(v.endpoint, base.endpoint),
    demoId: str(v.demoId, base.demoId),
    // May legitimately be empty (= use the preset voice).
    promptAudioPath: typeof v.promptAudioPath === 'string' ? v.promptAudioPath : base.promptAudioPath,
    scope: v.scope === MossSpeakScope.Full ? MossSpeakScope.Full : MossSpeakScope.Brief,
  };
};

const normalizeVoiceSettings = (value: unknown): VoiceSettings => {
  const base = defaultVoiceSettings();
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<VoiceSettings>;
  const engine: TTSEngineKind =
    v.engine === 'cloud' || v.engine === 'moss' ? v.engine : 'system';
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : base.enabled,
    engine,
    voiceURI: typeof v.voiceURI === 'string' && v.voiceURI ? v.voiceURI : null,
    rate: clamp(v.rate as number, 0.5, 2, base.rate),
    pitch: clamp(v.pitch as number, 0, 2, base.pitch),
    volume: clamp(v.volume as number, 0, 1, base.volume),
    moss: normalizeMossConfig(v.moss),
  };
};

// Strip things that sound bad read aloud: code fences, inline code, link URLs,
// markdown markers, emoji, and collapse whitespace. Keeps the spoken text natural
// while leaving the on-screen bubble untouched.
export const sanitizeForSpeech = (raw: string): string => {
  if (!raw) return '';
  let text = raw;
  // Fenced code blocks → drop entirely.
  text = text.replace(/```[\s\S]*?```/g, ' ');
  // Inline code → keep the inner text without the backticks.
  text = text.replace(/`([^`]+)`/g, '$1');
  // Markdown links [label](url) → just the label.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Bare URLs → drop.
  text = text.replace(/https?:\/\/\S+/g, ' ');
  // Emphasis / heading / list markers at the start of lines or around words.
  text = text.replace(/[*_#>]+/g, ' ');
  // Emoji, pictographs and standalone symbols (✅ ★ ☀) have no pronunciation, and
  // a fragment holding only these makes MOSS babble for tens of seconds.
  text = text.replace(/[\p{Extended_Pictographic}\p{So}]/gu, ' ');
  // Skin-tone modifiers, variation selectors, ZWJ, keycaps and flag halves.
  text = text.replace(/[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu, '');
  // Decorative tildes ("你好呀～") and ellipses ("嗯……") are the two worst
  // babble triggers in practice — measured 30s and 22s of nonsense respectively.
  text = text.replace(/[～~]+/g, '');
  text = text.replace(/…+/g, '，');
  // Collapse whitespace.
  text = text.replace(/\s+/g, ' ').trim();
  return text;
};

class SystemTTSEngine implements TTSEngine {
  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null;
  }

  // getVoices() is often empty until the engine fires 'voiceschanged'; wait for it.
  private loadRawVoices(): Promise<SpeechSynthesisVoice[]> {
    const synth = this.synth;
    if (!synth) return Promise.resolve([]);
    const existing = synth.getVoices();
    if (existing.length > 0) return Promise.resolve(existing);
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(synth.getVoices());
      };
      synth.addEventListener('voiceschanged', finish, { once: true });
      // Fallback in case the event never fires.
      window.setTimeout(finish, 1000);
    });
  }

  async listVoices(): Promise<TTSVoiceOption[]> {
    const voices = await this.loadRawVoices();
    return voices.map((v) => ({
      uri: v.voiceURI,
      label: `${v.name}${v.lang ? ` (${v.lang})` : ''}`,
      lang: v.lang,
    }));
  }

  speak(text: string, settings: VoiceSettings, hooks?: SpeakHooks): void {
    const synth = this.synth;
    if (!synth) {
      hooks?.onEnd?.();
      return;
    }
    // Interrupt whatever is currently being said.
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    if (settings.voiceURI) {
      const match = synth.getVoices().find((v) => v.voiceURI === settings.voiceURI);
      if (match) {
        utterance.voice = match;
        utterance.lang = match.lang;
      }
    }

    if (hooks?.onStart) utterance.onstart = () => hooks.onStart?.();
    if (hooks?.onEnd) {
      utterance.onend = () => hooks.onEnd?.();
      utterance.onerror = () => hooks.onEnd?.();
    }

    synth.speak(utterance);
  }

  stop(): void {
    this.synth?.cancel();
  }

  isSpeaking(): boolean {
    return this.synth?.speaking ?? false;
  }
}

// Placeholder for a future high-quality network voice. The interface is complete
// so call sites never change; until a real implementation lands it delegates to
// the system engine so the feature still works end to end.
class CloudTTSEngine implements TTSEngine {
  constructor(private readonly fallback: TTSEngine) {}

  // TODO: call a cloud TTS API (OpenAI TTS / ElevenLabs / Azure), stream the
  // returned audio through an <audio> / AudioContext, and drive hooks from its
  // play/ended events. For now we reuse the system voice.
  speak(text: string, settings: VoiceSettings, hooks?: SpeakHooks): void {
    this.fallback.speak(text, settings, hooks);
  }

  stop(): void {
    this.fallback.stop();
  }

  isSpeaking(): boolean {
    return this.fallback.isSpeaking();
  }

  listVoices(): Promise<TTSVoiceOption[]> {
    return this.fallback.listVoices();
  }
}

// High-quality neural voice backed by a local MOSS-TTS-Nano HTTP server. The
// network call runs in the Electron main process (window.electron.tts.synthesize)
// to sidestep renderer CORS; here we play back the returned audio and drive the
// talk-animation hooks from the <audio> element's events.
//
// Synthesis is pipelined per sentence: chunk N+1 is requested while chunk N is
// playing, so the pet starts talking after the first sentence instead of after
// the whole reply (which for a long answer meant many seconds of silence).
class MossTTSEngine implements TTSEngine {
  private current: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private token = 0;

  private cleanup(): void {
    if (this.current) {
      this.current.onplaying = null;
      this.current.onended = null;
      this.current.onerror = null;
      try {
        this.current.pause();
      } catch {
        // ignore
      }
      this.current.src = '';
      this.current = null;
    }
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  /** Play one synthesised chunk, resolving when it finishes (or fails). */
  private playChunk(
    audioBase64: string,
    mime: string,
    settings: VoiceSettings,
    isCurrent: () => boolean,
    onFirstPlay?: () => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/wav' }));
        const audio = new Audio(url);
        audio.volume = settings.volume;
        // MOSS has no pitch control; approximate rate via playbackRate.
        audio.playbackRate = settings.rate;
        this.current = audio;
        this.currentUrl = url;

        audio.onplaying = () => onFirstPlay?.();
        audio.onended = () => {
          if (isCurrent()) this.cleanup();
          resolve();
        };
        audio.onerror = () => {
          if (isCurrent()) this.cleanup();
          reject(audio.error ?? new Error('audio playback failed'));
        };
        void audio.play().catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  speak(text: string, settings: VoiceSettings, hooks?: SpeakHooks): void {
    // Interrupt anything in flight (both pending requests and current playback).
    this.stop();
    const myToken = ++this.token;
    // Terminal hooks fire only while this call is still the active one, so a
    // superseded utterance never stomps a newer one's talk animation.
    const isCurrent = () => myToken === this.token;
    const end = () => {
      if (isCurrent()) hooks?.onEnd?.();
    };
    const fail = (err: unknown) => {
      if (!isCurrent()) return;
      hooks?.onError?.(err);
      hooks?.onEnd?.();
    };

    const chunks = splitForSpeech(
      settings.moss.scope === MossSpeakScope.Full ? text : briefSpeechText(text),
    );
    if (chunks.length === 0) {
      hooks?.onEnd?.();
      return;
    }

    const synth = (chunk: string) => window.electron.tts.synthesize(chunk, settings.moss);

    void (async () => {
      try {
        let pending = synth(chunks[0]);
        let announced = false;
        for (let i = 0; i < chunks.length; i++) {
          const result = await pending;
          if (!isCurrent()) return;
          // Kick off the next request before playing this one, so synthesis and
          // playback overlap instead of running end to end.
          if (i + 1 < chunks.length) pending = synth(chunks[i + 1]);
          if (!result.ok || !result.audioBase64) {
            fail(result.error ?? 'MOSS synthesis failed');
            return;
          }
          await this.playChunk(result.audioBase64, result.mime || 'audio/wav', settings, isCurrent, () => {
            if (!announced) {
              announced = true;
              hooks?.onStart?.();
            }
          });
          if (!isCurrent()) return;
        }
        end();
      } catch (err) {
        if (isCurrent()) this.cleanup();
        fail(err);
      }
    })();
  }

  stop(): void {
    // Bump the token so any in-flight request/playback callbacks become no-ops.
    this.token++;
    this.cleanup();
  }

  isSpeaking(): boolean {
    return !!this.current && !this.current.paused;
  }

  // MOSS voices are server-side reference speakers configured by id, so there is
  // no browser voice list to enumerate; the settings UI uses a text field instead.
  listVoices(): Promise<TTSVoiceOption[]> {
    return Promise.resolve([]);
  }
}

const systemEngine = new SystemTTSEngine();
const cloudEngine = new CloudTTSEngine(systemEngine);
const mossEngine = new MossTTSEngine();

const createEngine = (kind: TTSEngineKind): TTSEngine => {
  if (kind === 'moss') return mossEngine;
  if (kind === 'cloud') return cloudEngine;
  return systemEngine;
};

class TtsService {
  async getSettings(): Promise<VoiceSettings> {
    const stored = await window.electron.store.get(VOICE_SETTINGS_KEY);
    return normalizeVoiceSettings(stored);
  }

  async setSettings(settings: VoiceSettings): Promise<VoiceSettings> {
    const normalized = normalizeVoiceSettings(settings);
    await window.electron.store.set(VOICE_SETTINGS_KEY, normalized);
    return normalized;
  }

  listVoices(engine: TTSEngineKind = 'system'): Promise<TTSVoiceOption[]> {
    return createEngine(engine).listVoices();
  }

  /** Speak a reply using the persisted settings. No-op when voice is disabled. */
  async speak(text: string, hooks?: SpeakHooks): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.enabled) return;
    const clean = sanitizeForSpeech(text);
    if (!clean) return;
    createEngine(settings.engine).speak(clean, settings, hooks);
  }

  /** Speak a sample with explicit settings, ignoring the enabled flag (for the settings preview). */
  preview(text: string, settings: VoiceSettings, hooks?: SpeakHooks): void {
    const clean = sanitizeForSpeech(text) || text;
    createEngine(settings.engine).speak(clean, settings, hooks);
  }

  stop(): void {
    systemEngine.stop();
    cloudEngine.stop();
    mossEngine.stop();
  }
}

export const ttsService = new TtsService();
