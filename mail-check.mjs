// Unit checks for the thank-you email (thank-you.gs) and its hook in sheet-writer.gs. No network, no Google: Apps Script's services are stubbed.
// Usage: node mail-check.mjs   (healthy output ends with PASS)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = (f) => new URL(f, import.meta.url);
const SRC = { mail: readFileSync(here('thank-you.gs'), 'utf8'), writer: readFileSync(here('sheet-writer.gs'), 'utf8') };
const plain = (x) => JSON.parse(JSON.stringify(x));
const GEORGE = 'george.koulouris@renfluence.com';

// A Sheet that is a grid: rows and columns count from 1, like Apps Script's.
class FakeSheet {
  constructor(rows = []) { this.g = rows; }
  getLastRow() { return this.g.length; }
  getLastColumn() { return Math.max(0, ...this.g.map((r) => r.length)); }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (s.g[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (s.g[r - 1 + i] ||= [])[c - 1 + j] = x; })); return this; },
      getValue: () => (s.g[r - 1] || [])[c - 1] ?? '',
      setValue(x) { (s.g[r - 1] ||= [])[c - 1] = x; return this; },
      setNumberFormat() { return this; }, setFontWeight() { return this; },
    };
  }
}

// One script project in a fresh sandbox. flag = SEND_THANK_YOU; props = Script Properties; status = what the provider answers.
function load({ flag = false, props = {}, sheet = new FakeSheet(), status = 200 } = {}) {
  const calls = { fetch: [], gmail: [] }, p = { ...props }, cache = {};
  const stubs = {
    console: { log() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => p[k] ?? null, setProperty: (k, v) => { p[k] = v; } }) },
    UrlFetchApp: { fetch: (url, o) => { calls.fetch.push({ url, ...o, payload: JSON.parse(o.payload) }); return { getResponseCode: () => status, getContentText: () => JSON.stringify({ message: 'nope' }) }; } },
    GmailApp: { sendEmail: (...a) => calls.gmail.push(a) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    SpreadsheetApp: { openById: () => ({ getSheets: () => [sheet] }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return JSON.parse(s); } }) },
    Utilities: { formatDate: () => '2026-11-10 10:00:00' },
  };
  const ctx = vm.createContext(stubs);
  const mail = flag ? SRC.mail.replace('const SEND_THANK_YOU = false;', 'const SEND_THANK_YOU = true;') : SRC.mail;
  assert.equal(mail !== SRC.mail, flag, 'SEND_THANK_YOU line not found');
  vm.runInContext(mail, ctx);
  vm.runInContext(SRC.writer, ctx);
  return { run: (expr) => vm.runInContext(expr, ctx), calls, props: p, sheet, ctx };
}
const post = (m, lead) => m.run('doPost')({ postData: { contents: JSON.stringify({ id: 'id-' + Math.random(), ts: '2026-11-10T09:00:00Z', firstName: 'Ana', lastName: 'Silva', email: 'ana@hotel.pt', phone: '', type: 'Hotel', properties: '2 to 5', influencer: 'No', tablet: 'T1', ...lead }) } });
const cfg = (o = {}) => ({ enabled: true, key: 'k', provider: 'resend', testTo: '', ...o });
const lead = (o = {}) => ({ name: 'Ana Silva', firstName: 'Ana', email: 'ana@hotel.pt', consent: true, ...o });
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok: ' + name); };

// ---- the pure parts
const m0 = load();
const plan = (l, c) => plain(m0.run('plan_')(l, c));

ok('email validation: accepts one plain address, rejects lists, brackets, spaces and junk', () => {
  const v = m0.run('validAddress_');
  ['a@b.co', 'first.last+tag@sub.hotel.pt'].forEach((a) => assert.ok(v(a), a));
  ['', 'a@b', 'a b@c.com', 'a@x.com,b@y.com', 'a@x.com,b', 'a@x.com;b@y.com', '<a@b.com>', 'Ann <a@b.com>', 'a@@b.com', '"a"@b.com', 'a@b.com\n', 'a@b.c', null, undefined, 42, 'a'.repeat(250) + '@b.com']
    .forEach((a) => assert.ok(!v(a), String(a)));
});

ok('fill: first name is HTML-escaped, nothing {{ is left, the voucher block drops when empty', () => {
  const fill = m0.run('fill_');
  const html = '<p>{{first_name}}</p>\n<!-- voucher_line:start -->\n<td>{{voucher_line}}</td>\n<!-- voucher_line:end -->\n<p>end</p>';
  assert.equal(fill(html, { first_name: '<b>A&"', voucher_line: '' }, m0.run('esc_')), '<p>&lt;b&gt;A&amp;&quot;</p>\n<p>end</p>');
  assert.match(fill(html, { first_name: 'A', voucher_line: 'Code X' }, m0.run('esc_')), /<td>Code X<\/td>/);
  assert.equal(fill('a\n\n{{voucher_line}}\n\nb', { voucher_line: '' }), 'a\n\nb');
  assert.equal(fill('{{x}} {{first_name}}', { first_name: '$&' }), '{{x}} $&', 'a value with $ patterns is inserted literally');
});

ok('plan: off by default, no key, bad provider, bad email, no consent', () => {
  assert.equal(plan(lead(), cfg({ enabled: false })).reason, 'off');
  assert.equal(plan(lead(), cfg({ key: '' })).reason, 'no key');
  assert.equal(plan(lead(), cfg({ provider: 'sendgrid' })).reason, 'unknown provider');
  assert.equal(plan(lead({ email: 'a@b.com,c@d.com' }), cfg()).reason, 'invalid email');
  assert.equal(plan(lead({ consent: false }), cfg()).reason, 'no consent');
  assert.equal(m0.run('SEND_THANK_YOU'), false);
});

ok('plan: a real lead gets From, Reply-To, subject, first name, voucher and unsubscribe wording, in both versions', () => {
  const p = plan(lead({ firstName: '  Ana  ' }), cfg());
  assert.equal(p.send, true);
  assert.equal(p.to, 'ana@hotel.pt');
  assert.deepEqual(p.from, { name: 'easyInfluencer', email: 'info@easyinfluencer.travel' });
  assert.equal(p.replyTo, 'info@easyinfluencer.travel');
  assert.equal(p.subject, 'Thank you for visiting easyInfluencer at Web Summit');
  for (const body of [p.text, p.html]) {
    assert.match(body, /Hi Ana,/);
    assert.match(body, /WEBSUMMIT26/);
    assert.match(body, /50% off your first paid month/);
    assert.match(body, /17 Nov/);
    assert.match(body, /15 days, with a card/);
    assert.match(body, /reply (&lsquo;|')no(&rsquo;|') and we will not write again/);
    assert.match(body, /info@easyinfluencer\.travel/);
    assert.ok(!/\{\{|\}\}/.test(body), 'placeholder left');
  }
  assert.ok(p.html.startsWith('<!DOCTYPE html>'));
});

ok('plan: a missing first name reads "Hi there,"; a hostile one cannot inject HTML', () => {
  assert.match(plan(lead({ firstName: '' }), cfg()).text, /Hi there,/);
  const h = plan(lead({ firstName: '<script>alert(1)</script>' }), cfg()).html;
  assert.ok(!h.includes('<script>'));
});

ok('plan: TEST leads are skipped, unless TEST_TO is George, and then go to George only', () => {
  assert.equal(plan(lead({ name: 'TEST kiosk' }), cfg()).reason, 'test lead');
  assert.equal(plan(lead({ name: 'TEST kiosk' }), cfg({ testTo: 'someone@else.com' })).reason, 'test lead');
  const p = plan(lead({ name: 'TEST kiosk' }), cfg({ testTo: GEORGE }));
  assert.equal(p.to, GEORGE);
  assert.equal(plan(lead({ name: 'Tester Real' }), cfg({ testTo: GEORGE })).to, 'ana@hotel.pt', 'a real lead is never diverted');
});

ok('request: Resend and MailerSend shapes, the key only in the Authorization header', () => {
  const p = plan(lead(), cfg());
  const r = plain(m0.run('request_')(p, 'SECRET', 'idem-1'));
  assert.equal(r.url, 'https://api.resend.com/emails');
  assert.equal(r.headers.Authorization, 'Bearer SECRET');
  assert.equal(r.headers['Idempotency-Key'], 'idem-1');
  assert.deepEqual([r.body.from, r.body.to, r.body.reply_to], ['easyInfluencer <info@easyinfluencer.travel>', ['ana@hotel.pt'], 'info@easyinfluencer.travel']);
  const ms = plain(m0.run('request_')(plan(lead(), cfg({ provider: 'mailersend' })), 'SECRET', 'i'));
  assert.equal(ms.url, 'https://api.mailersend.com/v1/email');
  assert.deepEqual([ms.body.from.email, ms.body.to, ms.body.reply_to.email], ['info@easyinfluencer.travel', [{ email: 'ana@hotel.pt' }], 'info@easyinfluencer.travel']);
  [r, ms].forEach((x) => assert.ok(!JSON.stringify(x.body).includes('SECRET')));
});

// ---- idempotency
const memStore = (v = '') => { const s = { v, log: [], get: () => s.v, set: (x) => { s.v = x; s.log.push(x); } }; return s; };
const deps = (o = {}) => { const d = { store: memStore(), now: new Date('2026-11-10T10:00:00Z'), sent: [], send(p) { d.sent.push(p.to); }, count: () => 0, bump() { d.bumped = (d.bumped || 0) + 1; }, ...o }; return d; };
const deliver = (l, c, d) => m0.run('deliver_')(l, c, d);

ok('deliver: sends once; a retry or re-run on the same row never sends again', () => {
  const d = deps();
  assert.equal(deliver(lead(), cfg(), d), 'sent');
  assert.equal(deliver(lead(), cfg(), d), 'already tried');
  assert.equal(deliver(lead(), cfg(), d), 'already tried');
  assert.equal(d.sent.length, 1);
  assert.match(d.store.v, /^sent 2026-11-10T10:00:00/);
});

ok('deliver: the marker says "sending" before the send happens, so a crash cannot cause a second email', () => {
  let seen;
  const d = deps(); d.send = () => { seen = d.store.v; };
  deliver(lead(), cfg(), d);
  assert.match(seen, /^sending /);
});

ok('deliver: a failed send is marked and not retried; a crash mid-send leaves "sending" and is not retried', () => {
  const d = deps(); d.send = () => { throw new Error('resend HTTP 500'); };
  assert.equal(deliver(lead(), cfg(), d), 'failed');
  assert.match(d.store.v, /^failed .*resend HTTP 500/);
  d.send = () => { throw new Error('must not run'); };
  assert.equal(deliver(lead(), cfg(), d), 'already tried');
  const crashed = deps({ store: memStore('sending 2026-11-10T10:00:00Z') });
  assert.equal(deliver(lead(), cfg(), crashed), 'already tried');
  assert.equal(crashed.sent.length, 0);
});

ok('deliver: nothing is written while off, a skip is marked once, the daily cap holds', () => {
  const off = deps(); assert.equal(deliver(lead(), cfg({ enabled: false }), off), 'skipped: off');
  assert.equal(off.store.log.length, 0);
  const nokey = deps(); deliver(lead(), cfg({ key: '' }), nokey);
  assert.equal(nokey.store.v, 'skipped: no key'); assert.equal(nokey.sent.length, 0);
  const capped = deps({ count: () => 300 });
  assert.equal(deliver(lead(), cfg(), capped), 'skipped: daily cap'); assert.equal(capped.sent.length, 0);
});

// ---- the hook in doPost
const HEADS = ['Timestamp', 'Name', 'First name', 'Last name', 'Email', 'Phone', 'Business type', 'Hotels / villas', 'Done influencer marketing', 'Tablet', 'Owner'];

ok('doPost, flag off (as shipped): lead saved, no extra column, nothing contacted even with a key set', () => {
  const sheet = new FakeSheet([HEADS.slice()]);
  const m = load({ sheet, props: { EMAIL_PROVIDER_KEY: 'k' } });
  assert.deepEqual(post(m, {}), { ok: true });
  assert.equal(sheet.g.length, 2);
  assert.equal(sheet.g[0].length, HEADS.length, 'no Thank-you sent header added');
  assert.equal(sheet.g[1][4], 'ana@hotel.pt');
  assert.deepEqual([m.calls.fetch.length, m.calls.gmail.length], [0, 0]);
});

ok('doPost, flag on but no key: lead saved, nothing sent, row marked "skipped: no key"', () => {
  const sheet = new FakeSheet([HEADS.slice()]);
  const m = load({ flag: true, sheet });
  assert.deepEqual(post(m, {}), { ok: true });
  assert.equal(m.calls.fetch.length, 0);
  assert.equal(sheet.g[0][HEADS.length], 'Thank-you sent');
  assert.equal(sheet.g[1][HEADS.length], 'skipped: no key');
});

ok('doPost, flag on and key set: one Resend call per new lead, marker "sent", a repeated POST id sends nothing', () => {
  const sheet = new FakeSheet([HEADS.slice()]);
  const m = load({ flag: true, sheet, props: { EMAIL_PROVIDER_KEY: 'k' } });
  const body = { id: 'same-id' };
  assert.deepEqual(post(m, body), { ok: true });
  assert.deepEqual(post(m, body), { ok: true, duplicate: true });
  assert.equal(m.calls.fetch.length, 1);
  assert.equal(m.calls.fetch[0].url, 'https://api.resend.com/emails');
  assert.equal(m.calls.fetch[0].headers['Idempotency-Key'], 'same-id');
  assert.equal(m.calls.fetch[0].payload.to[0], 'ana@hotel.pt');
  assert.match(sheet.g[1][HEADS.length], /^sent /);
  assert.equal(sheet.g.length, 2);
  assert.equal(m.props.TY_COUNT.split(':')[1], '1');
});

ok('doPost, flag on: a provider error never fails the lead; a TEST lead only mails George when TEST_TO is his', () => {
  const sheet = new FakeSheet([HEADS.slice()]);
  const m = load({ flag: true, sheet, props: { EMAIL_PROVIDER_KEY: 'k' }, status: 403 });
  assert.deepEqual(post(m, {}), { ok: true });
  assert.match(sheet.g[1][HEADS.length], /^failed .*resend HTTP 403 nope/);
  const s2 = new FakeSheet([HEADS.slice()]), m2 = load({ flag: true, sheet: s2, props: { EMAIL_PROVIDER_KEY: 'k' } });
  post(m2, { firstName: 'TEST', lastName: 'kiosk' });
  assert.equal(m2.calls.fetch.length, 0);
  const s3 = new FakeSheet([HEADS.slice()]), m3 = load({ flag: true, sheet: s3, props: { EMAIL_PROVIDER_KEY: 'k', TEST_TO: GEORGE } });
  post(m3, { firstName: 'TEST', lastName: 'kiosk' });
  assert.deepEqual(m3.calls.fetch.map((c) => c.payload.to), [[GEORGE]]);
});

ok('doPost, flag on, Gmail fallback: GmailApp sends from the info@ alias with Reply-To', () => {
  const sheet = new FakeSheet([HEADS.slice()]);
  const m = load({ flag: true, sheet, props: { EMAIL_PROVIDER_KEY: 'gmail', EMAIL_PROVIDER: 'gmail' } });
  post(m, {});
  assert.equal(m.calls.fetch.length, 0);
  const [to, subject, text, o] = m.calls.gmail[0];
  assert.deepEqual([to, o.from, o.replyTo, o.name], ['ana@hotel.pt', 'info@easyinfluencer.travel', 'info@easyinfluencer.travel', 'easyInfluencer']);
  assert.match(text, /Hi Ana,/); assert.match(o.htmlBody, /<html/); assert.match(subject, /Thank you/);
});

ok('doPost, empty Sheet with the flag on: header row, then the lead on row 2 with its marker', () => {
  const sheet = new FakeSheet();
  const m = load({ flag: true, sheet, props: { EMAIL_PROVIDER_KEY: 'k' } });
  post(m, {});
  assert.equal(sheet.g[0].at(-1), 'Thank-you sent');
  assert.match(sheet.g[1].at(-1), /^sent /);
});

ok('sendTestMail and dryRun: George only; the test mail refuses without a key', () => {
  const none = load();
  assert.throws(() => none.run('sendTestMail')(), /EMAIL_PROVIDER_KEY/);
  const m = load({ props: { EMAIL_PROVIDER_KEY: 'k' } });
  m.run('sendTestMail')();
  assert.deepEqual(m.calls.fetch.map((c) => c.payload.to), [[GEORGE]]);
  const sheet = new FakeSheet([HEADS.slice(), ['t', 'Ana Silva', 'Ana', 'Silva', 'ana@hotel.pt']]);
  const d = load({ sheet });
  d.run('dryRun')();
  assert.equal(d.calls.fetch.length, 0);
});

console.log('PASS (' + n + ' checks)');
