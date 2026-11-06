// Standalone Apps Script "easyInfluencer kiosk writer" owned by george.koulouris@renfluence.com (copy of what runs there). It is not bound to the
// Sheet because an editor of Έλη's Sheet cannot deploy a script bound to it ("You do not have permission"), so it opens the Sheet by id.
// Deployed as a web app: execute as George, access for anyone. The kiosk POSTs one lead as text/plain JSON.
// Appends one row to the first tab. Owner is always Έλη. Sends the thank-you email only when SEND_THANK_YOU is true (it is not yet).
const SHEET_ID = '1W6Uv9fzaKaj5WCOwPIxUf--i-xY-oY-llLYTBLV93xk'; // Έλη's Sheet "WebSummit Lisbon 2026 - Questionnaire Leads"
const OWNER = 'Έλη';
// The columns of a fresh Sheet. Rows are written by header name, so an older Sheet keeps its order: missing headers are added at the
// right, and a legacy "Name" column (the first version of the Sheet) keeps getting "First Last".
const HEADERS = ['Timestamp', 'First name', 'Last name', 'Email', 'Phone', 'Business type', 'Hotels / villas', 'Done influencer marketing', 'Tablet', 'Owner'];
const TYPES = ['Hotel', 'Hotel group', 'Property owner', 'Management company', 'Agency'];
const PROPERTIES = ['1', '2 to 5', '6 to 20', '20+'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Thank-you email: OFF until George gives the text and the no-reply sender is set up (see sendThankYou_).
const SEND_THANK_YOU = false;
const NO_REPLY_FROM = 'no-reply@easyinfluencer.travel'; // placeholder: must be a "Send mail as" alias of the account that runs this script
const THANK_YOU_SUBJECT = 'Thank you for visiting easyInfluencer at Web Summit'; // placeholder
const THANK_YOU_BODY = 'Hi {firstName},\n\nThank you for stopping by our booth at Web Summit Lisbon 2026. We will be in touch soon.\n\neasyInfluencer'; // placeholder, {firstName} is replaced

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
      'Done influencer marketing': lead.influencer, 'Tablet': lead.tablet, 'Owner': OWNER };
    const heads = headers_(sh);
    const row = heads.map((h) => (h in values ? values[h] : ''));
    // Plain text format first: otherwise Sheets turns "2 to 5" into a date, "+30..." into a number and "=..." into a formula.
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    if (lead.id) cache.put(lead.id, '1', 21600);
    // The row is saved: a failed email must not fail the lead (the kiosk would resend it and the row would double).
    if (SEND_THANK_YOU) try { sendThankYou_(lead.email, lead.firstName); } catch (err) { console.error('thank-you email failed: ' + err); }
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Row 1 as the list of headers. An empty Sheet gets HEADERS; otherwise any header missing from row 1 is added at the right and Έλη's own order stays.
function headers_(sh) {
  if (!sh.getLastRow()) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    return HEADERS.slice();
  }
  const heads = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const missing = HEADERS.filter((h) => !heads.includes(h));
  if (missing.length) sh.getRange(1, heads.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return heads.concat(missing);
}

// Sends the fixed thank-you through Gmail from the no-reply alias. Needs, once: the alias NO_REPLY_FROM added in Gmail "Send mail as" (and verified)
// on the account that runs this script, and that account authorising the script's Gmail permission. Without the alias GmailApp throws and nothing is sent.
function sendThankYou_(email, firstName) {
  GmailApp.sendEmail(email, THANK_YOU_SUBJECT, THANK_YOU_BODY.replace('{firstName}', firstName), { from: NO_REPLY_FROM, name: 'easyInfluencer', noReply: true });
}

const reply_ = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
