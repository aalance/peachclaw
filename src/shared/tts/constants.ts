// Shared TTS contracts used by both the Electron main process (which performs the
// actual HTTP call to a MOSS-TTS-Nano server) and the renderer (which builds the
// config and plays the returned audio). Kept dependency-free and pure so the
// request-building / validation logic is unit-testable without a live server.
//
// Calibrated against the MOSS-TTS-Nano demo server (`python app.py`, FastAPI):
//   POST /api/generate  — multipart/form-data { text, demo_id }  ->  JSON { audio_base64, sample_rate }
//   GET  /health        — readiness probe
// Voice cloning uses a preset reference speaker id ("demo-1".."demo-N", listed in
// the server's assets/demo.jsonl); an uploaded reference is not used here.

/** IPC channels for the MOSS text-to-speech proxy (main process does the fetch — no CORS). */
export const TtsIpc = {
  Synthesize: 'tts:synthesize',
  Ping: 'tts:ping',
  SavePromptAudio: 'tts:savePromptAudio',
} as const;
export type TtsIpc = typeof TtsIpc[keyof typeof TtsIpc];

// MOSS-TTS-Nano local server defaults. The demo server (`python app.py`) listens
// on 127.0.0.1:18083 and generates via POST /api/generate. All fields are
// user-overridable in the pet voice settings so any compatible server works.
// 127.0.0.1 (not "localhost") is used so the client never resolves to IPv6 ::1
// while uvicorn is bound to IPv4.
export const MOSS_DEFAULT_BASE_URL = 'http://127.0.0.1:18083';
export const MOSS_DEFAULT_ENDPOINT = '/api/generate';
export const MOSS_HEALTH_ENDPOINT = '/health';
/** First preset reference speaker in the demo server (a Chinese voice). */
export const MOSS_DEFAULT_DEMO_ID = 'demo-1';

/** How much of a reply the pet reads aloud. */
export const MossSpeakScope = {
  /** Only the opening sentences — fast and gapless. */
  Brief: 'brief',
  /** The whole reply, accepting pauses between chunks. */
  Full: 'full',
} as const;
export type MossSpeakScope = typeof MossSpeakScope[keyof typeof MossSpeakScope];

/** Character budget for 'brief' mode — roughly the first one or two sentences. */
export const MOSS_BRIEF_CHARS = 40;

// Reference speakers bundled with the MOSS demo server (assets/demo.jsonl).
// Only the distinct-sounding ones are surfaced: demo-14 onward all reuse the
// same English sample under different language labels.
export const MOSS_PRESET_VOICES: Array<{ id: string; labelZh: string; labelEn: string }> = [
  { id: 'demo-1', labelZh: '标准播音（默认）', labelEn: 'Broadcast (default)' },
  { id: 'demo-2', labelZh: '温柔晚安', labelEn: 'Gentle / late night' },
  { id: 'demo-3', labelZh: '台湾腔', labelEn: 'Taiwanese accent' },
  { id: 'demo-4', labelZh: '京味闲聊', labelEn: 'Beijing casual' },
  { id: 'demo-5', labelZh: '沉稳讲述', labelEn: 'Calm narration' },
  { id: 'demo-6', labelZh: '自然女声', labelEn: 'Natural female' },
  { id: 'demo-7', labelZh: '英文 · Welcome', labelEn: 'English · Welcome' },
  { id: 'demo-8', labelZh: '英文 · 讲解', labelEn: 'English · Lecture' },
  { id: 'demo-9', labelZh: '英文 · 新闻', labelEn: 'English · News' },
  { id: 'demo-11', labelZh: '英文 · 柔和女声', labelEn: 'English · Soft female' },
  { id: 'demo-13', labelZh: '日文 · 新闻', labelEn: 'Japanese · News' },
];

/** Connection + generation config for the MOSS engine (persisted inside VoiceSettings). */
export interface MossTtsConfig {
  /** Base URL of the MOSS server, e.g. http://127.0.0.1:18083 */
  baseUrl: string;
  /** Generation endpoint path, e.g. /api/generate */
  endpoint: string;
  /** Preset reference speaker id for voice cloning, e.g. demo-1. */
  demoId: string;
  /**
   * Absolute path to a user-supplied reference recording. When set it takes
   * precedence over demoId and the pet speaks in that cloned voice.
   */
  promptAudioPath: string;
  /** Whether to read the whole reply or just the opening. */
  scope: MossSpeakScope;
}

export const defaultMossConfig = (): MossTtsConfig => ({
  baseUrl: MOSS_DEFAULT_BASE_URL,
  endpoint: MOSS_DEFAULT_ENDPOINT,
  demoId: MOSS_DEFAULT_DEMO_ID,
  promptAudioPath: '',
  // Default to the snappy behaviour: this model runs slower than realtime, so
  // reading a long reply in full means audible pauses between sentences.
  scope: MossSpeakScope.Brief,
});

export interface MossRequestPlan {
  url: string;
  /** Fields to send as multipart/form-data to /api/generate. */
  fields: Record<string, string>;
}

/** Join a base URL and an endpoint path without doubling or dropping the slash. */
const joinUrl = (baseUrl: string, endpoint: string): string => {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const path = String(endpoint || '');
  if (!path) return base;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
};

// Build the request plan for a text -> speech synthesis against MOSS's
// /api/generate (multipart form). The reference speaker is supplied via demo_id
// unless the user picked their own recording, in which case the main process
// attaches it as the prompt_audio file part instead.
export function buildMossRequest(text: string, cfg: MossTtsConfig): MossRequestPlan {
  const fields: Record<string, string> = { text };
  if (!cfg.promptAudioPath && cfg.demoId) fields.demo_id = cfg.demoId;
  return {
    url: joinUrl(cfg.baseUrl || MOSS_DEFAULT_BASE_URL, cfg.endpoint || MOSS_DEFAULT_ENDPOINT),
    fields,
  };
}

/** Reference recordings MOSS accepts for voice cloning. */
export const MOSS_PROMPT_AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'm4a', 'ogg'];

/** Resolve the health-probe URL (origin + /health) for a configured base URL. */
export function mossHealthUrl(baseUrl: string): string {
  return joinUrl(baseUrl, MOSS_HEALTH_ENDPOINT);
}

/** Accept only http/https URLs; everything else (file:, empty, garbage) is rejected. */
export function validateMossBaseUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** True when the text has something actually speakable (letters, digits, CJK). */
export function hasSpeech(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(String(text || ''));
}

/** Shortest chunk worth sending on its own; below this MOSS tends to babble. */
export const MIN_CHUNK_CHARS = 4;

// Split a reply so the pet can start talking before the whole thing is
// synthesised, without ever cutting a sentence in half.
//
// Rules, in order of importance:
//  1. Short replies are sent as ONE request — no splitting, so no pauses at all.
//  2. Splits only ever land on sentence punctuation, so every chunk is a whole
//     thought. (Splitting on commas made the speech sound truncated.)
//  3. Remaining sentences are merged into evenly sized chunks. Even sizing is
//     what keeps pauses short: generation runs at ~1.3x realtime, so a chunk can
//     never fully cover the next one's synthesis, and a tiny chunk followed by a
//     big one produced an 8.5s stall. Evenly sized chunks spread that into ~2s.
//  4. A single runaway sentence longer than 2x the budget is clause-split as a
//     last resort, so one unpunctuated wall of text can't stall playback.
export function splitForSpeech(text: string, maxChars = 30, noSplitChars = 40): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];

  // 1. Short enough to say in one breath — one request, zero gaps.
  if (clean.length <= noSplitChars) return hasSpeech(clean) ? [clean] : [];

  const CLAUSE_SEPS = ['，', ',', '、', '；', ';', ' '];
  const clauseCut = (s: string, limit: number): number => {
    let cut = -1;
    for (const sep of CLAUSE_SEPS) {
      const idx = s.lastIndexOf(sep, limit);
      if (idx > cut) cut = idx;
    }
    return cut;
  };

  // 2. Sentence-level atoms only.
  const sentences = clean
    .split(/(?<=[。！？!?…\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 4. Rescue absurdly long sentences; everything else stays whole.
  const atoms: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars * 2) {
      atoms.push(sentence);
      continue;
    }
    let rest = sentence;
    while (rest.length > maxChars) {
      let cut = clauseCut(rest, maxChars);
      if (cut < maxChars * 0.4) cut = maxChars - 1;
      atoms.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) atoms.push(rest);
  }
  if (atoms.length === 0) return [];

  // 3. Merge sentences into evenly sized chunks.
  const out: string[] = [];
  for (const atom of atoms) {
    const last = out[out.length - 1];
    if (last && (last + atom).length <= maxChars) out[out.length - 1] = last + atom;
    else out.push(atom);
  }

  // 5. Drop chunks with nothing speakable — a fragment of only emoji or
  //    punctuation makes MOSS babble for seconds on end.
  const kept = out.filter((chunk) => chunk && hasSpeech(chunk));

  // 6. Fold away chunks too short to synthesise cleanly: a one-character request
  //    produced ~4s of nonsense in testing.
  const merged: string[] = [];
  for (const chunk of kept) {
    const prev = merged[merged.length - 1];
    if (prev && (prev.length < MIN_CHUNK_CHARS || chunk.length < MIN_CHUNK_CHARS)) {
      merged[merged.length - 1] = prev + chunk;
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

// Trim a reply to its opening sentence(s) for 'brief' mode. Only ever cuts on a
// sentence boundary: stopping mid-sentence sounded like the pet had been cut off,
// so a first sentence that overruns the budget is kept whole instead.
export function briefSpeechText(text: string, budget = MOSS_BRIEF_CHARS): string {
  const clean = String(text || '').trim();
  if (clean.length <= budget) return clean;

  const sentences = clean
    .split(/(?<=[。！？!?…\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

  let out = '';
  for (const sentence of sentences) {
    if (out && (out + sentence).length > budget) break;
    out += sentence;
    if (out.length >= budget) break;
  }
  // `out` is empty only when the very first sentence already exceeds the budget;
  // keeping it whole is better than truncating a thought.
  return (out || sentences[0] || clean).trim();
}
