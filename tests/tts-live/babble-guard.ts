// End-to-end guard: runs REAL sanitizeForSpeech + splitForSpeech (bundled from
// src) over realistic pet replies, sends every resulting chunk to the live MOSS
// server, and flags any chunk that babbles (audio far longer than the text).
import { sanitizeForSpeech } from '../../src/renderer/services/tts';
import { splitForSpeech, briefSpeechText } from '../../src/shared/tts/constants';

const BASE = 'http://127.0.0.1:18083/api/generate';

const REPLIES = [
  '你好呀～👋 我在呢！今天是周日，早上十点四十。有什么想聊的吗？😊',
  '搞定啦 🎉 文件已经整理好了～ 你看看还需要我做什么？',
  '嗯……让我想想。**重点**是这个 `config` 文件，你可以看 [文档](https://x.com) 。',
  '完成 ✅ 了，一共处理了 12 个文件。',
  '好的～',
];

async function synth(text: string) {
  const form = new FormData();
  form.append('text', text);
  form.append('demo_id', 'demo-1');
  const res = await fetch(BASE, { method: 'POST', body: form });
  const j: any = await res.json();
  if (j.error) throw new Error(String(j.error).slice(0, 120));
  const secs = Number(String(j.run_status).match(/audio=([\d.]+)s/)?.[1] || 0);
  return secs;
}

(async () => {
  let bad = 0;
  for (const raw of REPLIES) {
    const clean = sanitizeForSpeech(raw);
    const chunks = splitForSpeech(briefSpeechText(clean));
    console.log('\nraw   :', raw);
    console.log('clean :', clean);
    console.log('chunks:', JSON.stringify(chunks));
    for (const c of chunks) {
      const secs = await synth(c);
      const ratio = secs / [...c].length;
      const flag = ratio > 0.8 ? '  <<< BABBLING' : '';
      if (ratio > 0.8) bad++;
      console.log(`   "${c}" -> ${secs}s  s/char=${ratio.toFixed(2)}${flag}`);
    }
  }
  console.log(bad === 0 ? '\nRESULT: no babbling detected' : `\nRESULT: ${bad} babbling chunk(s)`);
})().catch((e) => console.log('FAIL', e.message));
