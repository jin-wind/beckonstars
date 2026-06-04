const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(root, 'android/app/src/main/assets/index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'scripts/local-api-server.js'), 'utf8');

function includes(source, expected, message) {
  assert(source.includes(expected), message || `Expected source to include ${expected}`);
}

function notIncludes(source, unexpected, message) {
  assert(!source.includes(unexpected), message || `Expected source not to include ${unexpected}`);
}

includes(appHtml, 'appLogEntries', 'frontend should keep an in-memory app log buffer');
includes(appHtml, "serverApi('/api/logs?limit=80')", 'architecture popup should load server logs from the API');
includes(appHtml, 'data-action="refreshLogs"', 'log popup should expose a refresh control');
includes(appHtml, '系統 Log', 'architecture popup should now be a log popup');
includes(appHtml, 'App Log', 'log popup should show frontend logs');
includes(appHtml, 'Server Log', 'log popup should show server logs');
includes(appHtml, 'fa-terminal', 'top-right architecture button should become a log button');
notIncludes(appHtml, '展示技術架構', 'top-right log button should not use the old architecture label');
notIncludes(appHtml, '<i class="fa-solid fa-bolt mr-1.5"></i> Demo', 'old Demo pill should be removed');
notIncludes(appHtml, '目前狀態', 'old architecture status card should be removed');
notIncludes(appHtml, '自託管伺服器', 'old architecture server description card should be removed');
notIncludes(appHtml, '資料安全', 'old architecture security card should be removed');

includes(serverJs, 'serverLogEntries', 'server should keep an in-memory server log buffer');
includes(serverJs, "pathname === '/api/logs'", 'server should expose logs through /api/logs');
includes(serverJs, 'serverLogEntries.slice(-limit)', 'server log endpoint should return recent logs only');

console.log('architecture log feature checks passed');
