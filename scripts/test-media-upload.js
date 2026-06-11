#!/usr/bin/env node

/**
 * 媒體上傳端點測試腳本
 *
 * 用法：
 *   node scripts/test-media-upload.js
 *   node scripts/test-media-upload.js path/to/image.jpg
 *
 * 需要：
 *   - API server 運行在 http://127.0.0.1:8787
 *   - 有效的用戶帳號進行認證
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8787';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@beckonstars.app';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123456';

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const req = client.request(urlObj, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body });
        } catch (error) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function login() {
  console.log(`\n🔐 登入測試帳號: ${TEST_EMAIL}`);

  const res = await request(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });

  if (res.status === 200 && res.body.token) {
    console.log(`✅ 登入成功`);
    return res.body.token;
  }

  // 嘗試註冊
  console.log(`📝 帳號不存在，嘗試註冊...`);
  const regRes = await request(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: '測試用戶'
    })
  });

  if (regRes.status === 201 && regRes.body.token) {
    console.log(`✅ 註冊成功`);
    return regRes.body.token;
  }

  throw new Error(`登入/註冊失敗: ${JSON.stringify(res.body || regRes.body)}`);
}

function createTestImage() {
  // 生成一個 1x1 像素的 PNG (最小有效 PNG)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, // IEND chunk
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);
  return pngData;
}

function createTestAudio() {
  // 生成一個最小的 WAV 文件 (1 秒靜音)
  const sampleRate = 16000;
  const numSamples = sampleRate;
  const dataSize = numSamples * 2; // 16-bit samples

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format (PCM)
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  return Buffer.concat([header, data]);
}

async function testBase64Upload(token, testData, mime, filename) {
  console.log(`\n📤 測試 Base64 上傳: ${filename}`);

  const base64 = testData.toString('base64');
  const res = await request(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      data: base64,
      mime: mime,
      filename: filename
    })
  });

  console.log(`   狀態: ${res.status}`);
  console.log(`   回應:`, JSON.stringify(res.body, null, 2));

  if (res.status === 201) {
    console.log(`✅ 上傳成功`);
    return res.body;
  } else {
    console.log(`❌ 上傳失敗`);
    return null;
  }
}

async function testFileUpload(token, filePath) {
  console.log(`\n📤 測試文件上傳: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ 文件不存在: ${filePath}`);
    return null;
  }

  const fileData = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  };
  const mime = mimeMap[ext] || 'application/octet-stream';

  const base64 = fileData.toString('base64');
  const res = await request(`${API_BASE}/api/media/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      data: base64,
      mime: mime,
      filename: path.basename(filePath)
    })
  });

  console.log(`   大小: ${Math.round(fileData.length / 1024)}KB`);
  console.log(`   MIME: ${mime}`);
  console.log(`   狀態: ${res.status}`);
  console.log(`   回應:`, JSON.stringify(res.body, null, 2));

  if (res.status === 201) {
    console.log(`✅ 上傳成功`);
    return res.body;
  } else {
    console.log(`❌ 上傳失敗`);
    return null;
  }
}

async function testMediaAccess(mediaUrl) {
  console.log(`\n🌐 測試媒體訪問: ${mediaUrl}`);

  const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `${API_BASE}${mediaUrl}`;
  const res = await request(fullUrl);

  console.log(`   狀態: ${res.status}`);
  console.log(`   Content-Type: ${res.headers['content-type']}`);
  console.log(`   Cache-Control: ${res.headers['cache-control']}`);

  if (res.status === 200) {
    console.log(`✅ 媒體訪問成功`);
  } else {
    console.log(`❌ 媒體訪問失敗`);
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 媒體上傳 API 測試`);
  console.log(`${'='.repeat(60)}`);
  console.log(`API Base: ${API_BASE}`);

  try {
    // 1. 登入
    const token = await login();

    // 2. 測試圖片上傳
    const imageData = createTestImage();
    const imageResult = await testBase64Upload(token, imageData, 'image/png', 'test.png');

    if (imageResult && imageResult.mediaUrl) {
      await testMediaAccess(imageResult.mediaUrl);

      if (imageResult.thumbnailUrl) {
        await testMediaAccess(imageResult.thumbnailUrl);
      }
    }

    // 3. 測試音訊上傳
    const audioData = createTestAudio();
    const audioResult = await testBase64Upload(token, audioData, 'audio/wav', 'test.wav');

    if (audioResult && audioResult.mediaUrl) {
      await testMediaAccess(audioResult.mediaUrl);
    }

    // 4. 如果提供了文件路徑，測試實際文件上傳
    const customFilePath = process.argv[2];
    if (customFilePath) {
      const fileResult = await testFileUpload(token, customFilePath);
      if (fileResult && fileResult.mediaUrl) {
        await testMediaAccess(fileResult.mediaUrl);
        if (fileResult.thumbnailUrl) {
          await testMediaAccess(fileResult.thumbnailUrl);
        }
      }
    }

    // 5. 測試無效請求
    console.log(`\n🧪 測試錯誤處理`);

    // 無效 MIME 類型
    const invalidMime = await request(`${API_BASE}/api/media/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        data: imageData.toString('base64'),
        mime: 'application/pdf',
        filename: 'test.pdf'
      })
    });
    console.log(`   無效 MIME: ${invalidMime.status} - ${invalidMime.body.error}`);

    // 未授權
    const unauthorized = await request(`${API_BASE}/api/media/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: imageData.toString('base64'),
        mime: 'image/png',
        filename: 'test.png'
      })
    });
    console.log(`   未授權: ${unauthorized.status} - ${unauthorized.body.error}`);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 測試完成`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\n❌ 測試失敗:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
