const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Lunar, Solar } = require('lunar-javascript');

const host = process.env.API_HOST || '0.0.0.0';
const port = Number(process.env.API_PORT || 8787);
const dbPath = process.env.API_DB_PATH || path.join(process.cwd(), 'data', 'server-db.json');
const maxBodyBytes = Number(process.env.API_MAX_BODY_BYTES || 24_000_000);
const llmBaseUrl = (process.env.LLM_OPENAI_BASE_URL || 'https://fufu.iqach.top/v1').replace(/\/+$/, '');
const llmApiKey = process.env.LLM_SUMMARY_API_KEY || process.env.OPENAI_API_KEY || 'dummy-key';
const llmModel = process.env.LLM_SUMMARY_MODEL || process.env.OPENAI_SUMMARY_MODEL || 'mimo-v2.5';
const llmTranscribeModel = process.env.LLM_TRANSCRIBE_MODEL || process.env.LLM_AUDIO_MODEL || 'mimo-v2-omni';

function ensureDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ families: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        req.destroy();
        reject(new Error('body-too-large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('invalid-json'));
      }
    });
    req.on('error', reject);
  });
}

function getFamily(db, familyId) {
  return db.families[familyId] || null;
}

function createFamily(db, familyId, createdBy) {
  const now = new Date().toISOString();
  db.families[familyId] = {
    familyId,
    createdAt: now,
    createdBy,
    members: {},
    messages: [],
    memories: []
  };
  return db.families[familyId];
}

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, 1000);
}

function cleanLargeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, 18_000_000);
}

function cleanTranscript(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, 4000);
}

function fallbackSummary(text) {
  const compact = cleanText(text.replace(/\s+/g, ' '), '語音訊息');
  if (compact.length <= 80) return `語音摘要：${compact}`;
  return `語音摘要：${compact.slice(0, 77)}...`;
}

function parseAudioDataUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s);
  const mime = match?.[1] || '';
  const data = match ? match[2] : trimmed;
  const normalizedMime = mime.toLowerCase();
  let format = 'm4a';

  if (normalizedMime.includes('wav')) format = 'wav';
  else if (normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')) format = 'mp3';
  else if (normalizedMime.includes('aac')) format = 'aac';
  else if (normalizedMime.includes('mp4')) format = 'mp4';
  else if (normalizedMime.includes('m4a')) format = 'm4a';

  return { data, format };
}

function convertAudioToWavBase64(audio) {
  const id = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(os.tmpdir(), `beckon-stars-${id}.${audio.format || 'm4a'}`);
  const outputPath = path.join(os.tmpdir(), `beckon-stars-${id}.wav`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(audio.data, 'base64'));
    execFileSync('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      outputPath
    ], { timeout: 60_000 });

    return {
      data: fs.readFileSync(outputPath).toString('base64'),
      format: 'wav'
    };
  } finally {
    fs.rmSync(inputPath, { force: true });
    fs.rmSync(outputPath, { force: true });
  }
}

function prepareAudioForLlm(audioDataUrl) {
  const audio = parseAudioDataUrl(audioDataUrl);
  if (!audio?.data) return null;
  if (audio.format === 'wav') return audio;
  return convertAudioToWavBase64(audio);
}

async function transcribeAudioWithLlm(audioDataUrl) {
  const audio = prepareAudioForLlm(audioDataUrl);
  if (!audio?.data) return '';

  const response = await fetch(`${llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llmApiKey}`
    },
    body: JSON.stringify({
      model: llmTranscribeModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'ASR task. Listen to the attached input_audio and return only the spoken words.',
                'If the speech is Cantonese, transcribe it as Traditional Chinese with natural Hong Kong Cantonese wording.',
                'If the speech contains English, numbers, or names, preserve them as spoken.',
                'Do not summarize, translate to formal written Chinese, answer the speaker, or explain capabilities.',
                'Do not say you cannot access audio. Output only the transcript.',
                'If the audio is completely unintelligible, output exactly: [聽不清]'
              ].join('\n')
            },
            {
              type: 'input_audio',
              input_audio: {
                data: audio.data,
                format: audio.format
              }
            }
          ]
        }
      ],
      max_tokens: 1200,
      temperature: 0
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`stt-${response.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ''}`);
  }
  const payload = await response.json();
  return cleanTranscript(payload.choices?.[0]?.message?.content, '');
}

async function summarizeWithLlm(text) {
  const content = cleanText(text, '');
  if (!content) return '';

  if (process.env.LLM_SUMMARY_ENDPOINT && !process.env.LLM_SUMMARY_ENDPOINT.includes('/v1/')) {
    const response = await fetch(process.env.LLM_SUMMARY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LLM_SUMMARY_API_KEY ? { Authorization: `Bearer ${process.env.LLM_SUMMARY_API_KEY}` } : {})
      },
      body: JSON.stringify({ text: content })
    });
    if (!response.ok) throw new Error(`llm-${response.status}`);
    const payload = await response.json();
    return cleanText(payload.summary || payload.text || payload.result, fallbackSummary(content));
  }

  try {
    const response = await fetch(`${llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmApiKey}`
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          {
            role: 'system',
            content: [
              '你是一個「錄音摘要器」，不是聊天機械人。',
              '任務：只根據使用者提供的語音轉文字內容，寫一段給家人看的摘要。',
              '不要回答錄音內容中的問題，不要扮演對話對象，不要延伸聊天，不要加入建議。',
              '語氣：繁體中文、自然香港粵語。',
              '格式：只輸出一個簡短摘要句，最多60字，不要標題、不要項目符號。'
            ].join('\n')
          },
          {
            role: 'user',
            content: `以下是錄音轉文字，請總結，不要回覆錄音中的說話者：\n${content}`
          }
        ],
        temperature: 0.3
      })
    });
    if (!response.ok) throw new Error(`llm-${response.status}`);
    const payload = await response.json();
    return cleanText(payload.choices?.[0]?.message?.content, fallbackSummary(content));
  } catch (error) {
    console.warn('[llm] summary failed, using fallback', error.message || error);
    return fallbackSummary(content);
  }
}

const videosDir = path.join(process.cwd(), 'data', 'videos');

async function generateSummaryVideo(memories, year, month, familyId) {
  fs.mkdirSync(videosDir, { recursive: true });
  const videoFilename = `${familyId}_${year}_${month}_${Date.now()}.mp4`;
  const videoPath = path.join(videosDir, videoFilename);
  const tmpDir = path.join(os.tmpdir(), `beckon-video-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 下載圖片到臨時目錄
    const imageFiles = [];
    for (let i = 0; i < memories.length; i++) {
      const mem = memories[i];
      const imgPath = path.join(tmpDir, `img_${String(i).padStart(3, '0')}.jpg`);
      try {
        let imgData;
        if (mem.img.startsWith('data:')) {
          const base64 = mem.img.split(',')[1];
          imgData = Buffer.from(base64, 'base64');
        } else {
          const resp = await fetch(mem.img);
          if (!resp.ok) continue;
          imgData = Buffer.from(await resp.arrayBuffer());
        }
        fs.writeFileSync(imgPath, imgData);
        imageFiles.push(imgPath);
      } catch (err) {
        console.warn('[video] skip image', i, err.message);
      }
    }

    if (imageFiles.length === 0) {
      throw new Error('No valid images found');
    }

    // 用 ffmpeg 生成幻燈片影片
    // 每張 3 秒，帶淡入淡出，720x1280 竖屏
    const inputs = [];
    const filters = [];
    for (let i = 0; i < imageFiles.length; i++) {
      inputs.push('-loop', '1', '-t', '3', '-i', imageFiles[i]);
      filters.push(`[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
    }

    // 淡入淡出轉場
    if (imageFiles.length === 1) {
      filters.push(`[v0]fade=t=in:st=0:d=0.5,fade=t=out:st=2.5:d=0.5[out]`);
    } else {
      let lastLabel = 'v0';
      for (let i = 1; i < imageFiles.length; i++) {
        const outLabel = `c${i}`;
        const fadeIn = i === 0 ? 0 : 0.5;
        filters.push(`[${lastLabel}][v${i}]xfade=transition=fade:duration=0.5:offset=${3 * i - 0.5 * i}[${outLabel}]`);
        lastLabel = outLabel;
      }
      filters.push(`[${lastLabel}]fade=t=in:st=0:d=0.5,fade=t=out:st=${3 * imageFiles.length - 1}:d=0.5[out]`);
    }

    const filterComplex = filters.join(';');

    const args = [
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      videoPath
    ];

    execFileSync('ffmpeg', args, { timeout: 120_000 });

    return `/videos/${videoFilename}`;
  } finally {
    // 清理臨時文件
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function routeParts(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return {
    pathname: url.pathname,
    parts: url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  };
}

const server = http.createServer(async (req, res) => {
  try {
    // 靜態文件：影片
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname.startsWith('/videos/')) {
      const filename = path.basename(url.pathname);
      const filePath = path.join(videosDir, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'video/mp4',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end('Video not found');
      return;
    }

    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return;
    }

    const { pathname, parts } = routeParts(req);

    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        name: 'beckon-stars-local-api',
        time: new Date().toISOString()
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/almanac') {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const dateParam = urlObj.searchParams.get('date');
      const d = dateParam ? new Date(dateParam) : new Date();
      const solar = Solar.fromDate(d);
      const lunar = solar.getLunar();
      const jieQi = lunar.getJieQi();
      const dayGanZhi = lunar.getDayInGanZhi();
      const monthGanZhi = lunar.getMonthInGanZhi();
      const yearGanZhi = lunar.getYearInGanZhi();
      const yearShengXiao = lunar.getYearShengXiao();
      const yiList = lunar.getDayYi();
      const jiList = lunar.getDayJi();
      const xiu = lunar.getXiu();
      const xiuLuck = lunar.getXiuLuck();
      const pw = lunar.getPengZuGan();
      const pzZhi = lunar.getPengZuZhi();
      sendJson(res, 200, {
        ok: true,
        solar: { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay(), weekDay: solar.getWeekInChinese() },
        lunar: {
          year: lunar.getYearInChinese(),
          month: lunar.getMonthInChinese(),
          day: lunar.getDayInChinese(),
          yearGanZhi, monthGanZhi, dayGanZhi,
          yearShengXiao,
          jieQi: jieQi || null,
          xiu, xiuLuck,
          pengZu: `${pw}${pzZhi}`
        },
        yi: yiList,
        ji: jiList,
        yiDisplay: yiList.slice(0, 5).join('、'),
        jiDisplay: jiList.slice(0, 5).join('、')
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/summarize') {
      const body = await readBody(req);
      const summary = await summarizeWithLlm(body.text || body.content || '');
      sendJson(res, 200, { summary });
      return;
    }

    if (parts[0] !== 'api' || parts[1] !== 'families' || !parts[2]) {
      sendJson(res, 404, { error: 'not-found' });
      return;
    }

    const familyId = parts[2];

    if (req.method === 'POST' && parts[3] === 'connect') {
      const body = await readBody(req);
      const db = readDb();
      const member = body.member || {};
      let family = getFamily(db, familyId);
      if (!family) {
        if (!body.shouldCreate) {
          sendJson(res, 404, { error: 'family-not-found' });
          return;
        }
        family = createFamily(db, familyId, member.uid || 'unknown');
      }

      if (member.uid) {
        family.members[member.uid] = {
          uid: member.uid,
          name: cleanText(member.name, '家庭成員'),
          role: cleanText(member.role, 'child'),
          avatar: cleanText(member.avatar),
          joinedAt: family.members[member.uid]?.joinedAt || new Date().toISOString(),
          lastSeenAt: new Date().toISOString()
        };
      }

      writeDb(db);
      sendJson(res, 200, { familyId, member: family.members[member.uid] || null });
      return;
    }

    const db = readDb();
    const family = getFamily(db, familyId);
    if (!family) {
      sendJson(res, 404, { error: 'family-not-found' });
      return;
    }

    if (req.method === 'GET' && parts[3] === 'messages') {
      sendJson(res, 200, { messages: family.messages.slice(-80) });
      return;
    }

    if (req.method === 'POST' && parts[3] === 'messages' && parts[4] && parts[5] === 'summarize') {
      const latestDb = readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }

      const message = latestFamily.messages.find(item => item.id === parts[4]);
      if (!message) {
        sendJson(res, 404, { error: 'message-not-found' });
        return;
      }

      if (!message.transcript && message.audio) {
        message.transcript = await transcribeAudioWithLlm(message.audio);
        if (message.transcript && (!message.content || message.content === '語音訊息')) {
          message.content = message.transcript;
        }
        message.transcriptUpdatedAt = new Date().toISOString();
      }

      const sourceText = message.transcript || message.content || '';
      message.aiSummary = sourceText
        ? await summarizeWithLlm(sourceText)
        : '呢段錄音暫時未有可總結的轉文字內容。';
      message.summaryUpdatedAt = new Date().toISOString();
      writeDb(latestDb);
      sendJson(res, 200, { message });
      return;
    }

    if (req.method === 'POST' && parts[3] === 'messages' && parts[4] && parts[5] === 'transcribe') {
      const latestDb = readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }

      const message = latestFamily.messages.find(item => item.id === parts[4]);
      if (!message) {
        sendJson(res, 404, { error: 'message-not-found' });
        return;
      }
      if (!message.audio) {
        sendJson(res, 400, { error: 'missing-audio' });
        return;
      }

      const transcript = await transcribeAudioWithLlm(message.audio);
      if (!transcript || transcript === '[聽不清]') {
        sendJson(res, 422, { error: 'empty-transcript', transcript: transcript || '' });
        return;
      }

      message.transcript = transcript;
      if (!message.content || message.content === '語音訊息') {
        message.content = transcript;
      }
      if (!message.aiSummary) message.aiSummary = '';
      message.transcriptUpdatedAt = new Date().toISOString();
      writeDb(latestDb);
      sendJson(res, 200, { message });
      return;
    }

    if (req.method === 'POST' && parts[3] === 'messages' && parts[4] && parts[5] === 'transcript') {
      const body = await readBody(req);
      const transcript = cleanTranscript(body.transcript);
      if (!transcript) {
        sendJson(res, 400, { error: 'empty-transcript' });
        return;
      }

      const latestDb = readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }

      const message = latestFamily.messages.find(item => item.id === parts[4]);
      if (!message) {
        sendJson(res, 404, { error: 'message-not-found' });
        return;
      }

      message.transcript = transcript;
      if (!message.content || message.content === '語音訊息') {
        message.content = transcript;
      }
      if (!message.aiSummary) message.aiSummary = '';
      message.transcriptUpdatedAt = new Date().toISOString();
      writeDb(latestDb);
      sendJson(res, 200, { message });
      return;
    }

    if (req.method === 'POST' && parts[3] === 'messages') {
      const body = await readBody(req);
      const latestDb = readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }
      const now = new Date();
      const message = {
        id: `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
        uid: cleanText(body.uid),
        senderId: cleanText(body.senderId || body.uid, 'member'),
        senderName: cleanText(body.senderName, '家庭成員'),
        type: cleanText(body.type, 'text'),
        content: cleanText(body.content),
        img: cleanLargeText(body.img) || null,
        audio: cleanLargeText(body.audio) || null,
        audioMime: cleanText(body.audioMime),
        audioDurationMs: Number(body.audioDurationMs) || 0,
        transcript: cleanTranscript(body.transcript),
        aiSummary: cleanText(body.aiSummary),
        time: cleanText(body.time) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        childId: cleanText(body.childId, 'child_1'),
        createdAt: now.toISOString()
      };
      if (!message.content) {
        sendJson(res, 400, { error: 'empty-content' });
        return;
      }
      latestFamily.messages.push(message);
      latestFamily.messages = latestFamily.messages.slice(-500);
      writeDb(latestDb);
      sendJson(res, 201, { message });
      return;
    }

    if (req.method === 'GET' && parts[3] === 'memories') {
      sendJson(res, 200, {
        memories: [...family.memories]
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 200)
      });
      return;
    }

    if (req.method === 'POST' && parts[3] === 'memories') {
      const body = await readBody(req);
      const latestDb = readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }
      const now = new Date();
      const memory = {
        id: `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
        uid: cleanText(body.uid),
        date: Number(body.date) || now.getDate(),
        month: Number(body.month) || now.getMonth() + 1,
        year: Number(body.year) || now.getFullYear(),
        childId: cleanText(body.childId || body.uid, 'member'),
        childName: cleanText(body.childName, '家庭成員'),
        type: cleanText(body.type, 'text'),
        content: cleanText(body.content),
        img: cleanLargeText(body.img) || null,
        createdAt: now.toISOString()
      };
      if (!memory.content) {
        sendJson(res, 400, { error: 'empty-content' });
        return;
      }
      latestFamily.memories.push(memory);
      latestFamily.memories = latestFamily.memories.slice(-1000);
      writeDb(latestDb);
      sendJson(res, 201, { memory });
      return;
    }

    // --- 影片生成 ---
    if (req.method === 'POST' && parts[3] === 'summary-video') {
      const latestDb = readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }

      const body = await readBody(req).catch(() => ({}));
      const targetMonth = Number(body.month) || new Date().getMonth() + 1;
      const targetYear = Number(body.year) || new Date().getFullYear();

      const photoMemories = latestFamily.memories.filter(m =>
        m.img && m.month === targetMonth && m.year === targetYear
      );

      if (photoMemories.length === 0) {
        sendJson(res, 200, { error: 'no-photos', message: '這個月還沒有照片回憶' });
        return;
      }

      try {
        const videoUrl = await generateSummaryVideo(photoMemories, targetYear, targetMonth, familyId);
        sendJson(res, 200, { videoUrl });
      } catch (error) {
        console.error('[video] generation failed', error);
        sendJson(res, 500, { error: 'video-generation-failed', message: error.message });
      }
      return;
    }

    sendJson(res, 404, { error: 'not-found' });
  } catch (error) {
    console.error('[api] request failed', error);
    sendJson(res, error.message === 'invalid-json' ? 400 : 500, { error: error.message || 'server-error' });
  }
});

server.listen(port, host, async () => {
  console.log(`Beckon Stars local API listening on http://${host}:${port}`);
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const { ip } = await res.json();
    console.log(`Public test URL: http://${ip}:${port}/api/health`);
  } catch {
    console.log(`Public test URL: (cannot detect public IP, use local IP)`);
  }
  console.log(`LLM summary endpoint: ${llmBaseUrl}/chat/completions (${llmModel})`);
  console.log(`LLM transcription model: ${llmTranscribeModel}`);
  console.log(`Database: ${dbPath}`);
});
