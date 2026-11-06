# ei-kiosk

The easyInfluencer lead form for the Web Summit Lisbon 2026 booth tablet (9 to 12 Nov). One static
`index.html`, no build, served by GitHub Pages at https://georgedakoul.github.io/ei-kiosk/.
Modelled on `ws-kiosk` (the Renfluence kiosk) but one form screen plus a thank-you, and no scoring.

- Logo (`logo.png`, the orange pill), fonts (`fonts/`, Cooper Black and Futura) and the copy lines come from
  the marketing site (`easyinfluencer.travel`). Do not redraw the logo, and add no claim the site does not make.
- All paths are relative and nothing reads the referrer or the path, so it works behind the redirect
  `easyinfluencer.travel/go/websummit` (which lives in the easyinfluencers app, not here). Query strings are ignored.
- No analytics, no third-party scripts, no CDN fonts. The only host it contacts is the Apps Script web app.

## Where leads go

- `index.html` POSTs each lead as `text/plain` JSON (no preflight, `no-cors`) to the Apps Script web app in
  `SCRIPT_URL`. `sheet-writer.gs` is a copy of that script: it appends one row to the first tab of Έλη's Sheet
  (id in the file), writing each value under its header name: Timestamp, First name, Last name, Email, Phone,
  Business type, Hotels / villas, Done influencer marketing, Tablet, Owner (always Έλη). It writes all headers into an
  empty Sheet, adds missing ones at the right of an existing one (the live Sheet kept its first five rows and its
  legacy Name column, which still gets "First Last"), and ignores a repeated `id`. The form asks the business type
  (Hotel, Hotel group, Property owner, Management company, Agency, required) first, and first and last name separately.
- The thank-you email (`sendThankYou_`, `GmailApp`, from `NO_REPLY_FROM`) is switched off by `SEND_THANK_YOU = false`; its
  text, subject and sender are placeholders. Switching it on needs the Gmail "Send mail as" alias and a one-time authorisation.
- The script is a standalone project owned by george.koulouris@renfluence.com, deployed as a web app (execute
  as George, access Anyone). It is not bound to the Sheet: an editor of that Sheet cannot deploy a bound script.
- Changing `sheet-writer.gs` means pasting it into that project and creating a **new version** of the existing
  deployment (Deploy, Manage deployments, edit). A "New deployment" gives a new URL, which then goes into `SCRIPT_URL`.

## Never lose a lead

- Each lead goes into `localStorage` `ei-kiosk-archive` (never trimmed) and `ei-kiosk-queue` before the thank-you
  shows. A lead leaves the queue only after the POST resolved. Retries every 30 s and on `online`.
- `?export` (team only, never linked): counts, Download CSV (UTF-8 BOM, Sheet column order, formula-looking text
  prefixed with `'`), Retry sending now, and the field «Όνομα tablet» (stored in `ei-kiosk-device`, posted as Tablet).
- A red banner shows when `localStorage` fails (private mode); leads then wait in memory for that page.
- Idle reset 90 s (only when something was entered), thank-you reset 25 s, **Next visitor** resets at once.
  `?idle=5&thanks=3` shortens them for testing.
- Layout scales with `rem` from `html { font-size: clamp(...) }`. Each side scrolls inside on short screens, never sideways.

## Check

`node check.mjs [url] [screenshot-dir]` runs headless Chrome: form, errors, filled form, thank-you and export at 8
sizes (1280x800, 800x1280, 1180x820, 820x1180, 390x844, 844x390, 1280x600, 600x1280) with a layout audit and
screenshots in `~/.local/state/pi-subagents/ei-kiosk-check/`, validation, the idle and thank-you resets, archive
and CSV export, private-mode storage, the offline queue, and that only the page and the web app are contacted.
The web app POST is intercepted. `LIVE=1` sends the offline-queue lead (name «TEST kiosk offline», tablet «TEST»)
to the real Sheet: delete that row after. `ONLY=1280x800` limits the sizes.
Healthy output ends with:

```
idle reset: ok
offline queue: ok, posts = 1 (intercepted)
PASS
```
