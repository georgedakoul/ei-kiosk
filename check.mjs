// End-to-end check in headless Chrome: the form and thank-you screens on 8 sizes (screenshots plus a layout audit),
// validation, the idle (90 s) and thank-you (25 s) resets, the lead archive and CSV export, private-mode storage,
// the offline queue, and that nothing but the page and the Apps Script web app is contacted.
// Usage: node check.mjs [page-url] [screenshot-dir]
// By default the web app POST is intercepted and answered locally. LIVE=1 lets the offline-queue lead
// (name "TEST kiosk offline", tablet "TEST") through to the real Sheet: delete that row after.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const PAGE = process.argv[2] || new URL('index.html', import.meta.url).href;
const OUT = process.argv[3] || join(process.env.HOME, '.local/state/pi-subagents/ei-kiosk-check');
const LIVE = process.env.LIVE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'ei-kiosk-check-'));
const chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) resolve(m[0]); });
  chrome.on('exit', () => reject(new Error('Chrome exited: ' + buf)));
});

let ws, seq = 0;
const pending = new Map(), listeners = [];
function connect(url) {
  ws = new WebSocket(url);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method) listeners.forEach((l) => l(m));
  };
  return new Promise((r) => (ws.onopen = r));
}
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

let sid;
const page = (method, params) => send(method, params, sid);
async function js(expression) {
  const r = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(expression + ': ' + r.exceptionDetails.exception?.description);
  return r.result.value;
}
async function go(url) {
  await page('Page.navigate', { url });
  for (let i = 0; i < 50 && (await js('document.readyState').catch(() => '')) !== 'complete'; i++) await sleep(100);
  await sleep(300);
}
async function shot(name) {
  await sleep(350);
  const { data } = await page('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(data, 'base64'));
}
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const pick = (label) => js(`[...document.querySelectorAll('.choice')].find(b => b.textContent === ${JSON.stringify(label)}).click()`);
const visible = () => js(`['form','thanks','export'].find(id => !document.getElementById(id).hidden)`);
const fill = (sel, v) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const archive = () => js(`JSON.parse(localStorage.getItem('ei-kiosk-archive') || '[]')`);
const state = () => js(`({ name: document.getElementById('f-name').value, email: document.getElementById('f-email').value, phone: document.getElementById('f-phone').value, consent: document.getElementById('f-consent').checked,
  pressed: [...document.querySelectorAll('.choice[aria-pressed=true]')].map((b) => b.textContent) })`);

// Runs in the page: layout problems on the screen showing now.
function audit() {
  const bad = [], W = innerWidth, H = innerHeight;
  const vis = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + '[' + el.textContent.trim().slice(0, 20) + ']';
  if (document.documentElement.scrollWidth > W || document.body.scrollWidth > W) bad.push('page scrolls horizontally');
  const shown = [...document.querySelectorAll('.screen:not([hidden]) *')].filter(vis);
  for (const el of shown) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width && (r.left < -1 || r.right > W + 1)) bad.push('outside the viewport sideways: ' + name(el));
    // A text field holding more than it can show is normal, so inputs are left out.
    if (el.tagName !== 'INPUT' && cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) bad.push('scrolls sideways: ' + name(el));
    if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 1) bad.push('text overflows: ' + name(el));
    if (el.matches('button:not([disabled]), input:not([type=checkbox]), .consent') && (r.height < 40 || r.width < 40)) bad.push('tiny target ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + name(el));
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !el.closest('#dot, #device') && parseFloat(cs.fontSize) < 11) bad.push('text under 11px: ' + name(el));
    if (el.matches('#send, #next-visitor, #x-csv, #x-retry') && (r.top < -1 || r.bottom > H + 1)) bad.push('button off screen: ' + name(el));
  }
  const rect = (sel) => document.querySelector('.screen:not([hidden]) ' + sel)?.getBoundingClientRect();
  const [a, b] = [rect('.brand'), rect('.entry')];
  if (a && b && getComputedStyle(document.getElementById('form')).display === 'grid' && a.right > b.left + 1) bad.push('brand overlaps the form');
  const scrolls = [...document.querySelectorAll('.screen:not([hidden]), .screen:not([hidden]) :is(.brand, .entry)')].some((el) => el.scrollHeight > el.clientHeight + 1);
  if (['form', 'thanks'].some((id) => !document.getElementById(id).hidden && /export/i.test(document.getElementById(id).outerHTML))) bad.push('the kiosk flow mentions export');
  return { bad, scrolls };
}
const problems = [], scrollsOn = new Map();
async function snap(tag, name) {
  await shot(name);
  const { bad, scrolls } = await js(`(${audit})()`);
  bad.forEach((b) => problems.push(`${tag} ${name}: ${b}`));
  if (scrolls) scrollsOn.set(tag, [...(scrollsOn.get(tag) || []), name.replace(/^.*?-(\d\d)-/, '')]);
}

// One whole visit, ending on the thank-you screen (or the validation errors, when something is missing).
async function lead({ name = 'Check Person', email = 'check.person@example.com', phone = '', count = '2 to 5', done = 'No', consent = true } = {}) {
  await fill('#f-name', name); await fill('#f-email', email); await fill('#f-phone', phone);
  if (count) await pick(count);
  if (done) await pick(done);
  await js(`document.querySelector('#f-consent').checked = ${consent}`);
  await click('#send');
}

// A small CSV reader (quoted fields, doubled quotes, CRLF) to check the export the way Excel would read it.
function parseCsv(text) {
  const rows = [[]]; let f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { rows.at(-1).push(f); f = ''; }
    else if (c === '\n') { rows.at(-1).push(f.replace(/\r$/, '')); f = ''; rows.push([]); }
    else f += c;
  }
  if (f || rows.at(-1).length) rows.at(-1).push(f);
  return rows.filter((r) => r.length);
}
const SIZES = ['1280x800', '800x1280', '1180x820', '820x1180', '390x844', '844x390', '1280x600', '600x1280'];
const ATHENS_ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+0[23]:00$/;
// The redirect from easyinfluencer.travel/go/websummit adds these. The page must not care.
const VIA_REDIRECT = '?utm_source=qr&utm_medium=offline&utm_campaign=websummit';
const COLUMNS = ['Timestamp', 'Name', 'Email', 'Phone', 'Hotels / villas', 'Done influencer marketing', 'Tablet', 'Owner'];

let posts = 0, offline = false, lastPost = null;
const requests = [];

const dl = mkdtempSync(join(tmpdir(), 'ei-kiosk-dl-'));
try {
  await connect(wsUrl);
  ({ sessionId: sid } = await send('Target.attachToTarget', {
    targetId: (await send('Target.createTarget', { url: 'about:blank' })).targetId, flatten: true }));
  await page('Page.enable');
  await page('Network.enable');
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  listeners.push((m) => {
    if (m.method === 'Fetch.requestPaused') {
      lastPost = { type: m.params.request.headers['Content-Type'] || m.params.request.headers['content-type'], body: m.params.request.postData, referrer: m.params.request.headers.Referer };
      offline ? page('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'InternetDisconnected' })
        : page('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, body: '' });
    }
    if (m.method === 'Network.responseReceived' && m.params.response.url.includes('script.google.com')) posts++;
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  // The run never reaches the real Sheet, except the one LIVE lead at the end.
  await page('Fetch.enable', { patterns: [{ urlPattern: '*script.google.com*' }] });
  mkdirSync(OUT, { recursive: true });
  // Counts the navigator.storage.persist() calls the page makes on load.
  await page('Page.addScriptToEvaluateOnNewDocument', { source: `window.__persist = 0;
    try { const s = navigator.storage, p = s.persist.bind(s); s.persist = () => { window.__persist++; return p(); }; } catch {}` });
  const mobile = (w, h) => page('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true,
    screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });

  // Every screen on each size: a screenshot and a layout audit of each. Each lead also lands in the archive,
  // which has to grow by one per visit and survive the reload between visits.
  let expected = 0;
  // ONLY=1280x800,390x844 runs just those sizes while iterating.
  for (const tag of SIZES.filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s))) {
    const [W, H] = tag.split('x').map(Number);
    await mobile(W, H);
    await go(PAGE + VIA_REDIRECT);
    assert.equal((await archive()).length, expected, tag + ': the archive survives a reload');
    assert.ok(await js('window.__persist') >= 1, 'navigator.storage.persist() is called on load');
    assert.deepEqual(await js(`({ warn: document.getElementById('storage-warn').hidden, dev: document.getElementById('device').textContent, unset: document.getElementById('device').className, screen })`),
      { warn: true, dev: 'Tablet: not set', unset: 'unset', screen: 'form' });
    await snap(tag, `${tag}-01-form`);
    // Nothing chosen: every error shows, nothing is queued.
    await click('#send'); await sleep(400);
    assert.deepEqual(await js(`({ e: ['name','email','count','done'].map((k) => document.getElementById('e-' + k).textContent), consent: document.getElementById('consent-box').classList.contains('bad'), queued: queue().length, screen })`),
      { e: ['Please enter your name', 'Please enter a valid email', 'Please choose one', 'Please choose one'], consent: true, queued: 0, screen: 'form' });
    await snap(tag, `${tag}-02-errors`);
    await fill('#f-name', 'Inês Carvalho'); await fill('#f-email', 'ines@'); await pick('6 to 20'); await pick('Yes');
    await click('#send'); await sleep(300);
    assert.equal(await js(`document.getElementById('e-email').textContent`), 'Please enter a valid email');
    assert.equal(await js('queue().length'), 0);
    await fill('#f-email', 'ines.carvalho@example.pt'); await fill('#f-phone', '+351 912 847 193');
    await js(`document.querySelector('#f-consent').checked = true`);
    await click('#send'); // clears the errors that are left
    expected++;
    assert.equal(await visible(), 'thanks');
    // The same lead, filled but not sent, for the screenshot.
    await go(PAGE + VIA_REDIRECT);
    await fill('#f-name', 'Inês Carvalho'); await fill('#f-email', 'ines.carvalho@example.pt'); await fill('#f-phone', '+351 912 847 193');
    await pick('6 to 20'); await pick('Yes'); await js(`document.querySelector('#f-consent').checked = true`);
    await snap(tag, `${tag}-03-filled`);
    await click('#send');
    await snap(tag, `${tag}-04-thank-you`);
    expected++;
    assert.equal((await archive()).length, expected, tag + ': the archive grows on every submit');
    await go(PAGE + '?export');
    assert.deepEqual(await js(`({ screen: ['form','export'].find(id => !document.getElementById(id).hidden), n: document.getElementById('x-archived').textContent })`), { screen: 'export', n: String(expected) });
    await snap(tag, `${tag}-05-export`);
    console.log(tag.padEnd(10), problems.some((p) => p.startsWith(tag + ' ')) ? 'PROBLEMS' : 'ok', scrollsOn.has(tag) ? '(scrolls inside: ' + scrollsOn.get(tag).join(', ') + ')' : '(fits without scrolling)');
  }
  problems.forEach((p) => console.log('  ' + p));
  assert.deepEqual(problems, [], 'layout problems');
  await mobile(1280, 800);

  // The archive holds the answers in the Sheet's column order, the posted body and the Athens submit time.
  const first = (await archive())[0], sent = JSON.parse(first.body);
  assert.match(first.ts, ATHENS_ISO);
  assert.deepEqual(first.row, { Timestamp: first.ts, Name: 'Inês Carvalho', Email: 'ines.carvalho@example.pt', Phone: '+351 912 847 193',
    'Hotels / villas': '6 to 20', 'Done influencer marketing': 'Yes', Tablet: '', Owner: 'Έλη' });
  assert.deepEqual(Object.keys(sent).sort(), ['email', 'id', 'influencer', 'name', 'phone', 'properties', 'tablet', 'ts']);
  assert.equal(sent.properties, '6 to 20');
  assert.ok(first.sent, 'a lead that went through has its sent time');
  assert.equal(lastPost.type.toLowerCase(), 'text/plain;charset=utf-8', 'a plain-text POST: no preflight');
  assert.ok(!lastPost.referrer, 'no referrer is sent');
  console.log('archive: ok,', expected, 'leads, first at', first.ts);

  // No third-party: every request is the page itself, its fonts and images, or the Apps Script web app.
  const hosts = [...new Set(requests.filter((u) => /^https?:/.test(u)).map((u) => new URL(u).host))];
  const own = new URL(PAGE).host;
  assert.deepEqual(hosts.filter((h) => h !== own && h !== 'script.google.com'), [], 'only the page and the web app are contacted');
  console.log('requests: ok,', hosts.join(', ') || '(file)');

  // Idle reset: what a visitor typed and chose is cleared after the (shortened) idle timer.
  await go(PAGE + '?idle=2&thanks=2');
  await fill('#f-name', 'Idle Person'); await pick('1'); await pick('Yes'); await js(`document.querySelector('#f-consent').checked = true`);
  await sleep(1200); await js(`document.getElementById('form').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await sleep(1200);
  assert.equal((await state()).name, 'Idle Person', 'a touch restarts the idle timer');
  await sleep(1500);
  assert.deepEqual(await state(), { name: '', email: '', phone: '', consent: false, pressed: [] });
  assert.equal(await visible(), 'form');
  // The thank-you screen goes back by itself too.
  await lead({ name: 'Short Timer' });
  assert.equal(await visible(), 'thanks');
  await sleep(2600);
  assert.equal(await visible(), 'form');
  console.log('idle reset: ok');

  // Thank-you screen. The lead is queued and archived before it shows, so a reload there loses nothing.
  // The network is down for this part, so the queue cannot drain on its own.
  offline = true;
  await go(PAGE);
  const [q0, a0] = [await js('queue().length'), (await archive()).length];
  await lead({ name: 'Reload Safe' });
  assert.deepEqual(await js(`({ screen, queued: queue().length, archived: JSON.parse(localStorage.getItem('ei-kiosk-archive')).length })`),
    { screen: 'thanks', queued: q0 + 1, archived: a0 + 1 });
  assert.equal(await js(`document.getElementById('thanks-title').textContent`), 'Thank you, Reload.');
  await go(PAGE);
  assert.equal(await visible(), 'form');
  assert.deepEqual([await js('queue().length'), (await archive()).length], [q0 + 1, a0 + 1], 'a reload on the thank-you screen keeps the lead');
  // It returns to the start by itself after the default 25 s, even with taps on the thank-you screen meanwhile.
  await go(PAGE);
  await lead({ name: 'Default Timer' });
  assert.equal(await visible(), 'thanks');
  await sleep(10000);
  await js(`document.getElementById('thanks').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await sleep(13000);
  assert.equal(await visible(), 'thanks', 'still on the thank-you screen before 25 s');
  await sleep(3500);
  assert.equal(await visible(), 'form', 'back at the start 25 s after the thank-you');
  assert.deepEqual(await state(), { name: '', email: '', phone: '', consent: false, pressed: [] });
  // The Next visitor button resets at once.
  await lead({ name: 'Next Button' });
  assert.equal(await visible(), 'thanks');
  await click('#next-visitor');
  assert.equal(await visible(), 'form');
  assert.deepEqual(await state(), { name: '', email: '', phone: '', consent: false, pressed: [] });
  // Frozen timers (a sleeping tablet): the first tick or visibility change after waking resets it.
  await lead({ name: 'Frozen Timer' });
  await js(`deadline = Date.now() - 1; document.dispatchEvent(new Event('visibilitychange')); dispatchEvent(new Event('focus'))`);
  assert.equal(await visible(), 'form');
  // The idle deadline of 90 s is the default.
  await js(`arm()`);
  const idleMs = await js(`deadline - Date.now()`);
  assert.ok(idleMs > 89000 && idleMs <= 90000, 'idle reset is 90 s, got ' + idleMs);
  offline = false;
  await js('flush()'); await sleep(1500);
  assert.equal(await js('queue().length'), 0);
  console.log('thank-you reset: ok (25 s, Next visitor, frozen timers, 90 s idle, reload keeps the lead)');

  // Device name: set once on ?export, kept in localStorage, shown small on the form screen, posted with each lead.
  await go(PAGE + '?export');
  await fill('#x-device', 'Tablet 1 · Έλη'); 
  assert.equal(await js(`localStorage.getItem('ei-kiosk-device')`), 'Tablet 1 · Έλη');
  await go(PAGE);
  assert.deepEqual(await js(`({ dev: document.getElementById('device').textContent, unset: document.getElementById('device').className })`), { dev: 'Tablet 1 · Έλη', unset: '' });
  await shot('device-set-form');

  // Export: counts, the Retry button, and a CSV that Excel and Google Sheets open correctly.
  // The last visit has awkward text: a comma, quotes and something Excel would run as a formula.
  offline = true;
  await go(PAGE);
  await lead({ name: 'Maria "Mimi" Silva, Jr.', email: 'maria@example.pt', phone: '=HYPERLINK("http://x")', count: '20+', done: 'Yes' });
  expected = (await archive()).length;
  await go(PAGE + '?export');
  assert.deepEqual(await js(`[document.getElementById('x-archived').textContent, document.getElementById('x-queued').textContent]`), [String(expected), '1']);
  await click('#x-retry'); await sleep(1500);
  assert.equal(await js(`document.getElementById('x-msg').textContent`), 'Not sent yet: check the WiFi and try again.');
  assert.equal(await js('queue().length'), 1);
  offline = false; posts = 0;
  await click('#x-retry'); await sleep(1500);
  assert.equal(await js(`document.getElementById('x-msg').textContent`), 'All leads sent.');
  assert.deepEqual(await js(`[document.getElementById('x-queued').textContent, queue().length]`), ['0', 0]);
  assert.equal(posts, 1, 'Retry sending now posts the queued lead once');
  assert.ok((await archive()).at(-1).sent, 'the archive records the sent time');
  await click('#x-csv');
  let file;
  for (let i = 0; i < 50 && !(file = readdirSync(dl).find((f) => f.endsWith('.csv'))); i++) await sleep(100);
  assert.ok(file, 'the CSV downloads');
  const raw = readFileSync(join(dl, file));
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM first');
  const rows = parseCsv(raw.toString('utf8').slice(1));
  assert.equal(rows.length, expected + 1);
  assert.ok(rows.every((r) => r.length === rows[0].length), 'every row has the same number of columns');
  assert.deepEqual(rows[0], [...COLUMNS, 'Sent']);
  const col = (n) => rows[0].indexOf(n), last = rows.at(-1);
  assert.match(rows[1][0], ATHENS_ISO);
  assert.equal(rows[1][col('Name')], 'Inês Carvalho');
  assert.equal(rows[1][col('Hotels / villas')], '6 to 20');
  assert.equal(last[col('Name')], 'Maria "Mimi" Silva, Jr.');
  assert.equal(last[col('Phone')], `'=HYPERLINK("http://x")`);
  assert.equal(last[col('Hotels / villas')], '20+');
  assert.equal(last[col('Done influencer marketing')], 'Yes');
  assert.equal(last[col('Tablet')], 'Tablet 1 · Έλη');
  assert.equal(last[col('Owner')], 'Έλη');
  assert.equal(rows[1][col('Tablet')], '', 'leads taken before the name was set have no tablet');
  assert.match(last[col('Sent')], ATHENS_ISO);
  assert.ok(raw.toString('utf8').split('\r\n')[1].startsWith('"'), 'fields are quoted');
  assert.equal(JSON.parse((await archive()).at(-1).body).tablet, 'Tablet 1 · Έλη');
  console.log('export: ok,', rows.length - 1, 'rows,', file);
  await shot('export-after-download');

  // Private mode: localStorage refuses writes (old Safari) or refuses access altogether. The visitor flow carries on.
  const modes = {
    'writes throw': `Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };`,
    'access throws': `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });`,
  };
  for (const [mode, source] of Object.entries(modes)) {
    const { identifier } = await page('Page.addScriptToEvaluateOnNewDocument', { source });
    await go(PAGE);
    assert.deepEqual(await js(`({ hidden: document.getElementById('storage-warn').hidden, text: document.getElementById('storage-warn').textContent,
      bg: getComputedStyle(document.getElementById('storage-warn')).backgroundColor, screen })`),
      { hidden: false, text: 'Private mode: leads are not saved on this device', bg: 'rgb(180, 35, 24)', screen: 'form' }, mode);
    await shot('private-mode-' + mode.replace(' ', '-'));
    assert.equal((await js(`(${audit})()`)).bad.length, 0);
    offline = true;
    await lead({ name: 'Private Mode' });
    assert.equal(await visible(), 'thanks', mode + ': the visitor still reaches the thank-you screen');
    assert.equal(await js('queue().length'), 1, mode + ': the lead waits in memory for this page');
    offline = false;
    await js('flush()'); await sleep(1500);
    assert.equal(await js('queue().length'), 0);
    await page('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  await go(PAGE);
  assert.equal(await js(`document.getElementById('storage-warn').hidden`), true, 'no banner when storage works');
  console.log('private mode: ok (banner shown, visitor flow not stopped)');

  // Offline queue: submit with the network down, then restore it. Exactly one POST arrives.
  await js(`localStorage.clear()`);
  if (LIVE) await page('Fetch.disable');
  posts = 0;
  await go(PAGE + '?thanks=60');
  if (LIVE) await js(`localStorage.setItem('ei-kiosk-device', 'TEST')`);
  offline = true;
  await page('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(300);
  await lead({ name: 'TEST kiosk offline', email: 'test.kiosk@example.com', phone: '+30 210 0000000', count: '2 to 5', done: 'Yes' });
  await sleep(1500);
  const whileOffline = await js(`({ queued: queue().length, dot: document.getElementById('dot').className, count: document.getElementById('dot').textContent, screen })`);
  assert.deepEqual(whileOffline, { queued: 1, dot: 'queued', count: '1', screen: 'thanks' });
  assert.equal(posts, 0);
  assert.equal((await archive()).length, 1);
  assert.equal((await archive())[0].sent, null, 'not marked sent while it waits');
  const body = JSON.parse(await js(`queue()[0].body`));
  assert.deepEqual({ ...body, id: '', ts: '' }, { id: '', ts: '', name: 'TEST kiosk offline', email: 'test.kiosk@example.com', phone: '+30 210 0000000',
    properties: '2 to 5', influencer: 'Yes', tablet: LIVE ? 'TEST' : '' });
  await shot('offline-queued-dot');
  offline = false;
  await page('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (let i = 0; i < 100 && (await js('queue().length')) > 0; i++) await sleep(100);
  assert.equal(await js('queue().length'), 0, 'the online event should drain the queue');
  // A second flush must not send it again.
  await js('flush()'); await sleep(1500);
  assert.deepEqual(await js(`({ queued: queue().length, dot: document.getElementById('dot').className })`), { queued: 0, dot: '' });
  if (!LIVE) assert.equal(posts, 1);
  assert.equal((await archive()).length, 1, 'sending does not remove it from the archive');
  assert.match((await archive())[0].sent, ATHENS_ISO);
  await shot('online-queue-empty-dot');
  console.log('offline queue: ok, posts =', posts, LIVE ? '(live)' : '(intercepted)');
  console.log('PASS');
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
  rmSync(dl, { recursive: true, force: true });
}
