const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'server-db.json');
const familyId = process.argv[3];
const mode = process.argv[4] || 'empty-audio'; // 'empty-audio' | 'all-audio'

if (!familyId) {
  console.error('Usage: node scripts/delete-messages.js [dbPath] <familyId> [empty-audio|all-audio]');
  console.error('Example: node scripts/delete-messages.js data/server-db.json 257719 empty-audio');
  process.exit(1);
}

console.log(`讀取數據庫: ${dbPath}`);
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const family = db.families?.[familyId];
if (!family) {
  console.error(`找不到家庭: ${familyId}`);
  process.exit(1);
}

const beforeCount = family.messages?.length || 0;

if (mode === 'empty-audio') {
  family.messages = (family.messages || []).filter(m => !(m.type === 'audio' && !m.transcript));
} else if (mode === 'all-audio') {
  family.messages = (family.messages || []).filter(m => m.type !== 'audio');
} else {
  console.error(`不支援的模式: ${mode}`);
  process.exit(1);
}

const removedCount = beforeCount - family.messages.length;

if (removedCount === 0) {
  console.log('沒有符合條件的訊息需要刪除');
  process.exit(0);
}

const backupPath = `${dbPath}.backup-${Date.now()}`;
fs.copyFileSync(dbPath, backupPath);
console.log(`已備份: ${backupPath}`);

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`✅ 已從家庭 ${familyId} 刪除 ${removedCount} 條${mode === 'empty-audio' ? '無轉譯文字' : ''}語音訊息`);
console.log(`   訊息數: ${beforeCount} → ${family.messages.length}`);
