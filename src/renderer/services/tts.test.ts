import { expect, test } from 'vitest';

import { sanitizeForSpeech } from './tts';

test('sanitizeForSpeech strips markdown and URLs', () => {
  // Markdown markers become spaces, which the whitespace collapse then tidies.
  expect(sanitizeForSpeech('**重点**：见 `code` 内容')).toBe('重点 ：见 code 内容');
  expect(sanitizeForSpeech('看 [文档](https://example.com) 吧')).toBe('看 文档 吧');
  expect(sanitizeForSpeech('```js\nconst a = 1;\n```说完了')).toBe('说完了');
});

// Regression: emoji left in the text make MOSS babble (an emoji-only fragment
// generated ~7s of nonsense), so they are removed before synthesis.
test('sanitizeForSpeech removes emoji and leaves the words intact', () => {
  expect(sanitizeForSpeech('你好呀👋 我在呢！😊')).toBe('你好呀 我在呢！');
  expect(sanitizeForSpeech('搞定啦 🎉🎉')).toBe('搞定啦');
  // Emoji with a skin-tone modifier and a ZWJ sequence.
  expect(sanitizeForSpeech('好的 👍🏽 完成 👨‍💻')).toBe('好的 完成');
});

// Measured babble triggers: "好的～" produced 30s of nonsense and "嗯……好吧" 22s.
test('sanitizeForSpeech strips decorative tildes and ellipses', () => {
  expect(sanitizeForSpeech('好的～')).toBe('好的');
  expect(sanitizeForSpeech('你好呀～我在呢')).toBe('你好呀我在呢');
  expect(sanitizeForSpeech('嗯……好吧')).toBe('嗯，好吧');
});

test('sanitizeForSpeech strips standalone symbols like check marks', () => {
  expect(sanitizeForSpeech('完成 ✅ 了')).toBe('完成 了');
  expect(sanitizeForSpeech('重点 ★ 是这个')).toBe('重点 是这个');
});

test('sanitizeForSpeech returns empty string when nothing is speakable', () => {
  expect(sanitizeForSpeech('')).toBe('');
  expect(sanitizeForSpeech('👋😊')).toBe('');
  expect(sanitizeForSpeech('～')).toBe('');
});
