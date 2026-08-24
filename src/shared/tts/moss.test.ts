import { expect, test } from 'vitest';

import {
  briefSpeechText,
  buildMossRequest,
  defaultMossConfig,
  hasSpeech,
  mossHealthUrl,
  splitForSpeech,
  validateMossBaseUrl,
} from './constants';

test('buildMossRequest targets /api/generate with text + demo_id form fields', () => {
  const plan = buildMossRequest('你好呀', defaultMossConfig());
  expect(plan.url).toBe('http://127.0.0.1:18083/api/generate');
  expect(plan.fields.text).toBe('你好呀');
  expect(plan.fields.demo_id).toBe('demo-1');
});

test('buildMossRequest joins base+endpoint cleanly and omits an empty demo_id', () => {
  const plan = buildMossRequest('hi', {
    ...defaultMossConfig(),
    baseUrl: 'http://localhost:9000/', // trailing slash
    demoId: '',
  });
  expect(plan.url).toBe('http://localhost:9000/api/generate');
  expect(plan.fields.text).toBe('hi');
  expect('demo_id' in plan.fields).toBe(false);
});

test('buildMossRequest passes a configured demo_id', () => {
  const plan = buildMossRequest('hi', { ...defaultMossConfig(), demoId: 'demo-3' });
  expect(plan.fields.demo_id).toBe('demo-3');
});

// A user recording is uploaded as the prompt_audio file part by the main process,
// and the server rejects demo_id + upload together, so demo_id must drop out.
test('buildMossRequest omits demo_id when a custom recording is set', () => {
  const plan = buildMossRequest('hi', {
    ...defaultMossConfig(),
    demoId: 'demo-3',
    promptAudioPath: 'D:/voices/me.wav',
  });
  expect('demo_id' in plan.fields).toBe(false);
  expect(plan.fields.text).toBe('hi');
});

test('mossHealthUrl points at the /health endpoint', () => {
  expect(mossHealthUrl('http://127.0.0.1:18083')).toBe('http://127.0.0.1:18083/health');
  expect(mossHealthUrl('http://127.0.0.1:18083/')).toBe('http://127.0.0.1:18083/health');
});

test('validateMossBaseUrl accepts http/https and rejects everything else', () => {
  expect(validateMossBaseUrl('http://127.0.0.1:18083')).toBe(true);
  expect(validateMossBaseUrl('https://tts.example.com')).toBe(true);
  expect(validateMossBaseUrl('file:///etc/passwd')).toBe(false);
  expect(validateMossBaseUrl('')).toBe(false);
  expect(validateMossBaseUrl('not a url')).toBe(false);
  // @ts-expect-error guard against non-string input at runtime
  expect(validateMossBaseUrl(null)).toBe(false);
});

test('splitForSpeech breaks on sentence punctuation and keeps it attached', () => {
  const chunks = splitForSpeech('你好呀。今天天气不错！要出门吗？', 10, 10);
  expect(chunks).toEqual(['你好呀。', '今天天气不错！', '要出门吗？']);
});

test('splitForSpeech sends a short reply as a single request', () => {
  const reply = '你好呀，我在呢！今天是周日，早上十点四十。';
  expect(splitForSpeech(reply)).toEqual([reply]);
});

test('splitForSpeech merges sentences into evenly sized chunks', () => {
  const reply =
    '你好呀，我在呢！今天是周日，早上十点四十。有什么想聊的，或者需要我帮忙处理电脑上的任务吗？' +
    '我可以帮你整理文件、查资料、写代码，也可以只是陪你聊聊天。';
  const chunks = splitForSpeech(reply);
  expect(chunks.length).toBeGreaterThan(1);
  // Short opening sentences ride along with the next one instead of going alone,
  // which is what keeps the pause after the first chunk short.
  expect(chunks[0]).toBe('你好呀，我在呢！今天是周日，早上十点四十。');
  // No text may be dropped.
  expect(chunks.join('')).toBe(reply);
});

// Cutting on commas made the speech sound truncated, so every chunk boundary
// must land on sentence-ending punctuation.
test('splitForSpeech only breaks on sentence endings', () => {
  const reply =
    '你好呀，我在呢！今天是周日，早上十点四十。有什么想聊的，或者需要我帮忙处理电脑上的任务吗？' +
    '我可以帮你整理文件、查资料、写代码，也可以只是陪你聊聊天。';
  for (const chunk of splitForSpeech(reply)) {
    expect(/[。！？!?…]$/.test(chunk)).toBe(true);
  }
});

test('splitForSpeech merges later sentences up to the larger budget', () => {
  const chunks = splitForSpeech('好的呀。行不行呢？可以的呀。没问题的。', 10, 4);
  expect(chunks).toEqual(['好的呀。行不行呢？', '可以的呀。没问题的。']);
  expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(10);
});

test('splitForSpeech hard-splits a long run with no sentence punctuation', () => {
  const long = '甲'.repeat(50) + '，' + '乙'.repeat(50);
  const chunks = splitForSpeech(long, 20, 20);
  expect(chunks.length).toBeGreaterThan(1);
  // Nothing may be dropped — the rejoined text must equal the input.
  expect(chunks.join('')).toBe(long);
  expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(40);
});

test('splitForSpeech returns nothing for blank input', () => {
  expect(splitForSpeech('')).toEqual([]);
  expect(splitForSpeech('   ')).toEqual([]);
});

test('hasSpeech only accepts text with letters, digits or CJK', () => {
  expect(hasSpeech('你好')).toBe(true);
  expect(hasSpeech('ok')).toBe(true);
  expect(hasSpeech('42')).toBe(true);
  expect(hasSpeech('👋😊')).toBe(false);
  expect(hasSpeech('～。')).toBe(false);
  expect(hasSpeech('')).toBe(false);
});

// Regression: MOSS babbles for ~7s when handed a fragment with nothing to say,
// so an emoji/punctuation tail must never become a chunk of its own.
test('splitForSpeech drops chunks that have nothing speakable', () => {
  // An emoji tail either rides along with real text or disappears — it must
  // never become a request of its own.
  expect(splitForSpeech('好的。👋😊', 60, 4).every((c) => hasSpeech(c))).toBe(true);
  expect(splitForSpeech('👋😊')).toEqual([]);
  expect(splitForSpeech('～。')).toEqual([]);
});

test('briefSpeechText keeps short replies whole', () => {
  expect(briefSpeechText('你好呀，我在呢！')).toBe('你好呀，我在呢！');
});

// Regression: a one-character request generated ~4s of nonsense, so tiny
// fragments must be folded into a neighbour instead of sent on their own.
test('splitForSpeech never emits a chunk too short to synthesise', () => {
  const chunks = splitForSpeech('好。今天天气很不错呀。', 24, 14);
  expect(chunks.every((c) => c.length >= 4)).toBe(true);
  expect(chunks.join('')).toBe('好。今天天气很不错呀。');
});

test('briefSpeechText cuts long replies on a sentence boundary', () => {
  const long = '你好呀，我在呢！今天是周日，早上十点四十。有什么想聊的，或者需要我帮忙处理电脑上的任务吗？';
  const brief = briefSpeechText(long, 40);
  expect(brief.length).toBeLessThanOrEqual(40);
  expect(brief.endsWith('。')).toBe(true);
  expect(long.startsWith(brief)).toBe(true);
});

test('briefSpeechText keeps the first sentence whole even when it overruns', () => {
  const runOn = '这是一个很长的句子，里面有很多内容需要慢慢地讲清楚才行呢。';
  // Truncating mid-sentence sounded cut off, so the whole sentence is kept.
  expect(briefSpeechText(runOn, 20)).toBe(runOn);
});
