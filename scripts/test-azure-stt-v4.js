// scripts/test-azure-stt-v4.js
// 測試 Azure Speech to Text REST short-audio 格式。

const fs = require('fs');

const AZURE_STT_KEY = process.env.AZURE_STT_KEY || process.env.AZURE_SPEECH_KEY || '';
if (!AZURE_STT_KEY) { console.error('❌ $env:AZURE_STT_KEY="key"'); process.exit(1); }

const AZURE_STT_REGION = process.env.AZURE_STT_REGION || 'eastasia';
const AZURE_STT_LANGUAGE = process.env.AZURE_STT_LANGUAGE || process.env.AZURE_STT_LOCALE || 'zh-HK';
const AZURE_STT_HOST = (process.env.AZURE_STT_RECOGNITION_HOST || `${AZURE_STT_REGION}.stt.speech.microsoft.com`)
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

function createSilentWav(seconds = 2) {
  const sr = 16000, ch = 1, bits = 16;
  const ds = sr * ch * (bits / 8) * seconds;
  const h = Buffer.allocUnsafe(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + ds, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(ch, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * ch * bits / 8, 28); h.writeUInt16LE(ch * bits / 8, 32);
  h.writeUInt16LE(bits, 34); h.write('data', 36); h.writeUInt32LE(ds, 40);
  return Buffer.concat([h, Buffer.alloc(ds, 0)]);
}

const audioBuffer = process.argv[2] ? fs.readFileSync(process.argv[2]) : createSilentWav(2);

async function test(audio = audioBuffer) {
  const url = `https://${AZURE_STT_HOST}/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(AZURE_STT_LANGUAGE)}&format=detailed`;

  console.log(`\n測試 language=${AZURE_STT_LANGUAGE}:`);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json;text/xml',
        'Ocp-Apim-Subscription-Key': AZURE_STT_KEY,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'
      },
      body: audio
    });
    const text = await resp.text();
    console.log(`  HTTP ${resp.status}: ${text.slice(0, 300)}`);
    return resp.ok;
  } catch (e) {
    console.log(`  網絡錯誤: ${e.message}`);
    return false;
  }
}

(async () => {
  console.log('🌐 Host:', AZURE_STT_HOST);

  await test();

  console.log('\nHTTP 200 表示 Speech REST short-audio endpoint 可用。');
})();
