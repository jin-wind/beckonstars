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

includes(appHtml, 'dailyCardMode', 'app state should include the daily card mode preference');
includes(appHtml, 'beckon-stars-daily-card-mode', 'daily card mode should persist to localStorage');
includes(appHtml, 'data-action="toggleDailyCardMode"', 'profile page should expose a toggle for almanac/Bible verse mode');
includes(appHtml, 'FROM lunar-javascript', 'tear-off almanac card should display its data source');
includes(appHtml, 'FROM ${escapeHtml(bibleVerse.source ||', 'tear-off Bible verse card should display the actual data source');
includes(appHtml, 'fetchDailyBibleVerse', 'app should fetch Bible verse content for the selected date');
includes(appHtml, 'fetchFhlBibleVerse', 'app should fetch Bible verses directly from FHL on the client');
includes(appHtml, 'https://bible.fhl.net/json/qb.php', 'client should use the FHL Bible JSON API directly');
includes(appHtml, '信望愛站聖經 JSON API', 'FHL Bible source should be identified in the UI');
includes(appHtml, 'fetchBollsLifeBibleVerse', 'app should fall back directly to Bolls Life when FHL is unavailable');
includes(appHtml, 'bibleVerseCache[key] = data', 'direct Bible verse data should populate the same cache used by rendering');
includes(appHtml, '暫時未能載入聖經金句', 'Bible verse card should not stay in an infinite loading state after all fetches fail');
notIncludes(appHtml, "serverApi(`/api/bible-verse", 'client should not depend on the self-hosted Bible verse endpoint before rendering');
includes(serverJs, "pathname === '/api/bible-verse'", 'server may keep a Bible verse API proxy endpoint as an optional fallback for other clients');
includes(serverJs, 'https://bolls.life/get-random-verse/CUV/', 'server should fetch Traditional Chinese CUV verses from Bolls Life');
includes(serverJs, 'Bolls Life Bible API', 'server response should identify the Bible verse source');
includes(serverJs, 'lunar-javascript', 'almanac response should identify the lunar-javascript source');
includes(appHtml, 'calendar-page-strip', 'tear-off calendar should animate an internal content strip inside a fixed card');
includes(appHtml, 'calendarElasticStripSlide', 'tear-off calendar should use an elastic strip slide keyframe animation');
includes(appHtml, 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', 'tear-off strip slide should use the requested springy easing');
includes(appHtml, 'doElasticCalendarStripTransition', 'tear-off navigation should use the dedicated elastic strip transition');
notIncludes(appHtml, 'paperTearPeelAway', 'tear-off calendar should not use the rejected paper peel-away animation');
notIncludes(appHtml, 'calendar-page-next-shadow', 'tear-off calendar should not render the rejected paper shadow layer');
notIncludes(appHtml, 'doTearOffPageTransition', 'tear-off navigation should not use the rejected paper tear transition');

console.log('daily source feature checks passed');
