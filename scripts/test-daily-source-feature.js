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

function includesAny(source, expectedOptions, message) {
  assert(expectedOptions.some(expected => source.includes(expected)), message || `Expected source to include one of ${expectedOptions.join(', ')}`);
}

includes(appHtml, 'dailyCardMode', 'app state should include the daily card mode preference');
includes(appHtml, 'beckon-stars-daily-card-mode', 'daily card mode should persist to localStorage');
includes(appHtml, 'data-action="toggleDailyCardMode"', 'profile page should expose a toggle for almanac/Bible verse mode');
includesAny(appHtml, ['FROM lunar-javascript', 'FROM 6tail.cn'], 'tear-off almanac card should display its data source');
includes(appHtml, 'FROM ${escapeHtml(bibleVerse.source ||', 'tear-off Bible verse card should display the actual data source');
includes(appHtml, 'fetchDailyBibleVerse', 'app should fetch Bible verse content for the selected date');
includes(appHtml, 'fetchFhlBibleVerse', 'app should fetch Bible verses directly from FHL on the client');
includes(appHtml, 'https://bible.fhl.net/json/qb.php', 'client should use the FHL Bible JSON API directly');
includesAny(appHtml, ['信望愛站聖經 JSON API', '信望愛站聖經'], 'FHL Bible source should be identified in the UI');
includes(appHtml, 'fetchBollsLifeBibleVerse', 'app should fall back directly to Bolls Life when FHL is unavailable');
includes(appHtml, 'bibleVerseCache[key] = data', 'direct Bible verse data should populate the same cache used by rendering');
includes(appHtml, 'prefetchDailyCardWindow', 'calendar should prefetch daily cards around the displayed day');
includes(appHtml, '[-1, 0, 1].map', 'daily card prefetch should load previous, current, and next dates');
notIncludes(appHtml, '正在載入聖經金句', 'Bible verse card should not render a loading placeholder');
notIncludes(appHtml, '暫時未能載入聖經金句', 'Bible verse card should not render a failed loading placeholder');
notIncludes(appHtml, 'FROM local suggestions', 'almanac card should not fall back to local suggestions when offline');
notIncludes(appHtml, '今日宜同屋企人分享一件開心事', 'offline almanac fallback copy should be removed');
notIncludes(appHtml, '今日適宜同屋企人分享一件開心事', 'offline almanac fallback copy should be removed');
notIncludes(appHtml, "serverApi(`/api/bible-verse", 'client should not depend on the self-hosted Bible verse endpoint before rendering');
includes(serverJs, "pathname === '/api/bible-verse'", 'server may keep a Bible verse API proxy endpoint as an optional fallback for other clients');
includes(serverJs, 'https://bolls.life/get-random-verse/CUV/', 'server should fetch Traditional Chinese CUV verses from Bolls Life');
includes(serverJs, 'Bolls Life Bible API', 'server response should identify the Bible verse source');
includes(serverJs, 'lunar-javascript', 'almanac response should identify the lunar-javascript source');
includes(appHtml, 'calendar-page-adjacent', 'calendar should render adjacent preview pages without replacing the active page DOM');
includes(appHtml, 'data-calendar-preview="-1"', 'calendar should pre-render the previous page before a touch gesture starts');
includes(appHtml, 'data-calendar-preview="1"', 'calendar should pre-render the next page before a touch gesture starts');
includes(appHtml, 'beginCalendarMotion', 'calendar navigation should build a continuous three-page motion stage');
includes(appHtml, 'requestAnimationFrame(applyDragX)', 'calendar drag updates should be frame-scheduled for smoother WebView motion');
includes(appHtml, 'getBoundedCalendarDragDelta', 'calendar swipe should bound overdrag while staying finger-following');
includes(appHtml, "document.addEventListener('touchmove', move", 'calendar swipe should keep receiving touchmove while preview pages are added');
includes(appHtml, 'cleanupDocumentSwipeListeners', 'calendar swipe should clean up temporary document-level gesture listeners');
includes(appHtml, 'calendarMotionLocked', 'calendar async refreshes should not replace DOM during an in-flight motion');
notIncludes(appHtml, 'calendar-page-strip', 'calendar should not replace the active page with a strip during the current touch gesture');
notIncludes(appHtml, 'calendarElasticStripSlide', 'calendar should not rely on the older keyframe-only strip animation');
notIncludes(appHtml, 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', 'calendar should not use the older bouncy easing that can feel discontinuous');
notIncludes(appHtml, 'doElasticCalendarStripTransition', 'calendar navigation should not use the older post-release-only strip transition');
notIncludes(appHtml, 'paperTearPeelAway', 'tear-off calendar should not use the rejected paper peel-away animation');
notIncludes(appHtml, 'calendar-page-next-shadow', 'tear-off calendar should not render the rejected paper shadow layer');
notIncludes(appHtml, 'doTearOffPageTransition', 'tear-off navigation should not use the rejected paper tear transition');

console.log('daily source feature checks passed');
