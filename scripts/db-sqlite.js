const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.API_DB_PATH || path.join(__dirname, '..', 'data', 'server-db.sqlite');
let db = null;

function initDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 創建表結構
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

  return db;
}

// ========== 用戶相關 ==========

function createUser(user) {
  const db = initDb();
  const stmt = db.prepare(`
    INSERT INTO users (user_id, email, name, password_hash, picture, google_sub, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    user.userId,
    user.email,
    user.name,
    user.passwordHash || null,
    user.picture || '',
    user.googleSub || null,
    user.createdAt,
    user.updatedAt || null,
    user.lastLoginAt || null
  );
  return user;
}

function getUserById(userId) {
  const db = initDb();
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  if (!user) return null;

  const families = db.prepare('SELECT family_id, role, joined_at FROM user_families WHERE user_id = ?').all(userId);

  return {
    userId: user.user_id,
    email: user.email,
    name: user.name,
    passwordHash: user.password_hash,
    picture: user.picture || '',
    googleSub: user.google_sub,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
    families: families.map(f => ({ familyId: f.family_id, role: f.role, joinedAt: f.joined_at }))
  };
}

function getUserByEmail(email) {
  const db = initDb();
  const user = db.prepare('SELECT user_id FROM users WHERE email = ?').get(email);
  return user ? getUserById(user.user_id) : null;
}

function getUserByGoogleSub(googleSub) {
  const db = initDb();
  const user = db.prepare('SELECT user_id FROM users WHERE google_sub = ?').get(googleSub);
  return user ? getUserById(user.user_id) : null;
}

function updateUser(userId, updates) {
  const db = initDb();
  const fields = [];
  const values = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.passwordHash !== undefined) { fields.push('password_hash = ?'); values.push(updates.passwordHash); }
  if (updates.picture !== undefined) { fields.push('picture = ?'); values.push(updates.picture); }
  if (updates.googleSub !== undefined) { fields.push('google_sub = ?'); values.push(updates.googleSub); }
  if (updates.updatedAt !== undefined) { fields.push('updated_at = ?'); values.push(updates.updatedAt); }
  if (updates.lastLoginAt !== undefined) { fields.push('last_login_at = ?'); values.push(updates.lastLoginAt); }

  if (fields.length === 0) return;

  values.push(userId);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
}

function addUserFamily(userId, familyId, role = 'member', joinedAt = null) {
  const db = initDb();
  db.prepare('INSERT OR REPLACE INTO user_families (user_id, family_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    userId, familyId, role, joinedAt || new Date().toISOString()
  );
}

// ========== 家庭相關 ==========

function createFamily(family) {
  const db = initDb();
  db.prepare('INSERT INTO families (family_id, created_at, created_by) VALUES (?, ?, ?)').run(
    family.familyId, family.createdAt, family.createdBy || null
  );
  return family;
}

function getFamily(familyId) {
  const db = initDb();
  const family = db.prepare('SELECT * FROM families WHERE family_id = ?').get(familyId);
  if (!family) return null;

  const members = db.prepare('SELECT * FROM family_members WHERE family_id = ?').all(familyId);
  const membersObj = {};
  for (const m of members) {
    membersObj[m.member_id] = {
      name: m.name,
      role: m.role || '',
      birthday: m.birthday || '',
      avatar: m.avatar || '',
      addedAt: m.added_at
    };
  }

  return {
    familyId: family.family_id,
    createdAt: family.created_at,
    createdBy: family.created_by,
    members: membersObj,
    messages: [],
    memories: []
  };
}

function addFamilyMember(familyId, memberId, member) {
  const db = initDb();
  db.prepare(`
    INSERT OR REPLACE INTO family_members (family_id, member_id, name, role, birthday, avatar, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    familyId, memberId, member.name, member.role || '', member.birthday || '', member.avatar || '', member.addedAt || new Date().toISOString()
  );
}

// ========== 消息相關 ==========

function getMessages(familyId, limit = 100) {
  const db = initDb();
  const rows = db.prepare(`
    SELECT * FROM messages WHERE family_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(familyId, limit);

  return rows.map(r => ({
    id: r.message_id,
    userId: r.user_id,
    text: r.text || '',
    imageUrl: r.image_url || '',
    audioUrl: r.audio_url || '',
    transcript: r.transcript || '',
    summary: r.summary || '',
    timestamp: r.timestamp
  })).reverse();
}

function addMessage(familyId, message) {
  const db = initDb();
  db.prepare(`
    INSERT INTO messages (message_id, family_id, user_id, text, image_url, audio_url, transcript, summary, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    familyId,
    message.userId || null,
    message.text || null,
    message.imageUrl || null,
    message.audioUrl || null,
    message.transcript || null,
    message.summary || null,
    message.timestamp || new Date().toISOString()
  );
}

function updateMessage(messageId, updates) {
  const db = initDb();
  const fields = [];
  const values = [];

  if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text); }
  if (updates.transcript !== undefined) { fields.push('transcript = ?'); values.push(updates.transcript); }
  if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary); }

  if (fields.length === 0) return;

  values.push(messageId);
  db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE message_id = ?`).run(...values);
}

function getMessage(messageId) {
  const db = initDb();
  const r = db.prepare('SELECT * FROM messages WHERE message_id = ?').get(messageId);
  if (!r) return null;
  return {
    id: r.message_id,
    familyId: r.family_id,
    userId: r.user_id,
    text: r.text || '',
    imageUrl: r.image_url || '',
    audioUrl: r.audio_url || '',
    transcript: r.transcript || '',
    summary: r.summary || '',
    timestamp: r.timestamp
  };
}

// ========== 記憶相關 ==========

function getMemories(familyId, limit = 100) {
  const db = initDb();
  const rows = db.prepare(`
    SELECT * FROM memories WHERE family_id = ? ORDER BY date DESC LIMIT ?
  `).all(familyId, limit);

  return rows.map(r => ({
    id: r.memory_id,
    userId: r.user_id,
    date: r.date,
    title: r.title,
    description: r.description || '',
    imageUrl: r.image_url || '',
    tags: r.tags ? JSON.parse(r.tags) : [],
    createdAt: r.created_at
  })).reverse();
}

function addMemory(familyId, memory) {
  const db = initDb();
  db.prepare(`
    INSERT INTO memories (memory_id, family_id, user_id, date, title, description, image_url, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory.id,
    familyId,
    memory.userId || null,
    memory.date,
    memory.title || '',
    memory.description || null,
    memory.imageUrl || null,
    memory.tags ? JSON.stringify(memory.tags) : null,
    memory.createdAt || new Date().toISOString()
  );
}

function removeUserFamily(userId, familyId) {
  const db = initDb();
  db.prepare('DELETE FROM user_families WHERE user_id = ? AND family_id = ?').run(userId, familyId);
}

function removeFamilyMember(familyId, memberId) {
  const db = initDb();
  db.prepare('DELETE FROM family_members WHERE family_id = ? AND member_id = ?').run(familyId, memberId);
}

module.exports = {
  initDb,
  createUser,
  getUserById,
  getUserByEmail,
  getUserByGoogleSub,
  updateUser,
  addUserFamily,
  removeUserFamily,
  createFamily,
  getFamily,
  addFamilyMember,
  removeFamilyMember,
  getMessages,
  addMessage,
  updateMessage,
  getMessage,
  getMemories,
  addMemory
};
