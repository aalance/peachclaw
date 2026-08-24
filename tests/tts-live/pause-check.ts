// Compare the pause behaviour of the real chunker against the live MOSS server.
// Reports time-to-first-word and every gap between chunks.
import { sanitizeForSpeech } from '../../src/renderer/services/tts';
import { splitForSpeech, briefSpeechText } from '../../src/shared/tts/constants';

const BASE = 'http://127.0.0.1:18083/api/generate';

const SHORT = '你好呀，我在呢！今天是周日，早上十点四十。';
const LONG =
  '你好呀，我在呢！今天是周日，早上十点四十。有什么想聊的，或者需要我帮忙处理电脑上的任务吗？' +
  '我可以帮你整理文件、查资料、写代码，也可以只是陪你聊聊天。你最近在忙什么呢？';

async function synth(text: string) {
  const form = new FormData();
  form.append('text', text);
  form.append('demo_id', 'demo-1');
  const t = Date.now();
  const res = await fetch(BASE, { method: 'POST', body: form });
  const j: any = await res.json();
  const gen = (Date.now() - t) / 1000;
  if (j.error) throw new Error(String(j.error).slice(0, 120));
  const audio = Number(String(j.run_status).match(/audio=([\d.]+)s/)?.[1] || 0);
  return { gen, audio };
}

async function run(label: string, raw: string, brief: boolean) {
  const text = brief ? briefSpeechText(sanitizeForSpeech(raw)) : sanitizeForSpeech(raw);
  const chunks = splitForSpeech(text);
  console.log(`\n=== ${label} (${text.length} chars -> ${chunks.length} chunk(s)) ===`);
  chunks.forEach((c, i) => console.log(`  #${i + 1} "${c}"`));

  let clock = 0, audioEnds = 0, first = 0, maxGap = 0, totalGap = 0;
  for (let i = 0; i < chunks.length; i++) {
    const { gen, audio } = await synth(chunks[i]);
    clock += gen;
    if (i === 0) first = clock;
    const gap = i === 0 ? 0 : Math.max(0, clock - audioEnds);
    maxGap = Math.max(maxGap, gap);
    totalGap += gap;
    audioEnds = Math.max(clock, audioEnds) + audio;
  }
  console.log(`  first word: ${first.toFixed(1)}s | max pause: ${maxGap.toFixed(1)}s | total pause: ${totalGap.toFixed(1)}s`);
}

(async () => {
  await run('SHORT reply, brief mode', SHORT, true);
  await run('LONG reply, full mode', LONG, false);
})().catch((e) => console.log('FAIL', e.message));
