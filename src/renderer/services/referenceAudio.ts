// Converts a user-picked recording into the plain 16-bit WAV that the MOSS
// server can read. Phone and chat-app recordings are almost always MP3/M4A and
// the server rejects those outright ("Unspecified internal error"), so we decode
// with the Web Audio API — which handles every format Chromium can play — and
// re-encode ourselves.

/** Longest reference MOSS needs; extra audio only slows cloning down. */
const MAX_REFERENCE_SECONDS = 15;
/** Reference audio is speech, so 16 kHz mono is plenty and keeps the file small. */
const TARGET_SAMPLE_RATE = 16000;

const writeString = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

/** Encode mono float samples as a 16-bit PCM WAV file. */
const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
};

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked so a long recording can't blow the argument limit of fromCharCode.
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
};

/**
 * Decode any browser-playable audio file and return base64 WAV bytes: mono,
 * 16 kHz, trimmed to the first {@link MAX_REFERENCE_SECONDS} seconds.
 */
export async function convertToReferenceWavBase64(fileBytes: ArrayBuffer): Promise<string> {
  const AudioCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!AudioCtx) throw new Error('audio decoding is not supported here');

  // A throwaway context just for decoding; the real resampling happens below.
  const decodeCtx = new AudioCtx(1, 1, TARGET_SAMPLE_RATE);
  const decoded = await decodeCtx.decodeAudioData(fileBytes.slice(0));

  const seconds = Math.min(decoded.duration, MAX_REFERENCE_SECONDS);
  if (!seconds) throw new Error('the recording is empty');

  // Render through an offline context to downmix to mono and resample in one go.
  const frames = Math.max(1, Math.ceil(seconds * TARGET_SAMPLE_RATE));
  const renderCtx = new AudioCtx(1, frames, TARGET_SAMPLE_RATE);
  const source = renderCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(renderCtx.destination);
  source.start(0, 0, seconds);
  const rendered = await renderCtx.startRendering();

  return toBase64(encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE));
}

/** Strip the `data:...;base64,` prefix returned by dialog.readFileAsDataUrl. */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
