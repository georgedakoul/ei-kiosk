// Thank-you email for easyInfluencer visitors who typed their email on the kiosk. Second file of the Apps Script project, next to sheet-writer.gs.
// OFF by default, twice: SEND_THANK_YOU must be true AND the Script Property EMAIL_PROVIDER_KEY must exist, or nothing is sent (the lead is saved either way).
// The key is a Script Property (Project Settings, Script Properties), never code. The pure parts (plan_, deliver_, request_, fill_, validAddress_) are
// checked by mail-check.mjs; mail_, send_ and config_ are the only parts that touch Apps Script services.
// Scopes: UrlFetchApp needs https://www.googleapis.com/auth/script.external_request (and GmailApp, the fallback, full Gmail access). A new scope must be
// authorised once by the owner in the editor BEFORE a new version is deployed, otherwise the live script stops with an authorisation error.
const SEND_THANK_YOU = false;
const PROVIDERS = ['resend', 'mailersend', 'gmail']; // gmail = the account that runs the script sends as the info@ alias (fallback)
const DEFAULT_PROVIDER = 'resend'; // the Script Property EMAIL_PROVIDER overrides it
const SENDER = { name: 'easyInfluencer', email: 'info@easyinfluencer.travel' };
const SUBJECT = 'Thank you for visiting easyInfluencer at Web Summit';
const OFFER_TEXT = 'Web Summit offer: code WEBSUMMIT26 gives 50% off your first paid month, valid until 17 Nov. Trial: 15 days, with a card.'; // the voucher line; empty drops it from both versions
const POSTAL_ADDRESS = ''; // company address for the footer; empty drops it
const GEORGE = 'george.koulouris@renfluence.com'; // the only address a TEST lead can be mailed to
const MARK = 'Thank-you sent'; // Sheet column: empty = never tried; anything else = tried once, never again
const DAILY_CAP = 300; // thank-yous per day: the endpoint is public, so this bounds what a stranger can make us send to third parties

const TEXT = `Hi {{first_name}},

Thanks for stopping by our booth at Web Summit Lisbon (Pavilion 1, A2-66). If you want to continue the conversation, just reply to this email, it goes straight to our team.

{{voucher_line}}

What we do
easyInfluencer connects hotels with creators who bring real bookings and content.
We match each hotel with the right creators.

Thanks again,
The easyInfluencer team
https://easyinfluencer.travel

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
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>easyInfluencer at Web Summit Lisbon</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table, td, div, p, a { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
<style>
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a { color: #16181B; }
  @media only screen and (max-width: 620px) {
    .pad { padding-left: 22px !important; padding-right: 22px !important; }
    .h1 { font-size: 26px !important; line-height: 32px !important; }
    .btn-td { display: block !important; width: 100% !important; }
    .btn-a { display: block !important; padding-left: 12px !important; padding-right: 12px !important; }
    .outer-pad { padding: 18px 10px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#FF6600;">

<!-- preheader: the grey preview line in the inbox -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#FF6600;">
  Thanks for visiting easyInfluencer at Web Summit Lisbon.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;
</div>

<!-- Background: solid easy orange (bgcolor) always shows. The pattern is an extra that Gmail and Apple Mail draw, Outlook desktop skips. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FF6600" background="https://georgedakoul.github.io/ws-kiosk/email-pattern-easy.png" style="background-color:#FF6600; background-image:url('https://georgedakoul.github.io/ws-kiosk/email-pattern-easy.png'); background-repeat:repeat;">
  <tr>
    <td align="center" class="outer-pad" style="padding:32px 16px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">

        <!-- header: the logo is an orange pill with a white wordmark, so on the orange background only the wordmark shows (2px padding lines it up with the card text) -->
        <tr>
          <td align="left" class="hdr" style="padding:4px 2px 22px 2px;">
            <img src="https://easyinfluencer.travel/email-logo.png" width="200" height="39" alt="easyInfluencer" style="display:block; width:200px; height:auto; font-family:Futura, 'Century Gothic', Arial, Helvetica, sans-serif; font-size:24px; font-weight:bold; color:#16181B;">
          </td>
        </tr>

        <!-- card -->
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border-radius:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- accent bar -->
              <tr><td height="6" bgcolor="#16181B" style="height:6px; line-height:6px; font-size:0; background-color:#16181B; border-radius:16px 16px 0 0;">&nbsp;</td></tr>

              <!-- eyebrow + greeting -->
              <tr>
                <td class="pad" style="padding:36px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#16181B;">
                  Web Summit Lisbon &middot; 10 to 12 Nov
                </td>
              </tr>
              <tr>
                <td class="pad h1" style="padding:10px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:32px; line-height:38px; font-weight:bold; letter-spacing:-0.5px; color:#16181B;">
                  Hi {{first_name}}, thanks for stopping by.
                </td>
              </tr>

              <!-- human intro -->
              <tr>
                <td class="pad" style="padding:18px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:16px; line-height:25px; color:#2B2E33;">
                  It was good to meet you at our booth (Pavilion 1, A2-66) at Web Summit Lisbon. If you want to continue the conversation, just reply to this email, it goes straight to our team.
                </td>
              </tr>

              
              <!-- the one call to action -->
              <tr>
                <td class="pad" align="left" style="padding:28px 40px 0 40px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="btn-td" align="center" bgcolor="#16181B" style="border-radius:12px; background-color:#16181B;">
                        <!--[if mso]>
                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://easyinfluencer.travel" style="height:54px; v-text-anchor:middle; width:520px;" arcsize="22%" stroke="f" fillcolor="#16181B"><w:anchorlock xmlns:w="urn:schemas-microsoft-com:office:word"/><center style="color:#FFFFFF; font-family:Arial, sans-serif; font-size:17px; font-weight:bold;">Visit easyinfluencer.travel</center></v:roundrect>
                        <![endif]-->
                        <!--[if !mso]><!-->
                        <a class="btn-a" href="https://easyinfluencer.travel" target="_blank" style="display:inline-block; padding:16px 32px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:17px; line-height:22px; font-weight:bold; color:#FFFFFF; text-decoration:none; border-radius:12px; background-color:#16181B;">Visit easyinfluencer.travel</a>
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
                      <td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border:2px solid #FF6600; border-radius:10px; padding:14px 18px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:15px; line-height:23px; font-weight:bold; color:#16181B;">
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
                      <td bgcolor="#FFF3EB" style="background-color:#FFF3EB; border-left:4px solid #FF6600; border-radius:10px; padding:18px 20px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:15px; line-height:23px; color:#16181B;">
                        <strong style="color:#16181B; font-size:12px; letter-spacing:1.2px; text-transform:uppercase;">What we do</strong><br>
                        easyInfluencer connects hotels with creators who bring real bookings and content.<br>
                        We match each hotel with the right creators.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- sign-off -->
              <tr>
                <td class="pad" style="padding:30px 40px 0 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:16px; line-height:25px; color:#2B2E33;">
                  Thanks again,
                </td>
              </tr>
              <tr>
                <td class="pad" style="padding:6px 40px 40px 40px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:16px; line-height:22px; color:#16181B;">
                  <strong>The easyInfluencer team</strong><br>
                  <span style="color:#5F646B; font-size:14px;">easyinfluencer.travel</span>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- footer, on the orange background (ink text: white on orange is only 2.94:1) -->
        <tr>
          <td class="pad" align="left" style="padding:22px 8px 0 8px; font-family:Futura, 'Century Gothic', 'Avenir Next', Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#16181B;">
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

// What would be sent, or why nothing is. Pure. lead = { name, firstName, email, consent }, cfg = { enabled, key, provider, testTo }.
function plan_(lead, cfg) {
  const no = (reason) => ({ send: false, reason });
  if (!cfg.enabled) return no('off');
  if (!cfg.key) return no('no key');
  if (!PROVIDERS.includes(cfg.provider)) return no('unknown provider');
  if (!validAddress_(lead.email)) return no('invalid email');
  if (!lead.consent) return no('no consent');
  let to = lead.email;
  if (String(lead.name).startsWith('TEST')) { // a test lead never reaches a visitor's inbox: only George, and only when TEST_TO is his address
    if (cfg.testTo !== GEORGE) return no('test lead');
    to = GEORGE;
  }
  const vars = { first_name: String(lead.firstName || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'there', voucher_line: OFFER_TEXT, postal_address: POSTAL_ADDRESS ? ' · ' + POSTAL_ADDRESS : '' };
  return { send: true, to, from: SENDER, replyTo: SENDER.email, subject: SUBJECT, provider: cfg.provider, text: fill_(TEXT, vars), html: fill_(HTML, vars, esc_) };
}

// The HTTP request for an API provider. Pure. idem makes a repeated request a no-op where the provider supports it (Resend).
function request_(p, key, idem) {
  if (p.provider === 'resend') {
    return { url: 'https://api.resend.com/emails', headers: { Authorization: 'Bearer ' + key, 'Idempotency-Key': idem },
      body: { from: `${p.from.name} <${p.from.email}>`, to: [p.to], reply_to: p.replyTo, subject: p.subject, html: p.html, text: p.text } };
  }
  return { url: 'https://api.mailersend.com/v1/email', headers: { Authorization: 'Bearer ' + key },
    body: { from: p.from, to: [{ email: p.to }], reply_to: { email: p.replyTo, name: p.from.name }, subject: p.subject, html: p.html, text: p.text } };
}

// Tries once, never twice. deps = { store: { get, set } (the row's marker), count, bump (today's sends), send(plan), now }. Returns what happened.
// The marker is written BEFORE the send, so a crash, a retry or a re-run can cost a missing email but never a second one.
function deliver_(lead, cfg, deps) {
  if (deps.store.get()) return 'already tried';
  const p = plan_(lead, cfg);
  if (!p.send) { if (p.reason !== 'off') deps.store.set('skipped: ' + p.reason); return 'skipped: ' + p.reason; }
  if (deps.count() >= DAILY_CAP) { deps.store.set('skipped: daily cap'); return 'skipped: daily cap'; }
  const stamp = deps.now.toISOString();
  deps.store.set('sending ' + stamp);
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

function config_() {
  const p = PropertiesService.getScriptProperties();
  return { enabled: SEND_THANK_YOU === true, key: (p.getProperty('EMAIL_PROVIDER_KEY') || '').trim(), provider: (p.getProperty('EMAIL_PROVIDER') || DEFAULT_PROVIDER).trim(), testTo: (p.getProperty('TEST_TO') || '').trim() };
}

function send_(p, key, idem) {
  if (p.provider === 'gmail') { // the account that runs the script needs p.from.email as a verified "Send mail as" alias, or GmailApp throws
    GmailApp.sendEmail(p.to, p.subject, p.text, { htmlBody: p.html, from: p.from.email, name: p.from.name, replyTo: p.replyTo });
    return;
  }
  const r = request_(p, key, idem);
  const res = UrlFetchApp.fetch(r.url, { method: 'post', contentType: 'application/json', headers: r.headers, payload: JSON.stringify(r.body), muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code < 200 || code > 299) { // the provider's own message names the problem; it does not contain our key
    let msg = ''; try { msg = JSON.parse(res.getContentText()).message || ''; } catch (e) { /* not JSON */ }
    throw new Error(p.provider + ' HTTP ' + code + (msg ? ' ' + String(msg).slice(0, 60) : ''));
  }
}

// The one entry the kiosk code calls, inside the script lock. store = the row's marker cell as { get, set }.
function mail_(lead, store) {
  const props = PropertiesService.getScriptProperties(), cfg = config_(), now = new Date(), day = now.toISOString().slice(0, 10);
  const counter = () => { const [d, n] = (props.getProperty('TY_COUNT') || '').split(':'); return d === day ? Number(n) || 0 : 0; };
  return deliver_(lead, cfg, { store, now, send: (p) => send_(p, cfg.key, lead.key), count: counter, bump: () => props.setProperty('TY_COUNT', day + ':' + (counter() + 1)) });
}

// For George, in the editor: one real email to GEORGE only, to check the key, the sender and how it looks. Needs the key; ignores SEND_THANK_YOU; marks nothing.
function sendTestMail() {
  const cfg = Object.assign(config_(), { enabled: true });
  const p = plan_({ name: 'George Koulouris', firstName: 'George', email: GEORGE, consent: true }, cfg);
  if (!p.send) throw new Error('Not sent: ' + p.reason + '. Set the Script Property EMAIL_PROVIDER_KEY first.');
  send_(p, cfg.key, 'test-' + Date.now());
  console.log('test mail sent to George through ' + p.provider);
}

// Logs what would be sent and sends nothing: the switches, the sample message, then the decision for the last 3 rows (row numbers only, no names or addresses).
function dryRun() {
  const cfg = Object.assign(config_(), { enabled: true }), sample = plan_({ name: 'Sample Visitor', firstName: 'Sam', email: GEORGE, consent: true }, cfg);
  console.log(`SEND_THANK_YOU=${SEND_THANK_YOU}, key set=${!!cfg.key}, provider=${cfg.provider}, TEST_TO ${cfg.testTo === GEORGE ? 'set' : 'not set'}`);
  console.log(sample.send ? `from ${sample.from.name} <${sample.from.email}>, reply-to ${sample.replyTo}, subject "${sample.subject}"\n--- text ---\n${sample.text}` : 'sample not sendable: ' + sample.reason);
  recentLeads_().forEach((r) => {
    const p = plan_(r.lead, cfg);
    console.log(`row ${r.row}: ` + (r.marker ? 'already ' + r.marker.split(' ')[0] : p.send ? 'would send' : 'would skip: ' + p.reason));
  });
}
