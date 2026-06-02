const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Lunar, Solar } = require('lunar-javascript');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = '30d';
const BCRYPT_ROUNDS = 10;

// 生成 JWT Token
function generateToken(userId, email) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// 驗證 JWT Token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// 從請求中提取用戶身份
function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

// 簡體轉繁體映射（黃曆宜忌常用詞）
const SIMP_TO_TRAD = {
  '嫁娶': '嫁娶', '出行': '出行', '搬家': '搬家', '搬新房': '搬新房',
  '祈福': '祈福', '安床': '安床', '祭祀': '祭祀', '造庙': '造廟',
  '造车器': '造車器', '造屋': '造屋', '起基': '起基', '上樑': '上樑',
  '开光': '開光', '开池': '開池', '开仓': '開倉', '开市': '開市',
  '开业': '開業', '交易': '交易', '立券': '立券', '纳财': '納財',
  '纳畜': '納畜', '牧养': '牧養', '进人口': '進人口',
  '竖柱': '豎柱', '盖屋': '蓋屋', '合帳': '合帳',
  '栽种': '栽種', '作灶': '作灶', '安机械': '安機械',
  '安葬': '安葬', '入殮': '入殮', '移柩': '移柩',
  '破土': '破土', '谢土': '謝土', '修坟': '修墳',
  '修造': '修造', '装修': '裝修', '动土': '動土',
  '掘井': '掘井', '伐木': '伐木', '造船': '造船',
  '行丧': '行喪', '伐木': '伐木', '作梁': '作梁',
  '放水': '放水', '造桥': '造橋', '筑堤': '築堤',
  '补垣': '補垣', '塞穴': '塞穴', '合寿木': '合壽木',
  '成服': '成服', '除服': '除服', '遷徙': '遷徙',
  '徙遷': '徙遷', '求嗣': '求嗣', '求医': '求醫',
  '治病': '治病', '针灸': '針灸', '会亲友': '會親友',
  '问名': '問名', '订盟': '訂盟', '纳采': '納采',
  '裁衣': '裁衣', '合帳': '合帳', '冠笄': '冠笄',
  '进人口': '進人口', '经络': '經络', '開渠': '開渠',
  '掘井': '掘井', '平治道涂': '平治道塗',
  '修饰垣墙': '修飾垣牆', '修饰墙壁': '修飾牆壁',
  '教牛马': '教牛馬', '教牛': '教牛',
  '遠回': '遠回', '远回': '遠回',
};

function toTraditional(arr) {
  return arr.map(item => SIMP_TO_TRAD[item] || item);
}

const host = process.env.API_HOST || '0.0.0.0';
const port = Number(process.env.API_PORT || 8787);
const dbPath = process.env.API_DB_PATH || path.join(process.cwd(), 'data', 'server-db.json');
const maxBodyBytes = Number(process.env.API_MAX_BODY_BYTES || 24_000_000);
const llmBaseUrl = (process.env.LLM_OPENAI_BASE_URL || 'https://fufu.iqach.top/v1').replace(/\/+$/, '');
const llmApiKey = process.env.LLM_SUMMARY_API_KEY || process.env.OPENAI_API_KEY || 'dummy-key';
const llmModel = process.env.LLM_SUMMARY_MODEL || process.env.OPENAI_SUMMARY_MODEL || 'mimo-v2.5';
const llmTranscribeModel = process.env.LLM_TRANSCRIBE_MODEL || process.env.LLM_AUDIO_MODEL || 'mimo-v2-omni';

// Azure Speech to Text (Fast Transcription)
const azureSttEndpoint = (process.env.AZURE_STT_ENDPOINT || 'https://tmcss-stt-s1.cognitiveservices.azure.com/').replace(/\/+$/, '');
const azureSttKey = process.env.AZURE_STT_KEY || process.env.AZURE_SPEECH_KEY || '';

// OpenRouter (AI 摘要)
const openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
const openrouterModel = process.env.OPENROUTER_MODEL || 'moonshotai/kimi-k2.6:free';
const openrouterReferer = process.env.OPENROUTER_HTTP_REFERER || (process.env.OPENROUTER_SITE_URL || 'https://beckonstars.app');

function ensureDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ families: {} }, null, 2));
  }
}

async function readDb() {
  ensureDb();
  const data = await fs.promises.readFile(dbPath, 'utf8');
  return JSON.parse(data);
}

let _writeLock = Promise.resolve();
function writeDb(db) {
  const payload = JSON.stringify(db, null, 2);
  const tmpPath = `${dbPath}.tmp`;
  _writeLock = _writeLock
    .then(async () => {
      await fs.promises.writeFile(tmpPath, payload, 'utf8');
      await fs.promises.rename(tmpPath, dbPath);
    })
    .catch(err => {
      console.error('[db] write failed:', err.message);
      throw err;
    });
  return _writeLock;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
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
  } catch (err) {
    throw new Error('音訊轉換失敗，請確保 ffmpeg 已安裝且音訊格式正確');
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

async function transcribeWithAzureStt(audioDataUrl) {
  const audio = parseAudioDataUrl(audioDataUrl);
  if (!audio?.data) return '';

  const audioBuffer = Buffer.from(audio.data, 'base64');
  const definition = JSON.stringify({
    locale: 'zh-CN',
    profanityFilterMode: 'Masked'
  });
  const boundary = `----BeckonStars${crypto.randomBytes(6).toString('hex')}`;

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="audio"; filename="audio.wav"\r\n`),
    Buffer.from(`Content-Type: audio/wav\r\n\r\n`),
    audioBuffer,
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="definition"\r\n\r\n`),
    Buffer.from(definition),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const response = await fetch(
    `${azureSttEndpoint}/speechtotext/transcriptions:transcribe?api-version=2024-05-15-preview`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': azureSttKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`azure-stt-${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ''}`);
  }

  const result = await response.json();
  const text = result.combinedPhrases?.map(p => p.text).join('') || '';
  return text || '[聽不清]';
}

async function transcribeAudioWithLlm(audioDataUrl) {
  // 優先：Azure Speech to Text (如果配置了 key)
  if (azureSttKey) {
    try {
      const transcript = await transcribeWithAzureStt(audioDataUrl);
      console.log(`[azure-stt] ✅ 轉譯完成: ${transcript.slice(0, 50)}`);
      return transcript;
    } catch (error) {
      console.warn('[azure-stt] Azure 轉譯失敗，嘗試 fallback LLM', error.message || error);
    }
  }

  // Fallback：原有舊 LLM API
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

  // 優先：OpenRouter（如果配置了 key）
  if (openrouterApiKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterApiKey}`,
          'HTTP-Referer': openrouterReferer,
          'X-Title': process.env.OPENROUTER_APP_TITLE || 'Beckon Stars'
        },
        body: JSON.stringify({
          model: openrouterModel,
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
      if (!response.ok) throw new Error(`openrouter-${response.status}`);
      const payload = await response.json();
      const summary = cleanText(payload.choices?.[0]?.message?.content, fallbackSummary(content));
      if (summary) return summary;
    } catch (error) {
      console.warn('[openrouter] summary failed, trying fallback', error.message || error);
    }
  }

  // Fallback 1：LLM_SUMMARY_ENDPOINT（非 OpenAI 兼容的自定義端點）
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

  // Fallback 2：原有 OpenAI 兼容 API
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
        if (typeof mem.img !== 'string') continue;
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

function logRequest(req, status, startTime) {
  const duration = Date.now() - startTime;
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${req.method} ${req.url} → ${status} (${duration}ms)`);
}

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const origEnd = res.end.bind(res);
  res.end = function(...args) {
    logRequest(req, res.statusCode, startTime);
    return origEnd(...args);
  };
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
        time: new Date().toISOString(),
        auth: true
      });
      return;
    }

    // 註冊新用戶
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';
      const name = (body.name || '').trim();

      if (!email || !email.includes('@')) {
        sendJson(res, 400, { error: 'invalid-email', message: '請輸入有效的電郵地址' });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { error: 'weak-password', message: '密碼長度至少 6 個字元' });
        return;
      }
      if (!name) {
        sendJson(res, 400, { error: 'missing-name', message: '請輸入用戶名稱' });
        return;
      }

      const db = await readDb();
      if (!db.users) db.users = {};
      if (!db.usersByEmail) db.usersByEmail = {};

      if (db.usersByEmail[email]) {
        sendJson(res, 409, { error: 'email-exists', message: '此電郵已註冊，請直接登入' });
        return;
      }

      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = {
        userId,
        email,
        passwordHash,
        name,
        picture: '',
        createdAt: new Date().toISOString(),
        families: []
      };
      db.users[userId] = user;
      db.usersByEmail[email] = userId;
      await writeDb(db);
      console.log(`[auth] 🆕 新用戶註冊: ${name} (${email})`);

      const token = generateToken(userId, email);
      sendJson(res, 201, {
        ok: true,
        token,
        user: { userId, email, name, picture: '', families: [] }
      });
      return;
    }

    // 用戶登入
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (!email || !password) {
        sendJson(res, 400, { error: 'missing-fields', message: '請輸入電郵和密碼' });
        return;
      }

      const db = await readDb();
      const userId = db.usersByEmail?.[email];
      const user = userId ? db.users?.[userId] : null;

      if (!user) {
        sendJson(res, 401, { error: 'invalid-credentials', message: '電郵或密碼不正確' });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        sendJson(res, 401, { error: 'invalid-credentials', message: '電郵或密碼不正確' });
        return;
      }

      user.lastLoginAt = new Date().toISOString();
      await writeDb(db);
      console.log(`[auth] 🔑 用戶登入: ${user.name} (${user.email})`);

      const token = generateToken(user.userId, user.email);
      sendJson(res, 200, {
        ok: true,
        token,
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          picture: user.picture || '',
          families: user.families || []
        }
      });
      return;
    }

    // 取得用戶資訊（需要登入）
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const db = await readDb();
      const user = db.users?.[authUser.userId];
      if (!user) {
        sendJson(res, 404, { error: 'user-not-found' });
        return;
      }
      sendJson(res, 200, {
        userId: user.userId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        families: user.families || []
      });
      return;
    }

    // 更新個人資料（需要登入）
    if (req.method === 'PUT' && pathname === '/api/auth/profile') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const body = await readBody(req);
      const db = await readDb();
      const user = db.users?.[authUser.userId];
      if (!user) {
        sendJson(res, 404, { error: 'user-not-found' });
        return;
      }

      if (body.name !== undefined) {
        const newName = (body.name || '').trim();
        if (!newName) {
          sendJson(res, 400, { error: 'missing-name', message: '名稱不能為空' });
          return;
        }
        user.name = newName;
      }
      if (body.avatar !== undefined) {
        user.picture = body.avatar;
      }
      user.updatedAt = new Date().toISOString();

      // 同步更新家庭成員資訊
      if (user.families && user.families.length > 0) {
        for (const fid of user.families) {
          const family = getFamily(db, fid);
          if (family?.members?.[authUser.userId]) {
            if (body.name !== undefined) family.members[authUser.userId].name = user.name;
            if (body.avatar !== undefined) family.members[authUser.userId].avatar = user.picture;
          }
        }
      }

      await writeDb(db);
      console.log(`[auth] 📝 用戶更新資料: ${user.name} (${user.email})`);
      sendJson(res, 200, {
        ok: true,
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          picture: user.picture || '',
          families: user.families || []
        }
      });
      return;
    }

    // 修改密碼（需要登入）
    if (req.method === 'PUT' && pathname === '/api/auth/password') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      const body = await readBody(req);
      const oldPassword = body.oldPassword || '';
      const newPassword = body.newPassword || '';

      if (!oldPassword || !newPassword) {
        sendJson(res, 400, { error: 'missing-fields', message: '請輸入舊密碼和新密碼' });
        return;
      }
      if (newPassword.length < 6) {
        sendJson(res, 400, { error: 'weak-password', message: '新密碼長度至少 6 個字元' });
        return;
      }

      const db = await readDb();
      const user = db.users?.[authUser.userId];
      if (!user) {
        sendJson(res, 404, { error: 'user-not-found' });
        return;
      }

      const valid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!valid) {
        sendJson(res, 401, { error: 'wrong-password', message: '舊密碼不正確' });
        return;
      }

      user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      user.updatedAt = new Date().toISOString();
      await writeDb(db);
      console.log(`[auth] 🔒 用戶修改密碼: ${user.email}`);
      sendJson(res, 200, { ok: true, message: '密碼已更新' });
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
      const yiList = toTraditional(lunar.getDayYi());
      const jiList = toTraditional(lunar.getDayJi());
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
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'unauthorized', message: '請先登入' });
        return;
      }

      const body = await readBody(req);
      const db = await readDb();
      const user = db.users?.[authUser.userId];
      if (!user) {
        sendJson(res, 404, { error: 'user-not-found' });
        return;
      }

      let family = getFamily(db, familyId);
      if (!family) {
        if (!body.shouldCreate) {
          sendJson(res, 404, { error: 'family-not-found' });
          return;
        }
        family = createFamily(db, familyId, authUser.userId);
      }

      const memberRole = cleanText(body.role, 'child');
      const memberName = cleanText(body.name, user.name || '家庭成員');

      family.members[authUser.userId] = {
        uid: authUser.userId,
        name: memberName,
        role: memberRole,
        avatar: cleanText(body.avatar),
        email: user.email,
        picture: user.picture,
        joinedAt: family.members[authUser.userId]?.joinedAt || new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      };

      // 將家庭加入用戶的家庭列表
      if (!user.families) user.families = [];
      if (!user.families.includes(familyId)) {
        user.families.push(familyId);
      }

      writeDb(db);
      const memberCount = Object.keys(family.members).length;
      const isNew = family.members[authUser.userId].joinedAt === family.members[authUser.userId].lastSeenAt;
      console.log(`[data] 🔗 ${isNew ? '新成員加入' : '成員連線'} [${familyId}] ${memberName} (${memberRole}) - 共 ${memberCount} 位成員`);
      sendJson(res, 200, {
        familyId,
        member: family.members[authUser.userId],
        family: {
          familyId: family.familyId,
          members: Object.values(family.members).map(m => ({ uid: m.uid, name: m.name, role: m.role, avatar: m.avatar }))
        }
      });
      return;
    }

    const db = await readDb();
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
      const latestDb = await readDb();
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
      const latestDb = await readDb();
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

      const latestDb = await readDb();
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
      const latestDb = await readDb();
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
      if (!message.content && !message.img && !message.audio) {
        sendJson(res, 400, { error: 'empty-content' });
        return;
      }
      latestFamily.messages.push(message);
      latestFamily.messages = latestFamily.messages.slice(-500);
      writeDb(latestDb);
      console.log(`[data] 💬 新訊息 [${familyId}] ${message.senderName}: ${message.type === 'photo' ? '📷 圖片' : message.type === 'audio' ? '🎤 語音' : message.content.slice(0, 50)}`);
      sendJson(res, 201, { message });

      // 背景自動轉譯語音訊息
      if (message.type === 'audio' && message.audio && !message.transcript) {
        (async () => {
          try {
            const transcript = await transcribeAudioWithLlm(message.audio);
            if (transcript) {
              const db = await readDb();
              const family = getFamily(db, familyId);
              const msg = family?.messages?.find(m => m.id === message.id);
              if (msg) {
                msg.transcript = transcript;
                if (!msg.content || msg.content === '語音訊息') msg.content = transcript;
                msg.transcriptUpdatedAt = new Date().toISOString();
                await writeDb(db);
                console.log(`[transcribe] ✅ 語音轉譯完成 [${familyId}] ${transcript.slice(0, 50)}`);
              }
            }
          } catch (err) {
            console.warn('[transcribe] 語音自動轉譯失敗:', err.message);
          }
        })();
      }
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
      const latestDb = await readDb();
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
      if (!memory.content && !memory.img) {
        sendJson(res, 400, { error: 'empty-content' });
        return;
      }
      latestFamily.memories.push(memory);
      latestFamily.memories = latestFamily.memories.slice(-1000);
      writeDb(latestDb);
      console.log(`[data] 📝 新回憶 [${familyId}] ${memory.childName}: ${memory.type === 'photo' ? '📷 圖片' : memory.content.slice(0, 50)}`);
      sendJson(res, 201, { memory });
      return;
    }

    // --- 影片生成 ---
    if (req.method === 'POST' && parts[3] === 'summary-video') {
      const latestDb = await readDb();
      const latestFamily = getFamily(latestDb, familyId);
      if (!latestFamily) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }

      const body = await readBody(req).catch(e => { console.warn('[video] body read failed:', e.message); return {}; });
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

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[fatal] Port ${port} is already in use. Stop the other process or change API_PORT.`);
  } else {
    console.error('[fatal] Server error:', err);
  }
  process.exit(1);
});

server.listen(port, host, async () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🌟 星喚 Beckon Stars API Server`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📡 監聽: http://${host}:${port}`);
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const { ip } = await res.json();
    console.log(`🌐 公網: http://${ip}:${port}/api/health`);
  } catch {
    console.log(`🌐 公網: (無法偵測公網 IP)`);
  }

  // 顯示資料庫統計
  try {
    const db = await readDb();
    const families = Object.keys(db.families || {});
    let totalMessages = 0, totalMemories = 0, totalMembers = 0;
    for (const fid of families) {
      const f = db.families[fid];
      totalMessages += (f.messages || []).length;
      totalMemories += (f.memories || []).length;
      totalMembers += Object.keys(f.members || {}).length;
    }
    console.log(`\n📊 資料庫統計:`);
    console.log(`   家庭: ${families.length} | 成員: ${totalMembers} | 訊息: ${totalMessages} | 回憶: ${totalMemories}`);
  } catch (e) {
    console.log(`📊 資料庫: (讀取統計失敗)`);
  }

  console.log(`\n🤖 LLM 摘要: ${llmBaseUrl} (${llmModel})`);
  console.log(`🎤 LLM 轉譯: ${llmTranscribeModel}`);
  console.log(`💾 資料庫: ${dbPath}`);
  console.log(`${'='.repeat(50)}\n`);
});
