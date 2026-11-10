// Standalone thank-you mailer for easyInfluencer. Its own Apps Script project, owned by info@easyinfluencer.travel: it reads the leads Sheet by id and sends from that mailbox with GmailApp.
// It does not touch the kiosk, the Form or the capture script. LIVE: SEND_THANK_YOU is true and a 5-minute trigger runs sendPending once installTrigger() has been run (see mailer-standalone-README.md). Off: set it to false and run removeTrigger().
// Per row without a «Thank-you sent» marker: validate the address, write the marker BEFORE sending, send, write the result. Never twice, and a failed send is not retried.
// Editor functions: dryRun() (logs what would be sent per row, row numbers only, sends nothing), sendTestMail() (one mail to GEORGE only), installTrigger() / removeTrigger() (every 5 minutes).
// The pure parts (plan_, deliver_, fill_, validAddress_, leadOf_) are checked by mailer-check.mjs.
const SEND_THANK_YOU = true;
const SHEET_ID = '1W6Uv9fzaKaj5WCOwPIxUf--i-xY-oY-llLYTBLV93xk'; // Έλη's Sheet "WebSummit Lisbon 2026 - Questionnaire Leads"; this account needs Editor access (the marker column is written there)
const FIRST_ROW = 8; // rows above this are never mailed (rows 2 to 6 are test rows from 6 Nov, row 7 is a keyboard-mash entry from 10 Nov 10:12, none start with TEST). Check it against dryRun() before switching on
const SENDER = { name: 'easyInfluencer', email: 'info@easyinfluencer.travel' }; // the script must run as this account, see assertSender_
const SUBJECT = 'Thank you for visiting easyInfluencer at Web Summit';
const OFFER_TEXT = 'Use code WEBSUMMIT26 for 50% off your first paid month, valid until 17 Nov.'; // the voucher line; empty drops it from both versions
const POSTAL_ADDRESS = ''; // company address for the footer; empty drops it
const GEORGE = 'george.koulouris@renfluence.com'; // the only address a TEST lead or the test mail can reach
const MARK = 'Thank-you sent'; // Sheet column, added at the right on the first real send. Empty = never tried; anything else = tried once, never again
const DAILY_CAP = 300; // thank-yous per day (Workspace allows 1500 recipients a day)
const PER_RUN = 40; // rows per run, well inside Apps Script's 6 minutes

const TEXT = `Hi {{first_name}},

Thanks for stopping by our booth at Web Summit Lisbon (Pavilion 1, A2-66). If you want to continue the conversation, just reply to this email, it goes straight to our team.

{{voucher_line}}

What we do
easyInfluencer connects hotels with creators who bring real bookings and content.
We match each hotel with the right creators.

Thanks again,
The easyInfluencer team
https://easyinfluencer.travel/web-summit?utm_source=email&utm_medium=thankyou&utm_campaign=websummit

--
If this is not for you, reply 'no' and we will not write again.
easyInfluencer · info@easyinfluencer.travel{{postal_address}}
`;

const HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>easyInfluencer at Web Summit Lisbon</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table, td, div, p, a { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
<style>
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a { color: #0D1830; }
  @media only screen and (max-width: 620px) {
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .h1 { font-size: 26px !important; line-height: 32px !important; }
    .btn-td { display: block !important; width: 100% !important; }
    .btn-a { display: block !important; padding-left: 12px !important; padding-right: 12px !important; }
    .outer-pad { padding: 18px 10px !important; }
  }
  /* darkproof */
  :root { color-scheme: light only; supported-color-schemes: light only; }
  @media (prefers-color-scheme: dark) {
  .bgc-ff6600 { background-color: #ff6600 !important; background-image: linear-gradient(#ff6600,#ff6600) !important; }
  .bgc-ffffff { background-color: #ffffff !important; background-image: linear-gradient(#ffffff,#ffffff) !important; }
  .bgc-0d1830 { background-color: #0D1830 !important; background-image: linear-gradient(#0D1830,#0D1830) !important; }
  .bgc-fff4eb { background-color: #FFF4EB !important; background-image: linear-gradient(#FFF4EB,#FFF4EB) !important; }
  .c-ff6600 { color: #ff6600 !important; }
  .c-0d1830 { color: #0D1830 !important; }
  .c-0d1830 { color: #0D1830 !important; }
  .c-ffffff { color: #ffffff !important; }
  .c-5f646b { color: #5f646b !important; }
  .bd-ff6600 { border-color: #ff6600 !important; }
  }
  [data-ogsb] .bgc-ff6600 { background-color: #ff6600 !important; background-image: linear-gradient(#ff6600,#ff6600) !important; }
  [data-ogsb] .bgc-ffffff { background-color: #ffffff !important; background-image: linear-gradient(#ffffff,#ffffff) !important; }
  [data-ogsb] .bgc-0d1830 { background-color: #0D1830 !important; background-image: linear-gradient(#0D1830,#0D1830) !important; }
  [data-ogsb] .bgc-fff4eb { background-color: #FFF4EB !important; background-image: linear-gradient(#FFF4EB,#FFF4EB) !important; }
  [data-ogsc] .c-ff6600 { color: #ff6600 !important; }
  [data-ogsc] .c-0d1830 { color: #0D1830 !important; }
  [data-ogsc] .c-0d1830 { color: #0D1830 !important; }
  [data-ogsc] .c-ffffff { color: #ffffff !important; }
  [data-ogsc] .c-5f646b { color: #5f646b !important; }
  [data-ogsc] .bd-ff6600 { border-color: #ff6600 !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#FF6600; background-image:linear-gradient(#FF6600,#FF6600);" class="bgc-ff6600">

<!-- preheader: the grey preview line in the inbox -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#FF6600;" class="c-ff6600">
  Thanks for visiting easyInfluencer at Web Summit Lisbon.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;
</div>

<!-- Background: solid easy orange (bgcolor) always shows. The pattern is an extra that Gmail and Apple Mail draw, Outlook desktop skips. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FF6600" background="https://georgedakoul.github.io/ws-kiosk/email-pattern-easy.png" style="background-color:#FF6600; background-image:url('https://georgedakoul.github.io/ws-kiosk/email-pattern-easy.png'),linear-gradient(#FF6600,#FF6600); background-repeat:repeat;" class="bgc-ff6600">
  <tr>
    <td align="center" class="outer-pad" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">

        <!-- header: the logo is an orange pill with a white wordmark, so on the orange background only the wordmark shows (2px padding lines it up with the card text) -->
        <tr>
          <td align="left" class="hdr" style="padding:4px 2px 22px 2px;">
            <a href="https://easyinfluencer.travel/web-summit?utm_source=email&amp;utm_medium=thankyou&amp;utm_campaign=websummit" target="_blank" style="text-decoration:none;"><img src="https://easyinfluencer.travel/email-logo.png" width="200" height="39" alt="easyInfluencer" style="display:block; width:200px; height:auto; font-family:Futura, 'Century Gothic', Arial, Helvetica, sans-serif; font-size:24px; font-weight:bold; color:#0D1830;"></a>
          </td>
        </tr>

        <!-- card -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border-radius:16px; background-image:linear-gradient(#FFFFFF,#FFFFFF);" class="bgc-ffffff">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- accent bar -->
              <tr><td height="6" bgcolor="#0D1830" style="height:6px; line-height:6px; font-size:0; background-color:#0D1830; border-radius:16px 16px 0 0; background-image:linear-gradient(#0D1830,#0D1830);" class="bgc-0d1830">&nbsp;</td></tr>

              <!-- eyebrow + greeting -->
              <tr>
                <td class="pad c-0d1830" style="padding:36px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#0D1830;">
                  Web Summit Lisbon &middot; 10 to 12 Nov
                </td>
              </tr>
              <tr>
                <td class="pad h1 c-0d1830" style="padding:10px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:32px; line-height:38px; font-weight:bold; letter-spacing:-0.5px; color:#0D1830;">
                  Hi {{first_name}}, thanks for stopping by.
                </td>
              </tr>

              <!-- human intro -->
              <tr>
                <td class="pad c-0d1830" style="padding:18px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:16px; line-height:25px; color:#0D1830;">
                  It was good to meet you at our booth (Pavilion 1, A2-66) at Web Summit Lisbon. If you want to continue the conversation, just reply to this email, it goes straight to our team.
                </td>
              </tr>

              
              <!-- the one call to action -->
              <tr>
                <td class="pad" align="left" style="padding:28px 40px 0 40px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="btn-td bgc-0d1830" align="center" bgcolor="#0D1830" style="border-radius:12px; background-color:#0D1830; background-image:linear-gradient(#0D1830,#0D1830);">
                        <!--[if mso]>
                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://easyinfluencer.travel/web-summit?utm_source=email&amp;utm_medium=thankyou&amp;utm_campaign=websummit" style="height:54px; v-text-anchor:middle; width:520px;" arcsize="22%" stroke="f" fillcolor="#0D1830"><w:anchorlock xmlns:w="urn:schemas-microsoft-com:office:word"/><center style="color:#FFFFFF; font-family:Arial, sans-serif; font-size:17px; font-weight:bold;">Visit easyinfluencer.travel</center></v:roundrect>
                        <![endif]-->
                        <!--[if !mso]><!-->
                        <a class="btn-a bgc-0d1830 c-ffffff" href="https://easyinfluencer.travel/web-summit?utm_source=email&amp;utm_medium=thankyou&amp;utm_campaign=websummit" target="_blank" style="display:inline-block; padding:16px 32px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:17px; line-height:22px; font-weight:bold; color:#FFFFFF; text-decoration:none; border-radius:12px; background-color:#0D1830; background-image:linear-gradient(#0D1830,#0D1830);">Visit easyinfluencer.travel</a>
                        <!--<![endif]-->
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- voucher_line:start -->
              <tr>
                <td class="pad" style="padding:24px 40px 0 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                    <tr>
                      <td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border:2px solid #FF6600; border-radius:10px; padding:14px 18px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:15px; line-height:23px; font-weight:bold; color:#0D1830; background-image:linear-gradient(#FFFFFF,#FFFFFF);" class="bgc-ffffff c-0d1830 bd-ff6600">
                        {{voucher_line}}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <!-- voucher_line:end -->

              <!-- what we do -->
              <tr>
                <td class="pad" style="padding:32px 40px 0 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#FFF4EB" style="background-color:#FFF4EB; border-left:4px solid #FF6600; border-radius:10px; padding:18px 20px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:15px; line-height:23px; color:#0D1830; background-image:linear-gradient(#FFF4EB,#FFF4EB);" class="bgc-fff4eb c-0d1830 bd-ff6600">
                        <strong style="color:#0D1830; font-size:12px; letter-spacing:1.2px; text-transform:uppercase;" class="c-0d1830">What we do</strong><br>
                        easyInfluencer connects hotels with creators who bring real bookings and content.<br>
                        We match each hotel with the right creators.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- sign-off -->
              <tr>
                <td class="pad c-0d1830" style="padding:30px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:16px; line-height:25px; color:#0D1830;">
                  Thanks again,
                </td>
              </tr>
              <tr>
                <td class="pad c-0d1830" style="padding:6px 40px 40px 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:16px; line-height:22px; color:#0D1830;">
                  <strong>The easyInfluencer team</strong><br>
                  <a href="https://easyinfluencer.travel/web-summit?utm_source=email&amp;utm_medium=thankyou&amp;utm_campaign=websummit" target="_blank" style="color:#5F646B; font-size:14px; text-decoration:underline;" class="c-5f646b">easyinfluencer.travel</a>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- footer, on the orange background (ink text: white on orange is only 2.94:1) -->
        <tr>
          <td class="pad c-0d1830" align="left" style="padding:22px 8px 0 8px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#0D1830;">
            If this is not for you, reply &lsquo;no&rsquo; and we will not write again.<br>
            easyInfluencer &middot; info@easyinfluencer.travel{{postal_address}}
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>

</body>
</html>
`;

const validAddress_ = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@<>,;"()\[\]\\]+@[^\s@<>,;"()\[\]\\]+\.[^\s@<>,;"()\[\]\\]{2,}$/.test(s);
const esc_ = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Fills {{placeholders}}. An empty value also drops its <!-- name:start --> ... <!-- name:end --> block (HTML) or its line plus the blank after it (text).
function fill_(tpl, vars, escape) {
  let t = tpl;
  Object.keys(vars).filter((k) => !vars[k]).forEach((k) => {
    t = t.replace(new RegExp('[ \\t]*<!-- ' + k + ':start -->[\\s\\S]*?<!-- ' + k + ':end -->\\n?'), '').split('{{' + k + '}}\n\n').join('');
  });
  return t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? (escape ? escape(vars[k]) : vars[k]) : m));
}


// A row as plan_ wants it. The kiosk page makes the visitor tick the consent box before it sends, so every row has consented. The first Sheet version had one «Name» column.
const leadOf_ = (at) => { const first = (at('First name') || at('Name').split(/\s+/)[0]).trim(), name = (at('First name') ? first + ' ' + at('Last name') : at('Name')).trim(); return { name, firstName: first, email: at('Email').trim(), consent: true }; };

// What would be sent, or why nothing is. Pure. testTo = Script Property TEST_TO.
function plan_(lead, testTo) {
  const no = (reason) => ({ send: false, reason });
  if (!validAddress_(lead.email)) return no('invalid email');
  if (!lead.consent) return no('no consent');
  let to = lead.email;
  if (String(lead.name).trim().startsWith('TEST')) { // a test lead never reaches a visitor's inbox: only George, and only when TEST_TO is his address
    if (testTo !== GEORGE) return no('test lead');
    to = GEORGE;
  }
  const vars = { first_name: String(lead.firstName || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'there', voucher_line: OFFER_TEXT, postal_address: POSTAL_ADDRESS ? ' · ' + POSTAL_ADDRESS : '' };
  return { send: true, to, subject: SUBJECT, text: fill_(TEXT, vars), html: fill_(HTML, vars, esc_) };
}

// Tries once, never twice. deps = { store: { get, set } (the row's marker), count, bump, recent, remember (address mailed in the last 6 hours), send(plan), now }.
// The marker is written BEFORE the send, so a crash or a re-run can cost a missing email but never a second one.
function deliver_(lead, testTo, deps) {
  if (deps.store.get()) return 'already tried';
  const p = plan_(lead, testTo);
  if (!p.send) { deps.store.set('skipped: ' + p.reason); return 'skipped: ' + p.reason; }
  if (deps.count() >= DAILY_CAP) return 'daily cap reached, left for the next run'; // no marker: tomorrow's run still sends it
  if (p.to !== GEORGE && deps.recent(p.to)) { deps.store.set('skipped: same address within 6 hours'); return 'skipped: same address'; }
  const stamp = deps.now.toISOString();
  deps.store.set('sending ' + stamp);
  deps.remember(p.to);
  try {
    deps.send(p);
    deps.bump();
    deps.store.set('sent ' + stamp);
    return 'sent';
  } catch (err) {
    deps.store.set('failed ' + stamp + ': ' + String(err && err.message || err).slice(0, 100));
    return 'failed';
  }
}

const send_ = (p) => GmailApp.sendEmail(p.to, p.subject, p.text, { htmlBody: p.html, name: SENDER.name, replyTo: SENDER.email });
const testTo_ = () => (PropertiesService.getScriptProperties().getProperty('TEST_TO') || '').trim();

// A copy of this project under another account would send as that account: stop.
function assertSender_() {
  const me = Session.getEffectiveUser().getEmail();
  if (me.toLowerCase() !== SENDER.email) throw new Error('Runs as ' + me + ', not ' + SENDER.email + ': nothing sent.');
}

function sheet_() { return SpreadsheetApp.openById(SHEET_ID).getSheets()[0]; }
const heads_ = (sh) => sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((h) => String(h).trim());

// Every row from FIRST_ROW as { row, marker, lead }. marker is '' while the column does not exist yet.
function rows_(sh) {
  const heads = heads_(sh), last = sh.getLastRow();
  if (last < FIRST_ROW) return [];
  const m = heads.indexOf(MARK);
  return sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, heads.length).getValues().map((r, i) => ({ row: FIRST_ROW + i, marker: m < 0 ? '' : String(r[m]).trim(),
    lead: leadOf_((h) => (heads.includes(h) ? String(r[heads.indexOf(h)]) : '')) }));
}

// The time trigger runs this. With SEND_THANK_YOU false it does nothing.
function sendPending() {
  if (SEND_THANK_YOU !== true) { console.log('SEND_THANK_YOU is false: nothing sent'); return; }
  assertSender_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.log('another run is busy'); return; }
  try {
    const sh = sheet_(), props = PropertiesService.getScriptProperties(), cache = CacheService.getScriptCache(), testTo = testTo_(), todo = rows_(sh).filter((r) => !r.marker).slice(0, PER_RUN);
    if (!todo.length) return;
    let c = heads_(sh).indexOf(MARK) + 1;
    if (!c) { c = sh.getLastColumn() + 1; sh.getRange(1, c).setValue(MARK).setFontWeight('bold'); }
    const day = new Date().toISOString().slice(0, 10), seen = (to) => 'ty:' + to.toLowerCase(); // the script cache keeps an entry 6 hours at most
    const counter = () => { const [d, n] = (props.getProperty('TY_COUNT') || '').split(':'); return d === day ? Number(n) || 0 : 0; };
    todo.forEach((r) => {
      const cell = sh.getRange(r.row, c);
      const res = deliver_(r.lead, testTo, { now: new Date(), send: send_, count: counter, bump: () => props.setProperty('TY_COUNT', day + ':' + (counter() + 1)),
        recent: (to) => !!cache.get(seen(to)), remember: (to) => cache.put(seen(to), '1', 21600),
        store: { get: () => String(cell.getValue()), set: (v) => { cell.setValue(v); SpreadsheetApp.flush(); } } }); // flush: "sending" must be saved before the mail goes
      console.log('row ' + r.row + ': ' + res);
    });
  } finally {
    lock.releaseLock();
  }
}

// In the editor: one real email to GEORGE only, to check the sender and how it looks. Ignores SEND_THANK_YOU; marks nothing; needs no Sheet.
function sendTestMail() {
  assertSender_();
  const p = plan_({ name: 'George Koulouris', firstName: 'George', email: GEORGE, consent: true }, '');
  send_(p);
  console.log('test mail sent to ' + GEORGE + ' from ' + SENDER.email);
}

// In the editor: logs what would be sent and sends nothing: the switches, the sample message, then the decision per row (row numbers only, no names or addresses).
function dryRun() {
  const testTo = testTo_(), sample = plan_({ name: 'Sample Visitor', firstName: 'Sam', email: GEORGE, consent: true }, testTo);
  console.log('SEND_THANK_YOU=' + SEND_THANK_YOU + ', runs as ' + Session.getEffectiveUser().getEmail() + ', from ' + SENDER.name + ' <' + SENDER.email + '>, reply-to ' + SENDER.email + ', TEST_TO ' + (testTo === GEORGE ? 'set' : 'not set') + ', first row ' + FIRST_ROW);
  console.log('subject "' + sample.subject + '"\n--- text ---\n' + sample.text);
  const tally = {};
  rows_(sheet_()).forEach((r) => {
    const p = plan_(r.lead, testTo), what = r.marker ? 'already ' + r.marker.split(' ')[0] : p.send ? 'would send' : 'would skip: ' + p.reason;
    console.log('row ' + r.row + ': ' + what);
    tally[what] = (tally[what] || 0) + 1;
  });
  console.log('summary: ' + JSON.stringify(tally));
}

function installTrigger() { removeTrigger(); ScriptApp.newTrigger('sendPending').timeBased().everyMinutes(5).create(); }
function removeTrigger() { ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'sendPending').forEach((t) => ScriptApp.deleteTrigger(t)); }
