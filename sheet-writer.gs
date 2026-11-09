// Standalone Apps Script "easyInfluencer kiosk writer" owned by george.koulouris@renfluence.com (copy of what runs there). It is not bound to the
// Sheet because an editor of Έλη's Sheet cannot deploy a script bound to it ("You do not have permission"), so it opens the Sheet by id.
// Deployed as a web app: execute as George, access for anyone. The kiosk POSTs one lead as text/plain JSON.
// Appends one row to the first tab. Owner is always Έλη. thank-you.gs (second file of this project) sends the thank-you email; it is off, see there.
const SHEET_ID = '1W6Uv9fzaKaj5WCOwPIxUf--i-xY-oY-llLYTBLV93xk'; // Έλη's Sheet "WebSummit Lisbon 2026 - Questionnaire Leads"
const OWNER = 'Έλη';
// The columns of a fresh Sheet. Rows are written by header name, so an older Sheet keeps its order: missing headers are added at the
// right, and a legacy "Name" column (the first version of the Sheet) keeps getting "First Last".
const HEADERS = ['Timestamp', 'First name', 'Last name', 'Email', 'Phone', 'Business type', 'Hotels / villas', 'Done influencer marketing', 'Tablet', 'Owner'];
const TYPES = ['Hotel', 'Hotel group', 'Property owner', 'Management company', 'Agency'];
const PROPERTIES = ['1', '2 to 5', '6 to 20', '20+'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const text = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const lead = { id: text(d.id, 80), firstName: text(d.firstName, 60), lastName: text(d.lastName, 60), email: text(d.email, 120), phone: text(d.phone, 40),
      type: text(d.type, 40), properties: text(d.properties, 10), influencer: text(d.influencer, 3), tablet: text(d.tablet, 60), ts: new Date(d.ts) };
    if (!lead.firstName || !lead.lastName || !EMAIL.test(lead.email) || !TYPES.includes(lead.type) || !PROPERTIES.includes(lead.properties) || !['Yes', 'No'].includes(lead.influencer)) return reply_({ ok: false, error: 'invalid' });
    // The kiosk resends a lead whose first answer it never saw: the id makes the second POST a no-op.
    const cache = CacheService.getScriptCache();
    if (lead.id && cache.get(lead.id)) return reply_({ ok: true, duplicate: true });

    const sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    const when = isNaN(lead.ts) ? new Date() : lead.ts; // the time the visitor sent it, even when it queued offline
    const values = { 'Timestamp': Utilities.formatDate(when, 'Europe/Athens', 'yyyy-MM-dd HH:mm:ss'), 'Name': lead.firstName + ' ' + lead.lastName, 'First name': lead.firstName,
      'Last name': lead.lastName, 'Email': lead.email, 'Phone': lead.phone, 'Business type': lead.type, 'Hotels / villas': lead.properties,
      'Done influencer marketing': lead.influencer, 'Tablet': lead.tablet, 'Owner': OWNER, [MARK]: '' };
    const heads = headers_(sh);
    const rowNum = sh.getLastRow() + 1; // after headers_, which writes row 1 into an empty Sheet
    const row = heads.map((h) => (h in values ? values[h] : ''));
    // Plain text format first: otherwise Sheets turns "2 to 5" into a date, "+30..." into a number and "=..." into a formula.
    sh.getRange(rowNum, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    if (lead.id) cache.put(lead.id, '1', 21600);
    // The row is saved: a failed email must not fail the lead (the kiosk would resend it and the row would double).
    // The page makes the visitor tick the consent box before it sends, so every lead here has consented.
    if (SEND_THANK_YOU) try { mail_(leadOf_(lead, rowNum), markerOf_(sh, rowNum, heads)); } catch (err) { console.error('thank-you step failed, row ' + rowNum + ': ' + err); }
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

const leadOf_ = (l, row) => ({ key: l.id || 'row-' + row, name: l.firstName + ' ' + l.lastName, firstName: l.firstName, email: l.email, consent: true });
const markerOf_ = (sh, row, heads) => { const cell = sh.getRange(row, heads.indexOf(MARK) + 1); return { get: () => String(cell.getValue()), set: (v) => cell.setValue(v) }; };

// The columns wanted: the thank-you marker column exists only while the thank-you is on, so the Sheet is untouched while it is off.
const wanted_ = () => (SEND_THANK_YOU ? HEADERS.concat(MARK) : HEADERS);

// Row 1 as the list of headers. An empty Sheet gets HEADERS; otherwise any header missing from row 1 is added at the right and Έλη's own order stays.
function headers_(sh) {
  if (!sh.getLastRow()) {
    sh.getRange(1, 1, 1, wanted_().length).setValues([wanted_()]).setFontWeight('bold');
    return wanted_();
  }
  const heads = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const missing = wanted_().filter((h) => !heads.includes(h));
  if (missing.length) sh.getRange(1, heads.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return heads.concat(missing);
}

// The last 3 rows as dryRun (thank-you.gs) wants them.
function recentLeads_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[0], heads = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const last = sh.getLastRow(), first = Math.max(2, last - 2), at = (r, h) => (heads.includes(h) ? String(r[heads.indexOf(h)]) : '');
  return last < 2 ? [] : sh.getRange(first, 1, last - first + 1, heads.length).getValues().map((r, i) => ({ row: first + i, marker: at(r, MARK),
    lead: { name: at(r, 'First name') + ' ' + at(r, 'Last name'), firstName: at(r, 'First name'), email: at(r, 'Email'), consent: true } }));
}

const reply_ = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
