#!/usr/bin/env node
// SQLite 性能測試腳本

const http = require('http');

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8787';
const TEST_COUNT = 20;

function request(path) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(`${API_BASE}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        resolve({ status: res.statusCode, duration, data });
      });
    }).on('error', reject);
  });
}

async function benchmark(endpoint, name) {
  console.log(`\n📊 測試 ${name} (${endpoint})`);
  console.log('─'.repeat(50));

  const durations = [];

  for (let i = 1; i <= TEST_COUNT; i++) {
    try {
      const result = await request(endpoint);
      durations.push(result.duration);
      process.stdout.write(`第 ${i}/${TEST_COUNT} 次: ${result.duration}ms\r`);
    } catch (error) {
      console.error(`\n❌ 錯誤: ${error.message}`);
      return;
    }
  }

  console.log('\n');

  durations.sort((a, b) => a - b);
  const min = durations[0];
  const max = durations[durations.length - 1];
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const median = durations[Math.floor(durations.length / 2)];

  console.log(`✅ 最快: ${min}ms`);
  console.log(`🐌 最慢: ${max}ms`);
  console.log(`📈 平均: ${avg.toFixed(1)}ms`);
  console.log(`📊 中位數: ${median}ms`);
}

async function main() {
  console.log('🚀 星喚 API 性能測試');
  console.log('='.repeat(50));
  console.log(`目標: ${API_BASE}`);

  await benchmark('/api/health', '健康檢查');

  console.log('\n' + '='.repeat(50));
  console.log('✨ 測試完成！');
}

main().catch(console.error);
