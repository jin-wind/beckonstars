#!/usr/bin/env node

/**
 * DB 遷移腳本：將 messages 和 memories 中的 base64 img/audio 抽取成文件
 *
 * 使用方法：
 *   node scripts/migrate-media-to-urls.js [--dry-run] [--db-path=path/to/db.json]
 *
 * 功能：
 *   1. 讀取 server-db.json
 *   2. 將所有 messages 與 memories 中的 base64 img/audio 保存到 data/media/
 *   3. 更新 DB 改存 imgUrl/audioUrl
 *   4. 備份原 DB 到 data/server-db.json.backup
 *   5. 支援 --dry-run 模式（僅顯示變更，不實際寫入）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 解析命令行參數
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const dbPathArg = args.find(arg => arg.startsWith('--db-path='));
const dbPath = dbPathArg
  ? dbPathArg.split('=')[1]
  : path.join(process.cwd(), 'data', 'server-db.json');
const mediaDir = path.join(process.cwd(), 'data', 'media');

console.log(`\n${'='.repeat(60)}`);
console.log(`🔄 星喚 DB 媒體遷移工具`);
console.log(`${'='.repeat(60)}`);
console.log(`📂 資料庫: ${dbPath}`);
console.log(`📁 媒體目錄: ${mediaDir}`);
console.log(`🔍 模式: ${isDryRun ? 'Dry Run (僅預覽)' : '實際執行'}`);
console.log(`${'='.repeat(60)}\n`);

// 檢查 DB 檔案是否存在
if (!fs.existsSync(dbPath)) {
  console.error(`❌ 錯誤：找不到資料庫檔案 ${dbPath}`);
  process.exit(1);
}

// 解析 data URL，返回 { mime, data, ext }
function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) return null;

  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([^;,]+)?(?:;[^,]*)?,(.*)$/s);

  if (!match) return null;

  const mime = (match[1] || '').toLowerCase();
  const data = match[2];

  // 推斷副檔名
  let ext = 'bin';
  if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
  else if (mime.includes('png')) ext = 'png';
  else if (mime.includes('gif')) ext = 'gif';
  else if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('wav')) ext = 'wav';
  else if (mime.includes('mp3') || mime.includes('mpeg')) ext = 'mp3';
  else if (mime.includes('m4a')) ext = 'm4a';
  else if (mime.includes('aac')) ext = 'aac';
  else if (mime.includes('ogg')) ext = 'ogg';

  return { mime, data, ext };
}

// 生成唯一檔案名
function generateFilename(familyId, messageId, type, ext) {
  const hash = crypto.createHash('sha256')
    .update(`${familyId}-${messageId}-${type}`)
    .digest('hex')
    .slice(0, 12);
  const timestamp = Date.now();
  return `${familyId}_${timestamp}_${hash}.${ext}`;
}

// 保存 base64 數據為檔案
function saveMediaFile(familyId, itemId, type, dataUrl, dryRun = false) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const filename = generateFilename(familyId, itemId, type, parsed.ext);
  const filePath = path.join(mediaDir, filename);
  const url = `/media/${filename}`;

  if (!dryRun) {
    fs.mkdirSync(mediaDir, { recursive: true });
    const buffer = Buffer.from(parsed.data, 'base64');
    fs.writeFileSync(filePath, buffer);
  }

  return { url, filePath, size: parsed.data.length };
}

// 遷移單個 message
function migrateMessage(familyId, message, stats, dryRun) {
  let changed = false;

  // 處理圖片
  if (message.img && message.img.startsWith('data:') && !message.imgUrl) {
    const result = saveMediaFile(familyId, message.id, 'img', message.img, dryRun);
    if (result) {
      stats.imagesExtracted += 1;
      stats.totalSize += result.size;
      message.imgUrl = result.url;
      if (!dryRun) {
        delete message.img; // 刪除 base64 data
      }
      changed = true;
      console.log(`  📷 圖片: ${message.id} -> ${result.url} (${(result.size / 1024).toFixed(1)} KB)`);
    }
  }

  // 處理音訊
  if (message.audio && message.audio.startsWith('data:') && !message.audioUrl) {
    const result = saveMediaFile(familyId, message.id, 'audio', message.audio, dryRun);
    if (result) {
      stats.audiosExtracted += 1;
      stats.totalSize += result.size;
      message.audioUrl = result.url;
      if (!dryRun) {
        delete message.audio; // 刪除 base64 data
      }
      changed = true;
      console.log(`  🎤 音訊: ${message.id} -> ${result.url} (${(result.size / 1024).toFixed(1)} KB)`);
    }
  }

  return changed;
}

// 遷移單個 memory
function migrateMemory(familyId, memory, stats, dryRun) {
  let changed = false;

  // 處理圖片
  if (memory.img && memory.img.startsWith('data:') && !memory.imgUrl) {
    const result = saveMediaFile(familyId, memory.id, 'img', memory.img, dryRun);
    if (result) {
      stats.imagesExtracted += 1;
      stats.totalSize += result.size;
      memory.imgUrl = result.url;
      if (!dryRun) {
        delete memory.img; // 刪除 base64 data
      }
      changed = true;
      console.log(`  📷 圖片: ${memory.id} -> ${result.url} (${(result.size / 1024).toFixed(1)} KB)`);
    }
  }

  return changed;
}

// 主程式
async function main() {
  try {
    // 讀取 DB
    console.log(`📖 讀取資料庫...`);
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(dbContent);

    const stats = {
      families: 0,
      messages: 0,
      memories: 0,
      imagesExtracted: 0,
      audiosExtracted: 0,
      totalSize: 0
    };

    // 遍歷所有家庭
    const familyIds = Object.keys(db.families || {});
    if (familyIds.length === 0) {
      console.log(`⚠️  資料庫中沒有任何家庭資料`);
      return;
    }

    console.log(`\n🏠 處理 ${familyIds.length} 個家庭...\n`);

    for (const familyId of familyIds) {
      const family = db.families[familyId];
      let familyChanged = false;

      console.log(`\n📦 家庭: ${familyId}`);

      // 處理 messages
      if (family.messages && family.messages.length > 0) {
        console.log(`  💬 處理 ${family.messages.length} 條訊息...`);
        for (const message of family.messages) {
          if (migrateMessage(familyId, message, stats, isDryRun)) {
            stats.messages += 1;
            familyChanged = true;
          }
        }
      }

      // 處理 memories
      if (family.memories && family.memories.length > 0) {
        console.log(`  📝 處理 ${family.memories.length} 條回憶...`);
        for (const memory of family.memories) {
          if (migrateMemory(familyId, memory, stats, isDryRun)) {
            stats.memories += 1;
            familyChanged = true;
          }
        }
      }

      if (familyChanged) {
        stats.families += 1;
      }
    }

    // 顯示統計
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 遷移統計:`);
    console.log(`${'='.repeat(60)}`);
    console.log(`🏠 影響家庭: ${stats.families}`);
    console.log(`💬 訊息更新: ${stats.messages}`);
    console.log(`📝 回憶更新: ${stats.memories}`);
    console.log(`📷 圖片抽取: ${stats.imagesExtracted}`);
    console.log(`🎤 音訊抽取: ${stats.audiosExtracted}`);
    console.log(`💾 總大小: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`${'='.repeat(60)}\n`);

    if (isDryRun) {
      console.log(`✅ Dry Run 完成！以上為預覽結果，未實際寫入檔案。`);
      console.log(`💡 移除 --dry-run 參數以執行實際遷移。`);
    } else {
      if (stats.families === 0) {
        console.log(`✅ 沒有需要遷移的資料。`);
        return;
      }

      // 備份原 DB
      const backupPath = `${dbPath}.backup`;
      console.log(`💾 備份原資料庫到: ${backupPath}`);
      fs.copyFileSync(dbPath, backupPath);

      // 寫入更新後的 DB
      console.log(`💾 寫入更新後的資料庫...`);
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

      console.log(`\n✅ 遷移完成！`);
      console.log(`📁 媒體檔案位於: ${mediaDir}`);
      console.log(`💾 原資料庫備份: ${backupPath}`);
    }

  } catch (error) {
    console.error(`\n❌ 遷移失敗:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
