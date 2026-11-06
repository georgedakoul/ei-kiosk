// Standalone Apps Script "easyInfluencer kiosk writer" owned by george.koulouris@renfluence.com (copy of what runs there). It is not bound to the
// Sheet because an editor of Έλη's Sheet cannot deploy a script bound to it ("You do not have permission"), so it opens the Sheet by id.
// Deployed as a web app: execute as George, access for anyone. The kiosk POSTs one lead as text/plain JSON.
// Appends one row to the first tab. Sends no mail. Owner is always Έλη.
const SHEET_ID = '1W6Uv9fzaKaj5WCOwPIxUf--i-xY-oY-llLYTBLV93xk'; // Έλη's Sheet "WebSummit Lisbon 2026 - Questionnaire Leads"
const OWNER = 'Έλη';
const HEADERS = ['Timestamp', 'Name', 'Email', 'Phone', 'Hotels / villas', 'Done influencer marketing', 'Tablet', 'Owner'];
const PROPERTIES = ['1', '2 to 5', '6 to 20', '20+'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const text = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const lead = { id: text(d.id, 80), name: text(d.name, 120), email: text(d.email, 120), phone: text(d.phone, 40), properties: text(d.properties, 10),
      influencer: text(d.influencer, 3), tablet: text(d.tablet, 60), ts: new Date(d.ts) };
    if (!lead.name || !EMAIL.test(lead.email) || !PROPERTIES.includes(lead.properties) || !['Yes', 'No'].includes(lead.influencer)) return reply_({ ok: false, error: 'invalid' });
    // The kiosk resends a lead whose first answer it never saw: the id makes the second POST a no-op.
    const cache = CacheService.getScriptCache();
    if (lead.id && cache.get(lead.id)) return reply_({ ok: true, duplicate: true });

    const sh = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    // Headers are written only into an empty Sheet. If Έλη has set her own, they stay and the row follows the column order above.
    if (!sh.getLastRow()) sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    const when = isNaN(lead.ts) ? new Date() : lead.ts; // the time the visitor sent it, even when it queued offline
    const row = [Utilities.formatDate(when, 'Europe/Athens', 'yyyy-MM-dd HH:mm:ss'), lead.name, lead.email, lead.phone, lead.properties, lead.influencer, lead.tablet, OWNER];
    // Plain text format first: otherwise Sheets turns "2 to 5" into a date, "+30..." into a number and "=..." into a formula.
    sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
    if (lead.id) cache.put(lead.id, '1', 21600);
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

const reply_ = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
