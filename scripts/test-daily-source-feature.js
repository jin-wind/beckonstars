const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const appHtml = fs.readFileSync(path.join(root, 'android/app/src/main/assets/index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'scripts/local-api-server.js'), 'utf8');

function includes(source, expected, message) {
  assert(source.includes(expected), message || `Expected source to include ${expected}`);
}

includes(appHtml, 'dailyCardMode', 'app state should include the daily card mode preference');
includes(appHtml, 'beckon-stars-daily-card-mode', 'daily card mode should persist to localStorage');
includes(appHtml, 'data-action="toggleDailyCardMode"', 'profile page should expose a toggle for almanac/Bible verse mode');
includes(appHtml, 'FROM lunar-javascript', 'tear-off almanac card should display its data source');
includes(appHtml, 'FROM Bolls Life Bible API', 'tear-off Bible verse card should display its data source');
includes(appHtml, 'fetchDailyBibleVerse', 'app should fetch Bible verse content for the selected date');
includes(serverJs, "pathname === '/api/bible-verse'", 'server should expose a Bible verse API proxy endpoint');
includes(serverJs, 'https://bolls.life/get-random-verse/CUV/', 'server should fetch Traditional Chinese CUV verses from Bolls Life');
includes(serverJs, 'Bolls Life Bible API', 'server response should identify the Bible verse source');
includes(serverJs, 'lunar-javascript', 'almanac response should identify the lunar-javascript source');

console.log('daily source feature checks passed');
