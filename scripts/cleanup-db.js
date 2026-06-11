const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'server-db.json');

console.log(`讀取數據庫: ${dbPath}`);
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

let totalRemoved = 0;

for (const familyId in db.families) {
  const family = db.families[familyId];

  // 清理消息中的 base64 數據
  if (family.messages) {
    for (const msg of family.messages) {
      if (msg.audio?.length > 1000) {
        msg.audio = null;
        totalRemoved++;
      }
      if (msg.img?.startsWith('data:') && msg.img.length > 1000) {
        msg.img = null;
        totalRemoved++;
      }
    }
  }

  // 清理回憶中的 base64 圖片
  if (family.memories) {
    for (const mem of family.memories) {
      if (mem.img?.startsWith('data:') && mem.img.length > 1000) {
        mem.img = null;
        totalRemoved++;
      }
    }
  }
}

const backupPath = `${dbPath}.backup-${Date.now()}`;
fs.copyFileSync(dbPath, backupPath);
console.log(`備份: ${backupPath}`);

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`✅ 已清理 ${totalRemoved} 個 base64 數據`);

const oldSize = fs.statSync(backupPath).size;
const newSize = fs.statSync(dbPath).size;
console.log(`大小: ${(oldSize/1024/1024).toFixed(1)}MB → ${(newSize/1024/1024).toFixed(1)}MB`);
