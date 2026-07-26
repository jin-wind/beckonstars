// Web-core smoke test: boots the shared web app (web/) inside jsdom and verifies
// that all modules load in order, the boot sequence runs, and the main views render.
// Network, native bridges, and vendor libs are stubbed. Usage: npm run test:web
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');

const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const scriptOrder = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
if (scriptOrder.length === 0) { console.error('FAIL: no js/ script tags found in web/index.html'); process.exit(1); }

const strippedHtml = html
  .replace(/<script src="[^"]*"><\/script>/g, '')
  .replace(/<script>[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(strippedHtml, {
  url: 'https://smoke.test/index.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;

const problems = [];
window.addEventListener('error', (e) => problems.push('window error: ' + (e.error && e.error.stack || e.message)));
process.on('unhandledRejection', (err) => problems.push('unhandled rejection: ' + (err && err.stack || err)));

// ---- stubs ----
window.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '', blob: async () => new window.Blob([]) });
window.qrcode = () => ({ addData() {}, make() {}, createImgTag: () => '<img alt="qr">', createDataURL: () => 'data:image/gif;base64,' });
window.tailwind = { config: {} };
window.Notification = function () {}; window.Notification.permission = 'default';
window.Notification.requestPermission = async () => 'default';
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {};
window.HTMLMediaElement.prototype.play = async function () {};
window.HTMLMediaElement.prototype.pause = function () {};
window.navigator.vibrate = () => true;

// ---- load app modules in declared order (real <script> semantics: top-level
// const/let land in the shared global lexical scope, same as the browser) ----
for (const rel of scriptOrder) {
  const src = fs.readFileSync(path.join(WEB, rel), 'utf8');
  const before = problems.length;
  const el = window.document.createElement('script');
  el.textContent = src + `\n//# sourceURL=${rel}`;
  window.document.body.appendChild(el);
  if (problems.length > before) {
    console.error(`FAIL: ${rel} threw at load:\n${problems.slice(before).join('\n')}`);
    process.exit(1);
  }
}
console.log(`loaded ${scriptOrder.length} modules`);

const evalIn = (expr) => window.eval(expr);

(async () => {
  // boot
  window.dispatchEvent(new window.Event('load'));
  await new Promise(r => setTimeout(r, 300));

  const checks = [];
  const check = (name, fn) => { try { const v = fn(); checks.push([name, !!v]); } catch (e) { checks.push([name, false, e.message]); } };

  check('state object exists', () => evalIn('typeof state') === 'object');
  check('render is a function', () => evalIn('typeof render') === 'function');
  check('#app rendered content', () => window.document.getElementById('app').innerHTML.trim().length > 200);

  // exercise main views if the app exposes a view switcher on state
  const viewField = ['currentView', 'view', 'activeTab', 'currentTab'].find(f => evalIn(`state && typeof state.${JSON.stringify(f).slice(1, -1)} !== 'undefined'`));
  if (viewField) {
    const initial = evalIn(`state.${viewField}`);
    console.log(`view field: state.${viewField} = ${JSON.stringify(initial)}`);
    const views = evalIn(`JSON.stringify(['calendar','chat','memories','settings','home'])`);
    for (const v of JSON.parse(views)) {
      check(`render view '${v}'`, () => {
        evalIn(`state.${viewField} = ${JSON.stringify(v)}; render();`);
        return window.document.getElementById('app').innerHTML.length > 200;
      });
    }
    evalIn(`state.${viewField} = ${JSON.stringify(initial)}; render();`);
  } else {
    console.log('no view field found on state; skipping per-view render checks');
  }

  let failed = 0;
  for (const [name, ok, msg] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${msg ? ' — ' + msg : ''}`);
    if (!ok) failed++;
  }
  for (const p of problems) { console.log('RUNTIME PROBLEM: ' + p); failed++; }
  console.log(failed === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
})();
