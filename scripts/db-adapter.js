const dbSqlite = require('./db-sqlite');

// 將 SQLite 數據轉換為舊的 JSON 格式
function sqliteToJson() {
  const db = dbSqlite.initDb();

  // 讀取所有用戶
  const users = {};
  const usersByEmail = {};
  const usersByGoogleSub = {};

  const allUsers = db.prepare('SELECT user_id FROM users').all();
  for (const row of allUsers) {
    const user = dbSqlite.getUserById(row.user_id);
    if (user) {
      users[user.userId] = {
        userId: user.userId,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        picture: user.picture,
        googleSub: user.googleSub,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        families: user.families.map(f => f.familyId),
        authProviders: user.googleSub ? { google: { sub: user.googleSub } } : {}
      };
      usersByEmail[user.email] = user.userId;
      if (user.googleSub) usersByGoogleSub[user.googleSub] = user.userId;
    }
  }

  // 讀取所有家庭
  const families = {};
  const allFamilies = db.prepare('SELECT family_id FROM families').all();
  for (const row of allFamilies) {
    const family = dbSqlite.getFamily(row.family_id);
    if (family) {
      families[family.familyId] = {
        familyId: family.familyId,
        createdAt: family.createdAt,
        createdBy: family.createdBy,
        members: family.members,
        messages: dbSqlite.getMessages(family.familyId, 200),
        memories: dbSqlite.getMemories(family.familyId, 200)
      };
    }
  }

  return { users, usersByEmail, usersByGoogleSub, families };
}

// 將 JSON 格式數據寫回 SQLite
function jsonToSqlite(jsonDb) {
  const db = dbSqlite.initDb();

  db.exec('BEGIN TRANSACTION');

  try {
    // 更新用戶
    if (jsonDb.users) {
      for (const [userId, user] of Object.entries(jsonDb.users)) {
        const existing = dbSqlite.getUserById(userId);
        if (existing) {
          dbSqlite.updateUser(userId, {
            name: user.name,
            passwordHash: user.passwordHash || user.password,
            picture: user.picture,
            googleSub: user.googleSub,
            updatedAt: user.updatedAt,
            lastLoginAt: user.lastLoginAt
          });
        } else {
          dbSqlite.createUser({
            userId,
            email: user.email,
            name: user.name,
            passwordHash: user.passwordHash || user.password,
            picture: user.picture || '',
            googleSub: user.googleSub,
            createdAt: user.createdAt || new Date().toISOString(),
            updatedAt: user.updatedAt,
            lastLoginAt: user.lastLoginAt
          });
        }

        // 更新用戶的家庭關係
        if (user.families && Array.isArray(user.families)) {
          for (const fam of user.families) {
            const familyId = typeof fam === 'string' ? fam : fam.familyId;
            if (familyId) {
              dbSqlite.addUserFamily(userId, familyId, 'member');
            }
          }
        }
        // 同步刪除：移除 SQLite 中有但 JSON 中已不存在的家庭關係
        const dbFamilies = db.prepare('SELECT family_id FROM user_families WHERE user_id = ?').all(userId);
        const jsonFamilySet = new Set((user.families || []).map(f => typeof f === 'string' ? f : f.familyId));
        for (const row of dbFamilies) {
          if (!jsonFamilySet.has(row.family_id)) {
            dbSqlite.removeUserFamily(userId, row.family_id);
          }
        }
      }
    }

    // 更新家庭
    if (jsonDb.families) {
      for (const [familyId, family] of Object.entries(jsonDb.families)) {
        const existing = dbSqlite.getFamily(familyId);
        if (!existing) {
          dbSqlite.createFamily({
            familyId,
            createdAt: family.createdAt || new Date().toISOString(),
            createdBy: family.createdBy
          });
        }

        // 更新家庭成員
        if (family.members) {
          for (const [memberId, member] of Object.entries(family.members)) {
            dbSqlite.addFamilyMember(familyId, memberId, {
              name: member.name,
              role: member.role,
              birthday: member.birthday,
              avatar: member.avatar,
              addedAt: member.addedAt || family.createdAt
            });
          }
          // 同步刪除：移除 SQLite 中有但 JSON 中已不存在的成員
          const dbMembers = db.prepare('SELECT member_id FROM family_members WHERE family_id = ?').all(familyId);
          const jsonMemberSet = new Set(Object.keys(family.members));
          for (const row of dbMembers) {
            if (!jsonMemberSet.has(row.member_id)) {
              dbSqlite.removeFamilyMember(familyId, row.member_id);
            }
          }
        }

        // 添加新消息，並同步更新已存在消息的轉譯、摘要等欄位。
        if (family.messages && Array.isArray(family.messages)) {
          const existingMessages = new Set(
            db.prepare('SELECT message_id FROM messages WHERE family_id = ?').all(familyId).map(r => r.message_id)
          );

          for (const msg of family.messages) {
            if (!msg?.id) continue;
            if (existingMessages.has(msg.id)) {
              dbSqlite.updateMessage(msg.id, msg);
            } else {
              dbSqlite.addMessage(familyId, msg);
            }
          }
        }

        // 添加新記憶
        if (family.memories && Array.isArray(family.memories)) {
          const existingMemories = new Set(
            db.prepare('SELECT memory_id FROM memories WHERE family_id = ?').all(familyId).map(r => r.memory_id)
          );

          for (const mem of family.memories) {
            if (!existingMemories.has(mem.id)) {
              dbSqlite.addMemory(familyId, mem);
            }
          }
        }
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// 兼容舊接口
async function readDb() {
  return sqliteToJson();
}

function writeDb(jsonDb) {
  jsonToSqlite(jsonDb);
  return Promise.resolve();
}

module.exports = {
  readDb,
  writeDb,
  sqliteToJson,
  jsonToSqlite
};
