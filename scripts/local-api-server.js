const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Lunar, Solar } = require('lunar-javascript');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const formidable = require('formidable');
const sharp = require('sharp');

// 使用 SQLite 適配器（保持與舊 JSON 接口兼容）
const USE_SQLITE = (process.env.USE_SQLITE || 'true').toLowerCase() === 'true';
const dbAdapter = USE_SQLITE ? require('./db-adapter') : null;

function loadEnvFile(filePath = path.join(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = '30d';
const BCRYPT_ROUNDS = 10;
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_TOKEN_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
let googleJwkCache = {
  expiresAt: 0,
  keys: new Map()
};

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

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function parseJwtPart(value) {
  return JSON.parse(decodeBase64Url(value).toString('utf8'));
}

function parseCacheMaxAge(cacheControl) {
  const match = String(cacheControl || '').match(/max-age=(\d+)/i);
  return match ? Number(match[1]) : 3600;
}

async function loadGoogleJwks(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && googleJwkCache.keys.size > 0 && googleJwkCache.expiresAt > now) {
    return googleJwkCache.keys;
  }

  let response;
  try {
    response = await fetch(GOOGLE_JWKS_URL);
  } catch (error) {
    throw new Error('google-jwks-unavailable');
  }
  if (!response.ok) {
    throw new Error('google-jwks-unavailable');
  }

  const payload = await response.json();
  const keys = new Map();
  for (const jwk of payload.keys || []) {
    if (jwk.kid) keys.set(jwk.kid, jwk);
  }

  googleJwkCache = {
    keys,
    expiresAt: now + parseCacheMaxAge(response.headers.get('cache-control')) * 1000
  };
  return keys;
}

async function verifyGoogleIdToken(credential) {
  if (!GOOGLE_CLIENT_ID) {
    const error = new Error('google-client-not-configured');
    error.status = 503;
    throw error;
  }

  if (typeof credential !== 'string' || credential.split('.').length !== 3) {
    const error = new Error('invalid-google-credential');
    error.status = 400;
    throw error;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = credential.split('.');
  let header;
  let payload;
  try {
    header = parseJwtPart(encodedHeader);
    payload = parseJwtPart(encodedPayload);
  } catch (error) {
    const invalid = new Error('invalid-google-credential');
    invalid.status = 400;
    throw invalid;
  }

  if (header.alg !== 'RS256' || !header.kid) {
    const error = new Error('unsupported-google-token');
    error.status = 401;
    throw error;
  }

  let jwk = (await loadGoogleJwks()).get(header.kid);
  if (!jwk) {
    jwk = (await loadGoogleJwks(true)).get(header.kid);
  }
  if (!jwk) {
    const error = new Error('google-key-not-found');
    error.status = 401;
    throw error;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const isValidSignature = verifier.verify(publicKey, decodeBase64Url(encodedSignature));
  if (!isValidSignature) {
    const error = new Error('invalid-google-signature');
    error.status = 401;
    throw error;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!GOOGLE_TOKEN_ISSUERS.has(payload.iss)) {
    const error = new Error('invalid-google-issuer');
    error.status = 401;
    throw error;
  }
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    const error = new Error('invalid-google-audience');
    error.status = 401;
    throw error;
  }
  if (!payload.exp || Number(payload.exp) <= nowSeconds) {
    const error = new Error('expired-google-token');
    error.status = 401;
    throw error;
  }
  if (payload.iat && Number(payload.iat) > nowSeconds + 300) {
    const error = new Error('invalid-google-issued-at');
    error.status = 401;
    throw error;
  }
  if (!payload.sub || !payload.email || !(payload.email_verified === true || payload.email_verified === 'true')) {
    const error = new Error('unverified-google-account');
    error.status = 401;
    throw error;
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: cleanText(payload.name || payload.given_name || String(payload.email).split('@')[0], 'Google 用戶'),
    picture: cleanText(payload.picture || '')
  };
}

function normalizeAuthDb(db) {
  if (!db.users) db.users = {};
  if (!db.usersByEmail) db.usersByEmail = {};
  if (!db.usersByGoogleSub) db.usersByGoogleSub = {};

  for (const user of Object.values(db.users)) {
    if (user?.email && !db.usersByEmail[user.email]) {
      db.usersByEmail[user.email] = user.userId;
    }
    if (user?.googleSub && !db.usersByGoogleSub[user.googleSub]) {
      db.usersByGoogleSub[user.googleSub] = user.userId;
    }
  }
}

function publicUser(user) {
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    picture: user.picture || '',
    families: user.families || []
  };
}

const DAILY_MESSAGE_REWARD_ID = 'daily-message-avatar-frame';
const DAILY_MESSAGE_REWARD_THRESHOLD = Number(process.env.DAILY_MESSAGE_REWARD_THRESHOLD || 20);
const DAILY_MESSAGE_REWARD_TIME_ZONE = process.env.DAILY_MESSAGE_REWARD_TIME_ZONE || 'Asia/Hong_Kong';
const DAILY_MESSAGE_REWARD_FRAME_URL = 'avatar-frame-daily.png';

function getRewardDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_MESSAGE_REWARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getMessageSenderId(message, rowUserId = '') {
  return cleanText(message?.senderId || message?.uid || message?.userId || rowUserId);
}

function getMessageCreatedAt(message, rowTimestamp = '') {
  return message?.createdAt || message?.timestamp || rowTimestamp || '';
}

function countJsonDailyMessages(family) {
  const todayKey = getRewardDateKey();
  const counts = {};
  for (const message of family?.messages || []) {
    const senderId = getMessageSenderId(message);
    if (!senderId) continue;
    if (getRewardDateKey(getMessageCreatedAt(message)) !== todayKey) continue;
    counts[senderId] = (counts[senderId] || 0) + 1;
  }
  return counts;
}

function countSqliteDailyMessages(familyId) {
  const todayKey = getRewardDateKey();
  const counts = {};
  try {
    const sqlite = require('./db-sqlite').initDb();
    const rows = sqlite.prepare('SELECT user_id, timestamp, data FROM messages WHERE family_id = ?').all(familyId);
    for (const row of rows) {
      let message = null;
      if (row.data) {
        try { message = JSON.parse(row.data); } catch (e) { message = null; }
      }
      const senderId = getMessageSenderId(message, row.user_id);
      if (!senderId) continue;
      if (getRewardDateKey(getMessageCreatedAt(message, row.timestamp)) !== todayKey) continue;
      counts[senderId] = (counts[senderId] || 0) + 1;
    }
  } catch (error) {
    console.warn('[reward] failed to count sqlite messages:', error.message);
  }
  return counts;
}

function buildDailyMessageRewardStatus(db, familyId, currentUserId = '') {
  const family = getFamily(db, familyId);
  const counts = USE_SQLITE ? countSqliteDailyMessages(familyId) : countJsonDailyMessages(family);
  const members = {};
  const memberEntries = Object.entries(family?.members || {});

  const toStatus = userId => {
    const count = counts[userId] || 0;
    const active = count >= DAILY_MESSAGE_REWARD_THRESHOLD;
    return {
      userId,
      count,
      threshold: DAILY_MESSAGE_REWARD_THRESHOLD,
      remaining: Math.max(DAILY_MESSAGE_REWARD_THRESHOLD - count, 0),
      active,
      frameId: active ? DAILY_MESSAGE_REWARD_ID : null,
      frameUrl: active ? DAILY_MESSAGE_REWARD_FRAME_URL : ''
    };
  };

  for (const [memberId] of memberEntries) {
    members[memberId] = toStatus(memberId);
  }
  for (const userId of Object.keys(counts)) {
    if (!members[userId]) members[userId] = toStatus(userId);
  }
  if (currentUserId && !members[currentUserId]) {
    members[currentUserId] = toStatus(currentUserId);
  }

  return {
    ok: true,
    dateKey: getRewardDateKey(),
    timezone: DAILY_MESSAGE_REWARD_TIME_ZONE,
    reward: {
      id: DAILY_MESSAGE_REWARD_ID,
      title: '每日 20 條訊息頭像框',
      threshold: DAILY_MESSAGE_REWARD_THRESHOLD,
      frameUrl: DAILY_MESSAGE_REWARD_FRAME_URL
    },
    currentUser: currentUserId ? members[currentUserId] : null,
    members
  };
}

function googleAuthErrorMessage(code) {
  const messages = {
    'google-client-not-configured': 'Google 登入尚未設定，請在伺服器設定 GOOGLE_CLIENT_ID',
    'invalid-google-credential': 'Google 登入資料無效，請重新登入',
    'unsupported-google-token': 'Google 登入資料格式不支援',
    'google-jwks-unavailable': '暫時無法驗證 Google 登入，請稍後再試',
    'google-key-not-found': '暫時無法驗證 Google 登入，請稍後再試',
    'invalid-google-signature': 'Google 登入驗證失敗，請重新登入',
    'invalid-google-issuer': 'Google 登入來源無效',
    'invalid-google-audience': 'Google 登入設定不匹配，請檢查 GOOGLE_CLIENT_ID',
    'expired-google-token': 'Google 登入已過期，請重新登入',
    'invalid-google-issued-at': 'Google 登入時間無效，請重新登入',
    'unverified-google-account': '請先完成 Google 電郵驗證'
  };
  return messages[code] || 'Google 登入失敗，請稍後再試';
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
const maxBodyBytes = Number(process.env.API_MAX_BODY_BYTES || 80_000_000);
const llmBaseUrl = (process.env.LLM_OPENAI_BASE_URL || 'https://fufu.iqach.top/v1').replace(/\/+$/, '');
const llmApiKey = process.env.LLM_SUMMARY_API_KEY || process.env.OPENAI_API_KEY || '';
const llmModel = process.env.LLM_SUMMARY_MODEL || process.env.OPENAI_SUMMARY_MODEL || 'mimo-v2.5';
const llmTranscribeModel = process.env.LLM_TRANSCRIBE_MODEL || process.env.LLM_AUDIO_MODEL || 'mimo-v2-omni';

// Azure Speech to Text REST API (short audio)
const azureSttKey = process.env.AZURE_STT_KEY || process.env.AZURE_SPEECH_KEY || '';
const azureSttRegion = process.env.AZURE_STT_REGION || 'eastasia';
const azureSttLanguage = process.env.AZURE_STT_LANGUAGE || process.env.AZURE_STT_LOCALE || 'zh-HK';
const azureSttRecognitionHost = (process.env.AZURE_STT_RECOGNITION_HOST || `${azureSttRegion}.stt.speech.microsoft.com`)
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

// OpenRouter (AI 摘要)
const openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
const openrouterModel = process.env.OPENROUTER_MODEL || 'cohere/north-mini-code:free';
const openrouterModels = (process.env.OPENROUTER_FALLBACK_MODELS || openrouterModel)
  .split(',')
  .map(model => model.trim())
  .filter(Boolean);
const openrouterReferer = process.env.OPENROUTER_HTTP_REFERER || (process.env.OPENROUTER_SITE_URL || 'https://beckonstars.app');

// 媒體存儲配置
const mediaStoragePath = process.env.MEDIA_STORAGE_PATH || path.join(process.cwd(), 'data', 'media');
const mediaBaseUrl = process.env.MEDIA_BASE_URL || '/media';
const mediaMaxSizeMB = Number(process.env.MEDIA_MAX_SIZE_MB || 60);
const mediaMaxSizeBytes = mediaMaxSizeMB * 1024 * 1024;

function getMemoryImageValue(memory, preferThumbnail = false) {
  const primary = memory?.imgUrl || memory?.imageUrl || memory?.image_url || memory?.img || '';
  const thumbnail = memory?.thumbnailUrl || memory?.thumbnail || memory?.thumbnail_url || '';
  return preferThumbnail ? (thumbnail || primary) : (primary || thumbnail);
}

// 允許的 MIME 類型
const ALLOWED_MIME_TYPES = {
  'image/jpeg': { ext: 'jpg', category: 'image', maxSize: 50 * 1024 * 1024 },
  'image/png': { ext: 'png', category: 'image', maxSize: 50 * 1024 * 1024 },
  'image/webp': { ext: 'webp', category: 'image', maxSize: 50 * 1024 * 1024 },
  'audio/mp4': { ext: 'm4a', category: 'audio', maxSize: 20 * 1024 * 1024 },
  'audio/mpeg': { ext: 'mp3', category: 'audio', maxSize: 20 * 1024 * 1024 },
  'audio/wav': { ext: 'wav', category: 'audio', maxSize: 20 * 1024 * 1024 }
};

const serverLogEntries = [];

function formatServerLogValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value.slice(0, 500);
  try {
    const json = JSON.stringify(value);
    return json.length > 500 ? json.slice(0, 497) + '...' : json;
  } catch (error) {
    return String(value).slice(0, 500);
  }
}

function appendServerLog(level, args) {
  const message = args.map(formatServerLogValue).join(' ');
  serverLogEntries.push({
    time: new Date().toISOString(),
    level,
    message: message.slice(0, 1000)
  });
  if (serverLogEntries.length > 100) serverLogEntries.shift();
}

['log', 'warn', 'error'].forEach(level => {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    appendServerLog(level, args);
    original(...args);
  };
});

function ensureDb() {
  if (USE_SQLITE) {
    require('./db-sqlite').initDb();
    return;
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ families: {} }, null, 2));
  }
}

async function readDb() {
  if (USE_SQLITE) {
    return dbAdapter.readDb();
  }
  ensureDb();
  const data = await fs.promises.readFile(dbPath, 'utf8');
  return JSON.parse(data);
}

let _writeLock = Promise.resolve();
function writeDb(db) {
  if (USE_SQLITE) {
    _writeLock = _writeLock
      .then(async () => {
        await dbAdapter.writeDb(db);
      })
      .catch(err => {
        console.error('[db] write failed:', err.message);
        throw err;
      });
    return _writeLock;
  }

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

function fallbackSummary(text, summaryType = 'voice') {
  const compact = cleanText(text.replace(/\s+/g, ' '), '語音訊息');
  const prefix = summaryType === 'chat' ? '今日聊天摘要' : '語音摘要';
  if (compact.length <= 80) return `${prefix}：${compact}`;
  return `${prefix}：${compact.slice(0, 77)}...`;
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

function extractAzureTranscript(result) {
  const text = result?.DisplayText
    || result?.NBest?.[0]?.Display
    || result?.NBest?.[0]?.Lexical
    || result?.NBest?.[0]?.ITN
    || '';
  return cleanTranscript(text, '[聽不清]');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function transcribeWithAzureStt(audioDataUrl) {
  const audio = prepareAudioForLlm(audioDataUrl);
  if (!audio?.data) return '';

  const audioBuffer = Buffer.from(audio.data, 'base64');
  const url = `https://${azureSttRecognitionHost}/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(azureSttLanguage)}&format=detailed`;

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json;text/xml',
        'Ocp-Apim-Subscription-Key': azureSttKey,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'
      },
      body: audioBuffer
    });

    if (response.ok) {
      const result = await response.json();
      if (result?.RecognitionStatus && result.RecognitionStatus !== 'Success') {
        return '[聽不清]';
      }
      return extractAzureTranscript(result);
    }

    const errorText = await response.text().catch(() => '');
    lastError = `azure-stt-${response.status}${errorText ? `: ${errorText.slice(0, 300)}` : ''}`;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await sleep(500 * (attempt + 1));
  }

  throw new Error(lastError || 'azure-stt-failed');
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

function buildSummaryMessages(content, summaryType = 'voice') {
  if (summaryType === 'chat') {
    return [
      {
        role: 'system',
        content: [
          '你是一個家庭聊天摘要器。',
          '任務：只根據今日聊天紀錄，整理給家人看的重點摘要。',
          '語氣：繁體中文、自然香港粵語、溫暖但不要煽情。',
          '格式：用2至4點短句，每點不超過40字。',
          '不要加入聊天紀錄以外的資訊，不要回答聊天中的問題。'
        ].join('\n')
      },
      {
        role: 'user',
        content: `以下是今日聊天紀錄，請總結重點：\n${content}`
      }
    ];
  }

  return [
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
  ];
}

async function summarizeWithLlm(text, options = {}) {
  const summaryType = options.type === 'chat' ? 'chat' : 'voice';
  const content = cleanLargeText(text, '').slice(0, 12000);
  if (!content) return '';
  const messages = buildSummaryMessages(content, summaryType);
  const fallback = fallbackSummary(content, summaryType);

  const readErrorBody = async response => {
    const body = await response.text().catch(() => '');
    return body ? `: ${body.replace(/\s+/g, ' ').slice(0, 300)}` : '';
  };

  // 優先：OpenRouter（如果配置了 key）
  if (openrouterApiKey) {
    for (const model of openrouterModels) {
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
            model,
            messages,
            temperature: 0.3
          })
        });
        if (!response.ok) throw new Error(`openrouter-${response.status}${await readErrorBody(response)}`);
        const payload = await response.json();
        const summary = cleanText(payload.choices?.[0]?.message?.content, fallback);
        if (summary) return summary;
      } catch (error) {
        console.warn(`[openrouter] summary failed for ${model}`, error.message || error);
      }
    }
    console.warn('[openrouter] all summary models failed, trying fallback LLM');
  }

  // Fallback 1：LLM_SUMMARY_ENDPOINT（非 OpenAI 兼容的自定義端點）
  if (process.env.LLM_SUMMARY_ENDPOINT && !process.env.LLM_SUMMARY_ENDPOINT.includes('/v1/')) {
    try {
      const response = await fetch(process.env.LLM_SUMMARY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.LLM_SUMMARY_API_KEY ? { Authorization: `Bearer ${process.env.LLM_SUMMARY_API_KEY}` } : {})
        },
        body: JSON.stringify({ text: content })
      });
      if (!response.ok) throw new Error(`llm-endpoint-${response.status}${await readErrorBody(response)}`);
      const payload = await response.json();
      const summary = cleanText(payload.summary || payload.text || payload.result, fallback);
      if (summary) return summary;
    } catch (error) {
      console.warn('[llm-endpoint] summary failed, trying OpenAI-compatible fallback', error.message || error);
    }
  }

  // Fallback 2：原有 OpenAI 兼容 API
  if (!llmApiKey) {
    console.warn('[llm] summary fallback skipped: LLM_SUMMARY_API_KEY or OPENAI_API_KEY is not configured');
    return fallback;
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
        messages,
        temperature: 0.3
      })
    });
    if (!response.ok) throw new Error(`llm-${response.status}${await readErrorBody(response)}`);
    const payload = await response.json();
    return cleanText(payload.choices?.[0]?.message?.content, fallback);
  } catch (error) {
    console.warn('[llm] summary failed, using fallback', error.message || error);
    return fallback;
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
        const imageValue = getMemoryImageValue(mem);
        if (typeof imageValue !== 'string' || !imageValue) continue;
        if (imageValue.startsWith('data:')) {
          const base64 = imageValue.split(',')[1];
          imgData = Buffer.from(base64, 'base64');
        } else if (imageValue.startsWith('/')) {
          const imagePathname = new URL(imageValue, 'http://localhost').pathname;
          const filename = path.basename(imagePathname);
          const localImagePath = path.join(mediaStoragePath, filename);
          if (!fs.existsSync(localImagePath)) continue;
          imgData = fs.readFileSync(localImagePath);
        } else {
          const resp = await fetch(imageValue);
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

// 媒體處理函數
function ensureMediaDir() {
  fs.mkdirSync(mediaStoragePath, { recursive: true });
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function generateUniqueFilename(originalFilename, mimeType) {
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(6).toString('hex');
  const mimeInfo = ALLOWED_MIME_TYPES[mimeType];
  const ext = mimeInfo?.ext || path.extname(originalFilename).slice(1) || 'bin';
  return `${timestamp}_${randomId}.${ext}`;
}

async function createThumbnail(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .resize(400, null, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
    return true;
  } catch (error) {
    console.warn('[media] thumbnail generation failed:', error.message);
    return false;
  }
}

async function getImageDimensions(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    console.warn('[media] failed to get image dimensions:', error.message);
    return null;
  }
}

async function handleMultipartUpload(req) {
  ensureMediaDir();

  const form = formidable({
    maxFileSize: mediaMaxSizeBytes,
    maxFiles: 1,
    allowEmptyFiles: false,
    filter: ({ mimetype }) => {
      return ALLOWED_MIME_TYPES.hasOwnProperty(mimetype || '');
    }
  });

  return new Promise((resolve, reject) => {
    form.parse(req, async (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      const fileArray = files.file;
      if (!fileArray || fileArray.length === 0) {
        reject(new Error('no-file-uploaded'));
        return;
      }

      const uploadedFile = fileArray[0];
      const mimeType = uploadedFile.mimetype;
      const mimeInfo = ALLOWED_MIME_TYPES[mimeType];

      if (!mimeInfo) {
        reject(new Error('invalid-mime-type'));
        return;
      }

      if (uploadedFile.size > mimeInfo.maxSize) {
        reject(new Error('file-too-large'));
        return;
      }

      try {
        const filename = generateUniqueFilename(uploadedFile.originalFilename || 'upload', mimeType);
        const filePath = path.join(mediaStoragePath, filename);

        // 移動文件到最終位置
        await fs.promises.rename(uploadedFile.filepath, filePath);

        const result = {
          mediaUrl: `${mediaBaseUrl}/${filename}`,
          mime: mimeType,
          size: uploadedFile.size
        };

        // 處理圖片：生成縮圖和獲取尺寸
        if (mimeInfo.category === 'image') {
          const dimensions = await getImageDimensions(filePath);
          if (dimensions) {
            result.width = dimensions.width;
            result.height = dimensions.height;
          }

          const thumbnailFilename = filename.replace(/\.([^.]+)$/, '_thumb.jpg');
          const thumbnailPath = path.join(mediaStoragePath, thumbnailFilename);
          const thumbnailCreated = await createThumbnail(filePath, thumbnailPath);

          if (thumbnailCreated) {
            result.thumbnailUrl = `${mediaBaseUrl}/${thumbnailFilename}`;
          }
        }

        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleBase64Upload(body) {
  ensureMediaDir();

  const { data, mime, filename } = body;

  if (!data || !mime) {
    throw new Error('missing-data-or-mime');
  }

  const mimeInfo = ALLOWED_MIME_TYPES[mime];
  if (!mimeInfo) {
    throw new Error('invalid-mime-type');
  }

  // 解析 base64 數據
  let base64Data = data;
  if (data.startsWith('data:')) {
    const match = data.match(/^data:[^;,]+(?:;[^,]*)?,(.*)$/s);
    if (!match) {
      throw new Error('invalid-base64-format');
    }
    base64Data = match[1];
  }

  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length > mimeInfo.maxSize) {
    throw new Error('file-too-large');
  }

  const generatedFilename = generateUniqueFilename(filename || 'upload', mime);
  const filePath = path.join(mediaStoragePath, generatedFilename);

  await fs.promises.writeFile(filePath, buffer);

  const result = {
    mediaUrl: `${mediaBaseUrl}/${generatedFilename}`,
    mime: mime,
    size: buffer.length
  };

  // 處理圖片：生成縮圖和獲取尺寸
  if (mimeInfo.category === 'image') {
    const dimensions = await getImageDimensions(filePath);
    if (dimensions) {
      result.width = dimensions.width;
      result.height = dimensions.height;
    }

    const thumbnailFilename = generatedFilename.replace(/\.([^.]+)$/, '_thumb.jpg');
    const thumbnailPath = path.join(mediaStoragePath, thumbnailFilename);
    const thumbnailCreated = await createThumbnail(filePath, thumbnailPath);

    if (thumbnailCreated) {
      result.thumbnailUrl = `${mediaBaseUrl}/${thumbnailFilename}`;
    }
  }

  return result;
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
  const url = req.url.length > 100 ? req.url.slice(0, 97) + '...' : req.url;
  console.log(`[${ts}] ${req.method} ${url} → ${status} (${duration}ms)`);
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

    // 靜態文件：媒體文件 (圖片、音訊)
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const filename = path.basename(url.pathname);

      // 安全檢查：防止路徑遍歷
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        res.writeHead(400);
        res.end('Invalid filename');
        return;
      }

      const filePath = path.join(mediaStoragePath, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.m4a': 'audio/mp4',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav'
        };
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=31536000'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end('Media not found');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/avatar-frame-daily.png') {
      const filePath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'avatar-frame-daily.png');
      if (fs.existsSync(filePath)) {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400'
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
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
        auth: true,
        googleAuth: Boolean(GOOGLE_CLIENT_ID)
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/logs') {
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 80));
      sendJson(res, 200, {
        ok: true,
        time: new Date().toISOString(),
        logs: serverLogEntries.slice(-limit)
      });
      return;
    }

    // 媒體上傳
    if (req.method === 'POST' && pathname === '/api/media/upload') {
      // 驗證用戶身份
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'unauthorized', message: '請先登入' });
        return;
      }

      try {
        const contentType = req.headers['content-type'] || '';

        let result;
        if (contentType.startsWith('multipart/form-data')) {
          // 處理 multipart 上傳
          result = await handleMultipartUpload(req);
        } else if (contentType.startsWith('application/json')) {
          // 處理 base64 上傳
          const body = await readBody(req);
          result = await handleBase64Upload(body);
        } else {
          sendJson(res, 400, { error: 'unsupported-content-type', message: '僅支援 multipart/form-data 或 application/json' });
          return;
        }

        console.log(`[media] ✅ 上傳成功 [${authUser.email}] ${result.mime} ${Math.round(result.size / 1024)}KB`);
        sendJson(res, 201, result);
      } catch (error) {
        console.error('[media] 上傳失敗:', error.message);

        const errorMessages = {
          'no-file-uploaded': '未上傳文件',
          'invalid-mime-type': '不支援的文件類型',
          'file-too-large': '文件大小超過限制',
          'missing-data-or-mime': '缺少 data 或 mime 欄位',
          'invalid-base64-format': '無效的 base64 格式'
        };

        const message = errorMessages[error.message] || '上傳失敗';
        const status = error.message === 'file-too-large' ? 413 : 400;

        sendJson(res, status, { error: error.message, message });
      }
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
      normalizeAuthDb(db);

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

    // Google 登入 / 自動註冊
    if (req.method === 'POST' && pathname === '/api/auth/google') {
      const body = await readBody(req);
      let googleUser;
      try {
        googleUser = await verifyGoogleIdToken(body.credential || body.idToken || '');
      } catch (error) {
        const status = error.status || 401;
        sendJson(res, status, {
          error: error.message || 'google-auth-failed',
          message: googleAuthErrorMessage(error.message)
        });
        return;
      }

      const db = await readDb();
      normalizeAuthDb(db);

      let userId = db.usersByGoogleSub[googleUser.sub] || db.usersByEmail[googleUser.email];
      let user = userId ? db.users[userId] : null;
      const now = new Date().toISOString();
      let created = false;

      if (user?.googleSub && user.googleSub !== googleUser.sub) {
        sendJson(res, 409, {
          error: 'google-account-conflict',
          message: '此電郵已綁定另一個 Google 帳號'
        });
        return;
      }

      if (!user) {
        userId = crypto.randomUUID();
        user = {
          userId,
          email: googleUser.email,
          passwordHash: null,
          googleSub: googleUser.sub,
          authProviders: {
            google: { sub: googleUser.sub, linkedAt: now }
          },
          name: googleUser.name,
          picture: googleUser.picture,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
          families: []
        };
        db.users[userId] = user;
        created = true;
      } else {
        user.googleSub = googleUser.sub;
        user.authProviders = user.authProviders || {};
        user.authProviders.google = user.authProviders.google || { sub: googleUser.sub, linkedAt: now };
        user.authProviders.google.sub = googleUser.sub;
        if (!user.name) user.name = googleUser.name;
        if (!user.picture && googleUser.picture) user.picture = googleUser.picture;
        user.updatedAt = now;
        user.lastLoginAt = now;
      }

      db.usersByEmail[user.email] = user.userId;
      db.usersByGoogleSub[googleUser.sub] = user.userId;
      await writeDb(db);
      console.log(`[auth] ${created ? '🆕 Google 新用戶' : '🔑 Google 登入'}: ${user.name} (${user.email})`);

      const token = generateToken(user.userId, user.email);
      sendJson(res, created ? 201 : 200, {
        ok: true,
        token,
        user: publicUser(user)
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
      normalizeAuthDb(db);
      const userId = db.usersByEmail?.[email];
      const user = userId ? db.users?.[userId] : null;

      if (!user) {
        sendJson(res, 401, { error: 'invalid-credentials', message: '電郵或密碼不正確' });
        return;
      }

      if (!user.passwordHash) {
        sendJson(res, 401, { error: 'password-login-unavailable', message: '此帳號使用 Google 登入' });
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
        user: publicUser(user)
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

      if (!user.passwordHash) {
        sendJson(res, 400, { error: 'password-login-unavailable', message: '此帳號目前使用 Google 登入' });
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
        jiDisplay: jiList.slice(0, 5).join('、'),
        source: 'lunar-javascript',
        sourceUrl: 'https://www.npmjs.com/package/lunar-javascript'
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/bible-verse') {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const dateParam = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const verse = await fetchBibleVerse(dateParam);
      sendJson(res, 200, verse);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/summarize') {
      const body = await readBody(req);
      const summary = await summarizeWithLlm(body.text || body.content || '', { type: body.type || 'chat' });
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

    if (req.method === 'DELETE' && parts[3] === 'leave') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        sendJson(res, 401, { error: 'unauthorized', message: '請先登入' });
        return;
      }

      const db = await readDb();
      const user = db.users?.[authUser.userId];
      if (!user) {
        sendJson(res, 404, { error: 'user-not-found' });
        return;
      }

      const family = getFamily(db, familyId);
      if (!family) {
        sendJson(res, 404, { error: 'family-not-found' });
        return;
      }

      if (!family.members[authUser.userId]) {
        sendJson(res, 400, { error: 'not-a-member', message: '你不是這個家庭的成員' });
        return;
      }

      delete family.members[authUser.userId];
      if (user.families) {
        user.families = user.families.filter(f => f !== familyId);
      }

      writeDb(db);
      console.log(`[data] 🚪 成員退出 [${familyId}] ${user.name} - 剩餘 ${Object.keys(family.members).length} 位成員`);
      sendJson(res, 200, { success: true, message: '已退出家庭' });
      return;
    }

    const db = await readDb();
    const family = getFamily(db, familyId);
    if (!family) {
      sendJson(res, 404, { error: 'family-not-found' });
      return;
    }

    if (req.method === 'GET' && parts[3] === 'messages') {
      const authUser = getAuthUser(req);
      sendJson(res, 200, {
        messages: family.messages.slice(-80),
        rewards: {
          dailyMessageFrame: buildDailyMessageRewardStatus(db, familyId, authUser?.userId || '')
        }
      });
      return;
    }

    if (req.method === 'GET' && parts[3] === 'rewards' && parts[4] === 'daily-message-frame') {
      const authUser = getAuthUser(req);
      sendJson(res, 200, buildDailyMessageRewardStatus(db, familyId, authUser?.userId || ''));
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
        ? await summarizeWithLlm(sourceText, { type: 'voice' })
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
      const requestedId = cleanText(body.id);
      const messageId = requestedId && !latestFamily.messages.some(item => String(item.id) === requestedId)
        ? requestedId
        : `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
      const message = {
        id: messageId,
        uid: cleanText(body.uid),
        senderId: cleanText(body.senderId || body.uid, 'member'),
        senderName: cleanText(body.senderName, '家庭成員'),
        type: cleanText(body.type, 'text'),
        content: cleanText(body.content),
        img: cleanLargeText(body.img) || null,
        imgUrl: cleanLargeText(body.imgUrl) || null,
        thumbnailUrl: cleanLargeText(body.thumbnailUrl) || null,
        audio: cleanLargeText(body.audio) || null,
        audioUrl: cleanLargeText(body.audioUrl) || null,
        audioMime: cleanText(body.audioMime),
        audioDurationMs: Number(body.audioDurationMs) || 0,
        transcript: cleanTranscript(body.transcript),
        aiSummary: cleanText(body.aiSummary),
        time: cleanText(body.time) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        childId: cleanText(body.childId, 'child_1'),
        createdAt: now.toISOString()
      };
      if (!message.content && !message.img && !message.imgUrl && !message.audio && !message.audioUrl) {
        sendJson(res, 400, { error: 'empty-content' });
        return;
      }
      latestFamily.messages.push(message);
      latestFamily.messages = latestFamily.messages.slice(-500);
      await writeDb(latestDb);
      const rewardStatus = buildDailyMessageRewardStatus(latestDb, familyId, message.senderId);
      console.log(`[data] 💬 新訊息 [${familyId}] ${message.senderName}: ${message.type === 'photo' ? '📷 圖片' : message.type === 'audio' ? '🎤 語音' : message.content.slice(0, 50)}`);
      sendJson(res, 201, { message, rewards: { dailyMessageFrame: rewardStatus } });

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
      const imageUrl = cleanLargeText(body.imgUrl || body.imageUrl || body.img) || null;
      const thumbnailUrl = cleanLargeText(body.thumbnailUrl || body.thumbnail) || null;
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
        img: cleanLargeText(body.img) || imageUrl,
        imgUrl: imageUrl,
        imageUrl,
        thumbnailUrl,
        createdAt: now.toISOString()
      };
      if (!memory.content && !getMemoryImageValue(memory)) {
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
        getMemoryImageValue(m) && m.month === targetMonth && m.year === targetYear
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

  console.log(`\n🤖 OpenRouter 摘要: ${openrouterApiKey ? openrouterModels.join(', ') : '未配置'}`);
  console.log(`🤖 備用 LLM 摘要: ${llmApiKey ? `${llmBaseUrl} (${llmModel})` : '未配置'}`);
  console.log(`🎤 Azure STT: ${azureSttKey ? `https://${azureSttRecognitionHost} (${azureSttLanguage})` : '未配置'}`);
  console.log(`🎤 LLM 轉譯: ${llmTranscribeModel}`);
  console.log(`💾 資料庫: ${dbPath}`);
  console.log(`📁 媒體存儲: ${mediaStoragePath} (最大 ${mediaMaxSizeMB}MB)`);
  console.log(`${'='.repeat(50)}\n`);
});
