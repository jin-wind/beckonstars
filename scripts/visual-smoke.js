// Real-browser visual smoke test for the shared web core.
// Uses the installed system Chrome/Edge through playwright-core, captures the
// main screens at phone width, and fails on blank/overflowing screens or page errors.
// Usage: npm run test:visual
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, '.artifacts', 'ui');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function browserPath() {
  const candidates = process.platform === 'win32' ? [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const found = candidates.filter(Boolean).find(fs.existsSync);
  if (!found) throw new Error('System Chrome/Edge not found. Set PLAYWRIGHT_CHROME_PATH.');
  return process.env.PLAYWRIGHT_CHROME_PATH || found;
}

function serveWeb() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = path.resolve(WEB, '.' + requested);
      if (!file.startsWith(WEB + path.sep)) { res.writeHead(403).end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serveWeb();
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: browserPath(), headless: true, args: ['--disable-web-security'] });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.stack || err.message));
  page.on('console', msg => {
    // The API endpoint is deliberately stubbed as unavailable; Chromium reports
    // the expected 503 as a console error before app-level fallback handles it.
    if (msg.type() === 'error' && !/503|Service Unavailable|favicon/i.test(msg.text())) pageErrors.push('console: ' + msg.text());
  });
  await page.route('http://144.79.170.102:8787/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof render === 'function' && document.querySelector('#app')?.innerHTML.length > 100);

  const shots = [];
  const capture = async (name, setup) => {
    await page.evaluate(setup);
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const app = document.getElementById('app');
      const all = [...document.querySelectorAll('body *')];
      const overflow = all.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
      }).slice(0, 8).map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
      return { htmlLength: app?.innerHTML.length || 0, bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth, overflow };
    });
    if (metrics.htmlLength < 200) throw new Error(`${name}: app is blank`);
    if (metrics.bodyWidth > metrics.viewportWidth + 2) throw new Error(`${name}: horizontal body overflow ${metrics.bodyWidth}px > ${metrics.viewportWidth}px (${metrics.overflow.join(', ')})`);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    shots.push(file);
    console.log(`PASS ${name}: ${metrics.htmlLength} HTML chars, ${metrics.bodyWidth}px body`);
  };

  await capture('01-login', () => { state.appReady = false; state.onboardingStep = 1; state.authMode = 'login'; state.errorMsg = ''; render(); });
  await capture('02-role', () => { state.appReady = false; state.onboardingStep = 2; render(); });
  await capture('03-profile-setup', () => { state.appReady = false; state.onboardingStep = 3; state.role = 'child'; state.userAvatar = '🌻'; render(); });
  await capture('04-family-connect', () => { state.appReady = false; state.onboardingStep = 4; state.connectionMode = 'create'; state.calendarCode = '682 491'; render(); });

  await page.evaluate(() => {
    window.__prepareReadyView = (tab) => {
      state.appReady = true; state.aiImageGenView = false; state.showModal = null;
      state.currentTab = tab; state.role = 'child'; state.userName = '阿強';
      state.userAvatar = '🌻'; state.authUid = 'child_1'; state.backendMode = 'server';
    };
  });
  await capture('05-calendar-tearoff', () => { window.__prepareReadyView('calendar'); state.calendarMode = 'tear-off'; render(); });
  await capture('06-calendar-monthly', () => { window.__prepareReadyView('calendar'); state.calendarMode = 'monthly'; render(); });
  await capture('07-chat', () => { window.__prepareReadyView('chat'); render(); });
  await capture('08-rewards', () => { window.__prepareReadyView('rewards'); render(); });
  await capture('09-profile', () => { window.__prepareReadyView('profile'); render(); });
  await capture('10-add-memory', () => { window.__prepareReadyView('calendar'); state.showModal = 'addMemory'; state.pendingMemoryType = 'text'; render(); });
  await capture('11-ai-image', () => {
    window.__prepareReadyView('calendar'); state.aiImageGenView = true; state.aiImageGenerating = false;
    state.aiImageResults = []; state.aiImageRefImage = null; render();
  });

  if (pageErrors.length) throw new Error(`Browser errors:\n${pageErrors.join('\n')}`);
  console.log(`VISUAL SMOKE OK: ${shots.length} screenshots in ${path.relative(ROOT, OUT)}`);
  await browser.close();
  server.close();
})().catch(err => {
  console.error('VISUAL SMOKE FAILED\n' + (err.stack || err));
  process.exitCode = 1;
});
