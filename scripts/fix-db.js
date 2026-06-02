// 一次性修复损坏的数据库文件
// 在服务器上运行: node fix-db.js
const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2] || './data/server-db.json';
const backupPath = `${dbPath}.corrupted-${Date.now()}`;

if (!fs.existsSync(dbPath)) {
  console.error('数据库文件不存在:', dbPath);
  process.exit(1);
}

const raw = fs.readFileSync(dbPath, 'utf8');
console.log(`文件大小: ${raw.length.toLocaleString()} 字节`);

// 尝试直接解析
let db;
try {
  db = JSON.parse(raw);
  console.log('✅ 数据库文件正常，无需修复');
  process.exit(0);
} catch (err) {
  console.log('❌ JSON 解析失败:', err.message);
}

// 尝试截断修复：从末尾逐个字符删除直到 JSON 有效
console.log('尝试截断修复...');
for (let i = 1; i < 5000 && raw.length - i > 100; i++) {
  const truncated = raw.slice(0, raw.length - i).trimEnd();
  try {
    db = JSON.parse(truncated);
    console.log(`✅ 截断修复成功，删除了最后 ${i} 个字符`);
    break;
  } catch {
    // 继续尝试
  }
}

// 如果没成功，尝试逐字符回溯找最后的合法结构
if (!db) {
  console.log('截断修复失败，尝试更激进的修复...');
  // 查找最后完整的 families 对象
  const lastBrace = raw.lastIndexOf('}');
  if (lastBrace > 0) {
    const candidate = raw.slice(0, lastBrace + 1);
    try {
      db = JSON.parse(candidate);
      console.log('✅ 激进修复成功，截断到最后的 }');
    } catch {
      // 继续
    }
  }
}

if (!db) {
  // 最后的手段：提取 families 数据
  console.log('正在尝试抢救 families 数据...');
  const familiesMatch = raw.match(/"families"\s*:\s*\{/);
  if (familiesMatch) {
    const start = familiesMatch.index;
    let depth = 0;
    let end = start;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      if (raw[i] === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    try {
      const familiesText = raw.slice(start, end);
      db = { families: eval(`({${familiesText}}).families`) };
      console.log('✅ 抢救成功');
    } catch (e) {
      console.log('抢救失败:', e.message);
    }
  }
}

if (!db) {
  console.error('\n无法自动修复。手动方案：');
  console.error('1. git checkout data/server-db.json -- 从 git 恢复（如果有）');
  console.error('2. 用 jq 工具修复: jq . data/server-db.json > data/server-db.new.json');
  console.error('3. 从备份恢复');
  console.error('4. 最坏情况：删除数据库重建（会丢失所有数据）');
  process.exit(1);
}

// 备份损坏文件
fs.writeFileSync(backupPath, raw);
console.log(`已备份损坏文件到: ${backupPath}`);

// 写入修复后的文件
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('✅ 数据库修复完成');
console.log(' families 数量:', Object.keys(db.families || {}).length);

// 简单验证
if (db.families) {
  for (const [fid, fam] of Object.entries(db.families)) {
    const msgCount = fam.messages?.length || 0;
    const memCount = fam.memories?.length || 0;
    console.log(`  family ${fid}: ${msgCount} 条消息, ${memCount} 条回忆`);
  }
}
