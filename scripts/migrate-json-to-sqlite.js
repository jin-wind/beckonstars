#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const jsonPath = process.argv[2] || path.join(__dirname, '..', 'data', 'server-db.json');
const sqlitePath = process.argv[3] || path.join(__dirname, '..', 'data', 'server-db.sqlite');

console.log(`📥 讀取 JSON: ${jsonPath}`);
console.log(`📤 輸出 SQLite: ${sqlitePath}`);

if (!fs.existsSync(jsonPath)) {
  console.error(`❌ JSON 文件不存在: ${jsonPath}`);
  process.exit(1);
}

// 備份舊的 SQLite（如果存在）
if (fs.existsSync(sqlitePath)) {
  const backupPath = `${sqlitePath}.backup.${Date.now()}`;
  console.log(`📦 備份舊數據庫: ${backupPath}`);
  fs.copyFileSync(sqlitePath, backupPath);
  fs.unlinkSync(sqlitePath);
}

// 初始化 SQLite
const db = new Database(sqlitePath);
db.pragma('journal_mode = WAL');

// 創建表結構
console.log('🏗️  創建表結構...');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    picture TEXT,
    google_sub TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS user_families (
    user_id TEXT NOT NULL,
    family_id TEXT NOT NULL,
    role TEXT,
    joined_at TEXT,
    PRIMARY KEY (user_id, family_id)
  );

  CREATE TABLE IF NOT EXISTS families (
    family_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    created_by TEXT
  );

  CREATE TABLE IF NOT EXISTS family_members (
    family_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    birthday TEXT,
    avatar TEXT,
    added_at TEXT,
    PRIMARY KEY (family_id, member_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    user_id TEXT,
    text TEXT,
    image_url TEXT,
    audio_url TEXT,
    transcript TEXT,
    summary TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    memory_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    user_id TEXT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    tags TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
  CREATE INDEX IF NOT EXISTS idx_messages_family ON messages(family_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_memories_family ON memories(family_id, date DESC);
`);

// 讀取 JSON
console.log('📖 解析 JSON 數據...');
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// 遷移數據
const insertUser = db.prepare(`
  INSERT OR REPLACE INTO users (user_id, email, name, password_hash, picture, google_sub, created_at, updated_at, last_login_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertUserFamily = db.prepare(`
  INSERT OR REPLACE INTO user_families (user_id, family_id, role, joined_at)
  VALUES (?, ?, ?, ?)
`);

const insertFamily = db.prepare(`
  INSERT OR REPLACE INTO families (family_id, created_at, created_by)
  VALUES (?, ?, ?)
`);

const insertMember = db.prepare(`
  INSERT OR REPLACE INTO family_members (family_id, member_id, name, role, birthday, avatar, added_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertMessage = db.prepare(`
  INSERT OR REPLACE INTO messages (message_id, family_id, user_id, text, image_url, audio_url, transcript, summary, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMemory = db.prepare(`
  INSERT OR REPLACE INTO memories (memory_id, family_id, user_id, date, title, description, image_url, tags, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

console.log('🔄 開始遷移數據...');

const migrate = db.transaction(() => {
  let userCount = 0, familyCount = 0, messageCount = 0, memoryCount = 0;

  // 遷移用戶
  if (jsonData.users) {
    for (const [userId, user] of Object.entries(jsonData.users)) {
      insertUser.run(
        userId,
        user.email,
        user.name || '',
        user.passwordHash || user.password || null,
        user.picture || '',
        user.googleSub || null,
        user.createdAt || new Date().toISOString(),
        user.updatedAt || null,
        user.lastLoginAt || null
      );

      if (user.families && Array.isArray(user.families)) {
        for (const fam of user.families) {
          if (typeof fam === 'string') {
            insertUserFamily.run(userId, fam, 'member', user.createdAt || new Date().toISOString());
          } else if (fam.familyId) {
            insertUserFamily.run(userId, fam.familyId, fam.role || 'member', fam.joinedAt || user.createdAt || new Date().toISOString());
          }
        }
      }
      userCount++;
    }
  }

  // 遷移家庭
  if (jsonData.families) {
    for (const [familyId, family] of Object.entries(jsonData.families)) {
      insertFamily.run(
        familyId,
        family.createdAt || new Date().toISOString(),
        family.createdBy || null
      );
      familyCount++;

      // 遷移家庭成員
      if (family.members) {
        for (const [memberId, member] of Object.entries(family.members)) {
          insertMember.run(
            familyId,
            memberId,
            member.name || '',
            member.role || '',
            member.birthday || null,
            member.avatar || '',
            member.addedAt || family.createdAt || new Date().toISOString()
          );
        }
      }

      // 遷移消息
      if (family.messages && Array.isArray(family.messages)) {
        for (const msg of family.messages) {
          insertMessage.run(
            msg.id || msg.messageId,
            familyId,
            msg.userId || msg.user || null,
            msg.text || null,
            msg.imageUrl || msg.image || null,
            msg.audioUrl || msg.audio || null,
            msg.transcript || null,
            msg.summary || null,
            msg.timestamp || new Date().toISOString()
          );
          messageCount++;
        }
      }

      // 遷移記憶
      if (family.memories && Array.isArray(family.memories)) {
        for (const mem of family.memories) {
          insertMemory.run(
            mem.id || mem.memoryId,
            familyId,
            mem.userId || mem.user || null,
            mem.date,
            mem.title || '',
            mem.description || null,
            mem.imageUrl || mem.image || null,
            mem.tags ? JSON.stringify(mem.tags) : null,
            mem.createdAt || new Date().toISOString()
          );
          memoryCount++;
        }
      }
    }
  }

  console.log(`✅ 用戶: ${userCount}`);
  console.log(`✅ 家庭: ${familyCount}`);
  console.log(`✅ 消息: ${messageCount}`);
  console.log(`✅ 記憶: ${memoryCount}`);
});

migrate();

db.close();
console.log('🎉 遷移完成！');
